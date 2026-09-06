import fs from 'node:fs'
import { CURRENT_VERSION } from '../src/features/about/changelog.js'
import { estimateCeiling } from '../../backend/src/airport-model-comparison/model.js'
import { recordFixture } from '../../backend/test/fixtures/airport-model-comparison/records.js'

const sample=JSON.parse(fs.readFileSync(new URL('../../backend/test/fixtures/airport-model-comparison/rkpu-20260906-f009-derived.json',import.meta.url),'utf8'))
export const FIXED_NOW='2026-09-06T08:20:00.000Z'
export const SELECTED_TIME='2026-09-06T09:00:00.000Z'

// Only the RKPU 09Z numeric sample is derived from captured real data. The 13-hour
// horizon and peer 06Z runs are synthetic layout/lifecycle scenarios, not a forecast.
export function comparisonFixture({ scenario='ready', airport_icao='RKPU' }={}) {
  const models=['kim','ecmwf','gfs','icon'].map(model=>{
    const source=sample.rows.find(r=>r.model.toLowerCase()===model)
    const records=recordFixture({model,airport_icao,run_at:model==='ecmwf'?'2026-09-06T00:00:00.000Z':'2026-09-06T06:00:00.000Z',offset:model==='ecmwf'?6:0})
    for(const record of records) {
      Object.assign(record,{temperature_c:source.temp,relative_humidity_pct:source.rh,dew_point_c:source.dew,pressure_msl_hpa:source.pressure,
        wind_direction_deg:source.direction,wind_speed_kt:source.speed,wind_gust_kt:record.forecast_hour===0?null:source.gust,
        precipitation_mm:record.forecast_hour===0?null:source.rain,cloud_total_pct:source.cloud[0],cloud_low_pct:source.cloud[1],cloud_mid_pct:source.cloud[2],cloud_high_pct:source.cloud[3],
        ceiling_agl_ft:source.ceiling.value,ceiling_status:source.ceiling.status,grid_lat:source.grid.lat,grid_lon:source.grid.lon,grid_elevation_m:source.grid.elevation,
        source:'synthetic_horizon_with_RKPU_09Z_sample',ceiling_limit_ft:model==='gfs'?null:5000,ceiling_source_levels:model==='gfs'?[]:estimateCeiling({model,grid_elevation_m:source.grid.elevation,layers:source.layers.map(layer=>({pressure_hpa:layer.pressure,cloud_fraction:layer.cover/100,height_m:layer.heightAglM+source.grid.elevation,...(model==='kim'?{tqc_kgkg:layer.tqc,tqi_kgkg:layer.tqi}:{})}))}).ceiling_source_levels,temporal_method:model==='ecmwf'?'interpolated_hourly':'native_hourly'})
      if(model==='ecmwf') for(const field of ['cloud_low_pct','cloud_mid_pct','cloud_high_pct']) record.field_provenance[field].method='derived'
      for(const [field,provenance] of Object.entries(record.field_provenance)) provenance.missing_reason=record[field]===null?(record.forecast_hour===0 && ['precipitation_mm','wind_gust_kt'].includes(field)?'structural_f000':'not_provided'):null
    }
    if(model==='icon') { records[4].temperature_c=null;records[4].field_provenance.temperature_c.missing_reason='provider_missing';records[5].precipitation_mm=null;records[5].field_provenance.precipitation_mm.missing_reason='provider_missing';records[6].ceiling_agl_ft=null;records[6].ceiling_status='missing_input' }
    if(model==='gfs') { records[4].ceiling_agl_ft=null;records[4].ceiling_status='no_ceiling';records[4].field_provenance.ceiling_agl_ft.missing_reason='not_provided' }
    const {run_at,window_start_at,window_end_at,available_at,collected_at}=records[0]
    return {model,airport_icao,run_at,window_start_at,window_end_at,available_at,collected_at,revision:`synthetic-${model}-1`,records}
  })
  return {airport:{icao:airport_icao,name:airport_icao==='RKPU'?'울산공항':'인천국제공항',lat:sample.airport.lat,lon:sample.airport.lon,elevation_ft:43},effective_now:FIXED_NOW,revision:`fixture-${scenario}`,
    models:scenario==='empty'?[]:scenario==='partial'?models.filter(m=>m.model==='ecmwf'):models,status:scenario==='empty'?'empty':scenario==='partial'?'partial':'ready',issues:scenario==='partial'?[{model:'icon',code:'last_collection_failed'}]:[],
    observations:{metar:[{source:'METAR',observed_at:'2026-09-06T08:10:00.000Z',temperature_c:23,dew_point_c:18,wind_direction_deg:30,wind_speed_kt:9,wind_gust_kt:12,clouds:[],weather:[{raw:'-RA'}]}],
      amos:[{observed_at:'2026-09-06T07:00:00.000Z',precipitation_mm:0.2},{observed_at:'2026-09-06T08:00:00.000Z',precipitation_mm:0.4}],
      taf:{issued_at:'2026-09-06T05:00:00.000Z',valid_from:'2026-09-06T06:00:00.000Z',valid_to:'2026-09-07T06:00:00.000Z',base:{wind:{direction:30,speed:10,gust:15},wx:[],clouds:[]},change_groups:[{type:'TEMPO',start:'2026-09-06T09:00:00.000Z',end:'2026-09-06T11:00:00.000Z',wind:{direction:40,speed:14,gust:20},wx:[{raw:'RA'}],clouds:[]}]}}}
}

export async function installModelComparisonFixture(page,{scenario='ready'}={}) {
  let state=scenario,requests=0,effectiveNow=FIXED_NOW
  await page.addInitScript(version=>{localStorage.setItem('amo.tour.v1.done','true');localStorage.setItem('projectamo:lastSeenVersion',version);localStorage.setItem('time_zone','KST')},CURRENT_VERSION)
  await page.route('**/api/demo-mode',route=>route.fulfill({json:{on:true,now:FIXED_NOW}}))
  await page.route('**/api/airport/*/model-comparison',route=>{
    requests++
    if(state==='error') return route.fulfill({status:503,json:{error:'fixture_refresh_failed'}})
    const airport_icao=new URL(route.request().url()).pathname.split('/')[3]
    return route.fulfill({json:{...comparisonFixture({scenario:state,airport_icao}),effective_now:effectiveNow}})
  })
  return {setScenario(value){state=value},setNow(value){effectiveNow=value},get requests(){return requests}}
}
