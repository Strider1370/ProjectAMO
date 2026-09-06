import path from 'node:path'
import config from '../config.js'
import { loadRecent, loadLatest } from '../store.js'
import { getActiveDataContext } from '../dev/data-view.js'
import { getEffectiveNow } from '../dev/demo-mode.js'
import { MODEL_COMPARISON_AIRPORTS, MODEL_ORDER } from '../../../shared/airport-model-comparison.js'
import { normalizeUtc, HOUR_MS } from './model.js'
import { readAirportComparison, contentRevision, readCollectionAttempt } from './store.js'

const finite = value => Number.isFinite(value) ? value : null
function utcOrNull(value) { try { return normalizeUtc(value) } catch { return null } }
function kstDate(iso) { return new Date(Date.parse(iso)+9*HOUR_MS).toISOString().slice(0,10) }

export function buildHourlyAmosRainfall(samples) {
  const ordered=[...samples].sort((a,b)=>a.observed_at.localeCompare(b.observed_at))
  const byTime=new Map(ordered.map(s=>[s.observed_at,s]))
  return ordered.map(sample=>{
    const previous=byTime.get(new Date(Date.parse(sample.observed_at)-HOUR_MS).toISOString())
    let missing_reason=null, precipitation_mm=null
    if (!previous || !Number.isFinite(previous.daily_total_mm) || !Number.isFinite(sample.daily_total_mm)) missing_reason='missing_input'
    else if(kstDate(previous.observed_at)!==kstDate(sample.observed_at)) missing_reason='daily_reset'
    else if(sample.daily_total_mm<previous.daily_total_mm) missing_reason='decreasing_accumulation'
    else precipitation_mm=sample.daily_total_mm-previous.daily_total_mm
    return {...sample,precipitation_mm,missing_reason}
  })
}

function snapshots(root,type) {
  const latest=loadLatest(path.join(root,type))
  return [...loadRecent(type,60,{root}),...(latest?[latest]:[])].sort((a,b)=>(Date.parse(a.fetched_at)||0)-(Date.parse(b.fetched_at)||0))
}
function metarRecord(report) {
  const observed_at=utcOrNull(report.header?.observation_time)
  if(!observed_at) return null
  const observation=report.observation || {}, wind=observation.wind || {}, temperature=observation.temperature || {}
  return {source:'METAR',observed_at,issued_at:utcOrNull(report.header?.issue_time),temperature_c:finite(temperature.air),dew_point_c:finite(temperature.dewpoint),
    wind_direction_deg:wind.variable ? null : finite(wind.direction),wind_speed_kt:finite(wind.speed),wind_gust_kt:finite(wind.gust),wind,
    weather:observation.weather || [],clouds:observation.clouds || [],visibility:observation.visibility || null,cavok_flag:report.cavok_flag ?? false,nsc_flag:report.nsc_flag ?? false,
    pressure_msl_hpa:finite(observation.qnh?.value)}
}

export function buildAirportComparison({ airport_icao, root, viewRevision, nowMs }) {
  if(!MODEL_COMPARISON_AIRPORTS.includes(airport_icao)) throw new Error('unsupported_airport')
  const airport=config.airports.find(a=>a.icao===airport_icao)
  const comparison=readAirportComparison({root,airport_icao}), metar=new Map(), amos=new Map()
  const since=nowMs-4*HOUR_MS
  for(const snapshot of snapshots(root,'metar')) {
    const record=metarRecord(snapshot.airports?.[airport_icao] || {})
    if(record && Date.parse(record.observed_at)<=nowMs && Date.parse(record.observed_at)>=since) metar.set(record.observed_at,record)
  }
  if(airport.amos_stn!=null) for(const snapshot of snapshots(root,'amos')) for(const sample of snapshot.airports?.[airport_icao]?.hourly_rainfall || []) {
    const observed_at=utcOrNull(sample.observed_at), ms=Date.parse(observed_at)
    if(observed_at && ms%HOUR_MS===0 && ms<=nowMs && ms>=since-HOUR_MS) amos.set(observed_at,{...sample,observed_at,daily_total_mm:finite(sample.daily_total_mm)})
  }
  let taf=null
  for(const snapshot of snapshots(root,'taf')) {
    const r=snapshot.airports?.[airport_icao],h=r?.header
    if(!h) continue
    const issued_at=utcOrNull(h.issued),valid_from=utcOrNull(h.valid_start),valid_to=utcOrNull(h.valid_end)
    if(issued_at && valid_from && valid_to && Date.parse(issued_at)<=nowMs && Date.parse(valid_to)>since && (!taf || issued_at>=taf.issued_at)) taf={issued_at,valid_from,valid_to,base:r.base || {},change_groups:r.change_groups || []}
  }
  const observations={metar:[...metar.values()].sort((a,b)=>a.observed_at.localeCompare(b.observed_at)),taf,amos:buildHourlyAmosRainfall([...amos.values()])}
  const issues=[...comparison.issues]
  for(const model of MODEL_ORDER) {
    const attempt=readCollectionAttempt({root,model})
    if(attempt?.failedAirports?.includes(airport_icao)) issues.push({model,code:'last_collection_failed'})
  }
  return {airport:{icao:airport.icao,name:airport.nameKo || airport.name,lat:airport.lat,lon:airport.lon,elevation_ft:airport.elevation_ft},
    effective_now:new Date(nowMs).toISOString(),revision:contentRevision({viewRevision,modelRevision:comparison.revision,observations,issues}),models:comparison.models,observations,
    status:issues.length || (comparison.models.length>0 && comparison.models.length<4)?'partial':comparison.models.length===4?'ready':'empty',issues}
}

export function handleAirportComparison(req,res,{getContext=getActiveDataContext,getNow=getEffectiveNow}={}) {
  const icao=String(req.params.icao).toUpperCase()
  if(!/^[A-Z]{4}$/.test(icao)) return res.status(400).json({error:'invalid_airport'})
  if(!MODEL_COMPARISON_AIRPORTS.includes(icao)) return res.status(404).json({error:'unsupported_airport'})
  try {
    for(let retry=0;retry<2;retry++) {
      const before=getContext(),nowMs=getNow().getTime()
      const payload=buildAirportComparison({airport_icao:icao,root:before.root,viewRevision:before.revision,nowMs})
      const after=getContext()
      if(before.revision===after.revision && before.root===after.root) {res.set('Cache-Control','private, no-cache');return res.json(payload)}
    }
    return res.status(503).json({error:'data_view_changed'})
  } catch { return res.status(503).json({error:'comparison_unavailable'}) }
}
