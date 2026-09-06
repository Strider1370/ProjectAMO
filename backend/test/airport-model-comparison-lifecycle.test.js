import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { isNwpCollectionDue, collectNwpModel } from '../src/airport-model-comparison/lifecycle.js'
import { publishAirportWindow, readAirportComparison, readCollectionAttempt } from '../src/airport-model-comparison/store.js'
import { recordFixture } from './fixtures/airport-model-comparison/records.js'
import { runWithLock } from '../src/index.js'
const airports=[{icao:'RKPU'}]
test('KIM base success cannot mask a failed comparison supplement in collector execution',async()=>{
  const events=[]
  const stats={recordStart:()=>({}),recordSuccess:()=>events.push('success'),recordSkip:()=>events.push('skip'),recordFailure:()=>events.push('failure')}
  await runWithLock('kim_surface_wind',async()=>({saved:true,comparison:{failedAirports:['RKPU']}}),{stats,logger:{}})
  assert.deepEqual(events,['failure'])
})
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'comparison-life-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root}
function publish(root,model,run_at,offset=0){const records=recordFixture({model,run_at,offset});publishAirportWindow({root,model,airport_icao:'RKPU',run_at,window:{start_at:records[0].window_start_at,end_at:records[0].window_end_at,forecast_hours:records.map(r=>r.forecast_hour)},records})}
test('empty or dishonest adapter success cannot become a successful collection',async t=>{
  for(const claimed of [[],['RKPU'],['RKPU','RKPU'],['RKSI']]) {
    const root=setup(t)
    await assert.rejects(()=>collectNwpModel({root,model:'icon',airports,nowMs:Date.parse('2026-09-06T08:00:00Z'),adapter:async()=>({model:'icon',publishedAirports:claimed,reusedAirports:[],failedAirports:[],errors:[],deferred:false})}),/nwp_collection_incomplete/)
    assert.deepEqual(readCollectionAttempt({root,model:'icon'}).failedAirports,['RKPU'])
  }
})
test('disk due honors publication delay, complete windows, peer anchor movement and OFF',t=>{
  const root=setup(t);publish(root,'ecmwf','2026-09-05T18:00:00.000Z')
  assert.equal(isNwpCollectionDue({root,model:'ecmwf',airports,nowMs:Date.parse('2026-09-06T07:30:00Z')}),false)
  assert.equal(isNwpCollectionDue({root,model:'ecmwf',airports,nowMs:Date.parse('2026-09-06T07:40:00Z')}),true)
  publish(root,'ecmwf','2026-09-06T00:00:00.000Z')
  assert.equal(isNwpCollectionDue({root,model:'ecmwf',airports,nowMs:Date.parse('2026-09-06T08:00:00Z')}),false)
  publish(root,'icon','2026-09-06T06:00:00.000Z')
  assert.equal(isNwpCollectionDue({root,model:'ecmwf',airports,nowMs:Date.parse('2026-09-06T08:00:00Z')}),true)
  publish(root,'ecmwf','2026-09-06T00:00:00.000Z',6)
  assert.equal(isNwpCollectionDue({root,model:'ecmwf',airports,nowMs:Date.parse('2026-09-06T08:00:00Z')}),false)
  assert.equal(isNwpCollectionDue({root,model:'gfs',airports,nowMs:Date.now(),settings:{enabled:false}}),false)
})
test('two failed attempts preserve success and persist report before recovery; complete noop makes no request',async t=>{
  const root=setup(t);publish(root,'icon','2026-09-05T18:00:00.000Z');let calls=0
  const adapter=async()=>{calls++;if(calls<3)throw new Error('provider_unavailable');publish(root,'icon','2026-09-06T00:00:00.000Z');return {model:'icon',run_at:'2026-09-06T00:00:00Z',publishedAirports:['RKPU'],reusedAirports:[],failedAirports:[],windows:{},errors:[],deferred:false}}
  for(let i=0;i<2;i++) {
    await assert.rejects(()=>collectNwpModel({root,model:'icon',airports,nowMs:Date.parse('2026-09-06T05:00:00Z')+i*600000,adapter}),/nwp_collection_incomplete/)
    assert.equal(readAirportComparison({root,airport_icao:'RKPU'}).models[0].run_at,'2026-09-05T18:00:00.000Z')
    assert.deepEqual(readCollectionAttempt({root,model:'icon'}).failedAirports,['RKPU'])
  }
  await collectNwpModel({root,model:'icon',airports,nowMs:Date.parse('2026-09-06T05:20:00Z'),adapter})
  const attempt=readCollectionAttempt({root,model:'icon'})
  await collectNwpModel({root,model:'icon',airports,nowMs:Date.parse('2026-09-06T05:30:00Z'),adapter})
  assert.equal(calls,3);assert.deepEqual(readCollectionAttempt({root,model:'icon'}),attempt)
})
