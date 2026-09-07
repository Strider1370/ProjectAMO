import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { buildAirportComparison, buildHourlyAmosRainfall, handleAirportComparison } from '../src/airport-model-comparison/service.js'
import { buildAmosHourlySamples } from '../src/processors/amos-processor.js'
import { publishAirportWindow } from '../src/airport-model-comparison/store.js'
import { recordFixture } from './fixtures/airport-model-comparison/records.js'
import { normalizeOpenMeteoAirport } from '../src/airport-model-comparison/open-meteo.js'
import { normalizeGfsHour } from '../src/airport-model-comparison/gfs.js'
import { parseGfsGrib2 } from '../src/parsers/gfs-grib2-parser.js'
import { collectKimAirportComparison } from '../src/airport-model-comparison/kim.js'

function rootFor(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'comparison-api-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root}
function write(root,file,data){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),JSON.stringify(data))}

test('production adapters publish through real store and API; synthetic horizons are explicit',async t=>{
  const root=rootFor(t), airport={icao:'RKSI',lat:37.46,lon:126.44}
  const dir=path.join(import.meta.dirname,'fixtures/airport-model-comparison')
  const run_at='2026-09-06T00:00:00.000Z',window={start_at:run_at,end_at:'2026-09-06T12:00:00.000Z',forecast_hours:Array.from({length:13},(_,i)=>i)}
  for(const [model,file] of [['ecmwf','open-meteo-ecmwf-rksi-f000-f018.json'],['icon','open-meteo-icon-rksi-f000-f012-synthetic.json']]) {
    const records=normalizeOpenMeteoAirport({payload:JSON.parse(fs.readFileSync(path.join(dir,file))),airport,model,run_at,window,available_at:null,collected_at:'2026-09-06T08:20:00Z'})
    publishAirportWindow({root,model,airport_icao:'RKSI',run_at,window,records})
  }
  const files=fs.readdirSync(dir),f8=files.find(f=>/f008.*grib2$/.test(f)),f9=files.find(f=>/f009.*grib2$/.test(f))
  const actual=normalizeGfsHour({airport,messages:parseGfsGrib2(fs.readFileSync(path.join(dir,f9))),previousMessages:parseGfsGrib2(fs.readFileSync(path.join(dir,f8))),run_at,forecast_hour:9,window,available_at:null,collected_at:'2026-09-06T08:20:00Z'})
  // Only F009 has real raw support here; the surrounding validation horizon is synthetic.
  const gfs=recordFixture({model:'gfs',airport_icao:'RKSI',run_at});gfs[9]=actual
  publishAirportWindow({root,model:'gfs',airport_icao:'RKSI',run_at,window,records:gfs})
  const grid=value=>({nx:2,ny:2,bounds:{lonMin:126,lonMax:127,latMin:37,latMax:38,dx:1,dy:1},values:[value,value,value,value]})
  const report=await collectKimAirportComparison({root,airports:[airport],tmfc:'2026090600',forecastHours:window.forecast_hours,loadHour:async()=>({revision:'synthetic-grid',surface:Object.fromEntries(Object.entries({u10m:2,v10m:3,t2m:296.15,td2m:291.15,rh2m:74,psl:100800,topo:95,gust:5,pr:0,tcld:.8,lcld:.7,mcld:.3,hcld:.1}).map(([k,v])=>[k,grid(v)])),layers:[{pressure_hpa:925,hgt:grid(800),cld:grid(.8),tqc:grid(2e-6),tqi:grid(0)}]})})
  assert.deepEqual(report.publishedAirports,['RKSI'])
  const result=buildAirportComparison({root,airport_icao:'RKSI',viewRevision:'adapter-integration',nowMs:Date.parse('2026-09-06T08:20:00Z')})
  assert.equal(result.status,'ready');assert.deepEqual(result.models.map(m=>m.model),['kim','ecmwf','gfs','icon'])
  assert.ok(result.models.every(m=>m.records.length===13))
  assert.equal(result.models.find(m=>m.model==='gfs').records[9].ceiling_status,'no_ceiling')
})
test('AMOS uses exact hourly source rows and never turns midnight reset or missing prior into dry weather',()=>{
  const samples=buildAmosHourlySamples([{tm:'202609061700',rn_raw:32},{tm:'202609061730',rn_raw:40},{tm:'202609061800',rn_raw:44}])
  assert.equal(samples.length,2);assert.equal(samples[0].observed_at,'2026-09-06T08:00:00.000Z')
  assert.ok(Math.abs(buildHourlyAmosRainfall(samples)[1].precipitation_mm-1.2)<1e-9)
  assert.equal(buildHourlyAmosRainfall(samples)[0].precipitation_mm,null)
  for(const totals of [[32,21],[70,0]]) {
    const rows=totals.map((rn_raw,i)=>({tm:totals[0]===70?['202609062300','202609070000'][i]:['202609061700','202609061800'][i],rn_raw}))
    assert.equal(buildHourlyAmosRainfall(buildAmosHourlySamples(rows))[1].precipitation_mm,null)
  }
})
test('service reads actual observations and complete model from the supplied view only',t=>{
  const root=rootFor(t),records=recordFixture()
  publishAirportWindow({root,model:'icon',airport_icao:'RKPU',run_at:records[0].run_at,window:{start_at:records[0].window_start_at,end_at:records[0].window_end_at,forecast_hours:records.map(r=>r.forecast_hour)},records})
  const report={header:{observation_time:'2026-09-06T08:10:00Z',issue_time:'2026-09-06T08:12:00Z'},observation:{temperature:{air:23,dewpoint:18},wind:{direction:230,speed:8,gust:12},clouds:[],weather:[{raw:'-RA'}]}}
  write(root,'metar/METAR_01.json',{fetched_at:'2026-09-06T08:15:00Z',airports:{RKPU:report}})
  write(root,'metar/METAR_02.json',{fetched_at:'2026-09-06T08:20:00Z',airports:{RKPU:report}})
  write(root,'metar/latest.json',{fetched_at:'2026-09-06T08:20:00Z',airports:{RKPU:report}})
  write(root,'taf/latest.json',{airports:{RKPU:{header:{issued:'2026-09-06T05:00:00Z',valid_start:'2026-09-06T06:00:00Z',valid_end:'2026-09-07T06:00:00Z'},base:{wx:[]},change_groups:[{type:'TEMPO',start:'2026-09-06T09:00:00Z',end:'2026-09-06T10:00:00Z',wx:[{raw:'RA'}]}]}}})
  const input={root,airport_icao:'RKPU',viewRevision:'live-1',nowMs:Date.parse('2026-09-06T08:20:00Z')}, result=buildAirportComparison(input)
  assert.equal(result.status,'partial');assert.equal(result.observations.metar.length,1)
  assert.equal(result.observations.metar[0].observed_at,'2026-09-06T08:10:00.000Z')
  assert.equal(result.observations.metar[0].temperature_c,23)
  assert.equal(result.observations.taf.change_groups[0].type,'TEMPO')
  assert.notEqual(buildAirportComparison({...input,viewRevision:'demo-2'}).revision,result.revision)
  assert.equal(buildAirportComparison({...input,root:rootFor(t)}).status,'empty')
  assert.equal(buildAirportComparison({...input,airport_icao:'RKPK'}).observations.amos.length,0)
  assert.ok(!JSON.stringify(result).includes(root))
})
test('HTTP comparison validates ICAO, empty data, cache policy and view transition retry',t=>{
  const root=rootFor(t)
  const response=()=>({code:200,headers:{},status(v){this.code=v;return this},set(k,v){this.headers[k]=v;return this},json(v){this.body=v;return this}})
  const context=()=>({root,revision:'view1'}), now=()=>new Date('2026-09-06T08:20:00Z')
  for(const [icao,code] of [['12',400],['RJAA',404],['rkpu',200]]) {
    const res=response();handleAirportComparison({params:{icao}},res,{getContext:context,getNow:now});assert.equal(res.code,code)
    if(code===200){assert.equal(res.body.status,'empty');assert.equal(res.headers['Cache-Control'],'private, no-cache')}
  }
  let i=0;const res=response();handleAirportComparison({params:{icao:'RKPU'}},res,{getContext:()=>({root,revision:String(i++)}),getNow:now});assert.equal(res.code,503)
})

test('registered Express endpoint serves the actual disk-backed service without collection',t=>{
  const root=rootFor(t)
  const output=execFileSync(process.execPath,['--input-type=module','-e',`
    const {app}=await import('./backend/server.js');
    const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    const results=[];
    for(const icao of ['RKPU','RJAA','12']){const response=await fetch(base+'/api/airport/'+icao+'/model-comparison');results.push({status:response.status,cache:response.headers.get('cache-control'),body:await response.json()})}
    await new Promise(r=>server.close(r));console.log('RESULT:'+JSON.stringify(results));
  `],{cwd:path.resolve(import.meta.dirname,'../..'),env:{...process.env,NODE_ENV:'test',DATA_PATH:root},encoding:'utf8',timeout:20000})
  const results=JSON.parse(output.split('RESULT:')[1])
  assert.deepEqual(results.map(r=>r.status),[200,404,400]);assert.equal(results[0].body.status,'empty');assert.equal(results[0].cache,'private, no-cache')
})

test('a corrupt-only model is an actionable partial failure, not an empty store',t=>{
  const root=rootFor(t);write(root,'airport_model_comparison/icon/latest.json',{schema_version:99})
  const result=buildAirportComparison({root,airport_icao:'RKPU',viewRevision:'broken',nowMs:Date.parse('2026-09-06T08:20:00Z')})
  assert.equal(result.status,'partial');assert.equal(result.issues[0].code,'comparison_read_failed')
})

test('actual HTTP API follows snapshot activation and returns to newly collected live data',t=>{
  const root=rootFor(t)
  const output=execFileSync(process.execPath,['--input-type=module','-e',`
    import fs from 'node:fs';import path from 'node:path';
    const {app}=await import('./backend/server.js');
    const {recordFixture}=await import('./backend/test/fixtures/airport-model-comparison/records.js');
    const {publishAirportWindow}=await import('./backend/src/airport-model-comparison/store.js');
    const {saveSnapshot}=await import('./backend/src/dev/snapshot-store.js');
    const {activateDemoView,activateLiveView}=await import('./backend/src/dev/data-view.js');
    const root=process.env.DATA_PATH;
    const publish=temperature=>{const records=recordFixture().map(r=>({...r,temperature_c:temperature}));publishAirportWindow({root,model:'icon',airport_icao:'RKPU',run_at:records[0].run_at,window:{start_at:records[0].window_start_at,end_at:records[0].window_end_at,forecast_hours:records.map(r=>r.forecast_hour)},records})};
    publish(23);saveSnapshot(root,'comparison-demo');
    const metaFile=path.join(root,'snapshots/comparison-demo/meta.json');const meta=JSON.parse(fs.readFileSync(metaFile));meta.referenceTime='2026-09-06T08:20:00.000Z';fs.writeFileSync(metaFile,JSON.stringify(meta));
    const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const get=async()=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/airport/RKPU/model-comparison');const body=await response.json();return {status:response.status,temperature:body.models?.[0]?.records[0]?.temperature_c,revision:body.revision,now:body.effective_now}};
    const before=await get();publish(31);activateDemoView('comparison-demo');const demo=await get();publish(35);const stillDemo=await get();activateLiveView();const live=await get();
    await new Promise(r=>server.close(r));console.log('RESULT:'+JSON.stringify({before,demo,stillDemo,live}));
  `],{cwd:path.resolve(import.meta.dirname,'../..'),env:{...process.env,NODE_ENV:'test',DATA_PATH:root},encoding:'utf8',timeout:20000})
  const {before,demo,stillDemo,live}=JSON.parse(output.split('RESULT:')[1])
  assert.deepEqual([before,demo,stillDemo,live].map(r=>r.status),[200,200,200,200])
  assert.deepEqual([before,demo,stillDemo,live].map(r=>r.temperature),[23,23,23,35])
  assert.equal(demo.now,'2026-09-06T08:20:00.000Z');assert.equal(demo.revision,stillDemo.revision);assert.notEqual(demo.revision,before.revision)
})
