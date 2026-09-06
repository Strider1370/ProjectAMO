import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { recordFixture } from './fixtures/airport-model-comparison/records.js'
import { publishAirportWindow, readAirportComparison, cleanupComparisonRuns, writeCollectionAttempt, readCollectionAttempt } from '../src/airport-model-comparison/store.js'

function setup(t) { const root=fs.mkdtempSync(path.join(os.tmpdir(),'comparison-store-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true})); return root }
function input(root, options={}) {
  const records=recordFixture(options), first=records[0]
  return {root, model:first.model, airport_icao:first.airport_icao, run_at:first.run_at, window:{start_at:first.window_start_at,end_at:first.window_end_at,forecast_hours:records.map(r=>r.forecast_hour)},records,metadata:{source:'synthetic_test'}}
}
test('incomplete publication preserves last complete airport, including two successful peers', t=>{
  const root=setup(t)
  for(const airport_icao of ['RKPU','RKSI','RKSS']) publishAirportWindow(input(root,{airport_icao}))
  const before=readAirportComparison({root,airport_icao:'RKSS'})
  for(const airport_icao of ['RKPU','RKSI']) publishAirportWindow(input(root,{airport_icao,run_at:'2026-09-06T12:00:00.000Z'}))
  const broken=input(root,{airport_icao:'RKSS',run_at:'2026-09-06T12:00:00.000Z'}); broken.records.pop()
  assert.throws(()=>publishAirportWindow(broken))
  assert.deepEqual(readAirportComparison({root,airport_icao:'RKSS'}),before)
  for(const airport_icao of ['RKPU','RKSI']) assert.equal(readAirportComparison({root,airport_icao}).models[0].run_at,'2026-09-06T12:00:00.000Z')
})
test('same EC run shifts immutable windows; retry collection time alone does not grow payloads',t=>{
  const root=setup(t), initial=input(root,{model:'ecmwf',run_at:'2026-09-06T00:00:00.000Z'})
  publishAirportWindow(initial)
  const before=readAirportComparison({root,airport_icao:'RKPU'})
  const moved=input(root,{model:'ecmwf',run_at:initial.run_at,offset:6})
  publishAirportWindow(moved)
  const after=readAirportComparison({root,airport_icao:'RKPU'})
  assert.notEqual(after.revision,before.revision)
  assert.equal(after.models[0].records.at(-1).forecast_hour,18)
  moved.records.forEach(r=>r.collected_at='2026-09-06T11:00:00.000Z')
  assert.equal(publishAirportWindow(moved).published,false)
  assert.equal(readAirportComparison({root,airport_icao:'RKPU'}).revision,after.revision)
})
test('unreferenced payload does not publish; corrupted model is isolated',t=>{
  const root=setup(t)
  publishAirportWindow(input(root)); publishAirportWindow(input(root,{model:'ecmwf'}))
  const before=readAirportComparison({root,airport_icao:'RKPU'})
  fs.writeFileSync(path.join(root,'airport_model_comparison/icon/orphan.json'),'{}')
  assert.deepEqual(readAirportComparison({root,airport_icao:'RKPU'}),before)
  fs.writeFileSync(path.join(root,'airport_model_comparison/icon/latest.json'),'{broken')
  const result=readAirportComparison({root,airport_icao:'RKPU'})
  assert.deepEqual(result.models.map(m=>m.model),['ecmwf'])
  assert.equal(result.issues[0].model,'icon')
})
test('cleanup protects all current airport references and removes expired runs',t=>{
  const root=setup(t)
  publishAirportWindow(input(root,{airport_icao:'RKSI',run_at:'2026-09-01T00:00:00.000Z'}))
  for(let day=2;day<=7;day++) publishAirportWindow(input(root,{run_at:`2026-09-0${day}T00:00:00.000Z`}))
  const result=cleanupComparisonRuns({root,model:'icon',maxRuns:4})
  assert.equal(result.removedRuns.length,2)
  assert.equal(readAirportComparison({root,airport_icao:'RKSI'}).models[0].run_at,'2026-09-01T00:00:00.000Z')
  assert.equal(fs.readdirSync(path.join(root,'airport_model_comparison/icon/runs')).length,5)
})
test('attempts persist sanitized failure summaries and unsafe pointers cannot escape',t=>{
  const root=setup(t)
  writeCollectionAttempt({root,model:'gfs',report:{started_at:'2026-09-06T00:00:00Z',errors:[{code:'upstream',message:'failed https://example.test/?authKey=secret'}]}})
  assert.ok(!JSON.stringify(readCollectionAttempt({root,model:'gfs'})).includes('secret'))
  publishAirportWindow(input(root))
  const file=path.join(root,'airport_model_comparison/icon/latest.json'), latest=JSON.parse(fs.readFileSync(file))
  latest.airports.RKPU.path='../../outside.json'; fs.writeFileSync(file,JSON.stringify(latest))
  assert.equal(readAirportComparison({root,airport_icao:'RKPU'}).models.length,0)
  assert.throws(()=>readAirportComparison({root,airport_icao:'../RKPU'}))
})

test('identical retry repairs missing or corrupt immutable payload instead of reusing broken pointer',t=>{
  const root=setup(t),data=input(root);publishAirportWindow(data)
  const modelRoot=path.join(root,'airport_model_comparison/icon'),latest=JSON.parse(fs.readFileSync(path.join(modelRoot,'latest.json'))),file=path.join(modelRoot,latest.airports.RKPU.path)
  for(const corrupt of [()=>fs.rmSync(file),()=>fs.writeFileSync(file,'{broken')]) {
    corrupt();assert.equal(readAirportComparison({root,airport_icao:'RKPU'}).models.length,0)
    assert.equal(publishAirportWindow(data).published,true)
    assert.equal(readAirportComparison({root,airport_icao:'RKPU'}).models.length,1)
  }
})

test('pointer collection and availability timestamps must match immutable records',t=>{
  const root=setup(t);publishAirportWindow(input(root))
  const file=path.join(root,'airport_model_comparison/icon/latest.json'),latest=JSON.parse(fs.readFileSync(file))
  latest.airports.RKPU.collected_at='2099-01-01T00:00:00Z';fs.writeFileSync(file,JSON.stringify(latest))
  assert.equal(readAirportComparison({root,airport_icao:'RKPU'}).models.length,0)
})

test('reselecting an existing immutable window keeps its original collection evidence',t=>{
  const root=setup(t),initial=input(root,{model:'ecmwf'});publishAirportWindow(initial)
  const file=path.join(root,'airport_model_comparison/ecmwf/latest.json'),pointer=JSON.parse(fs.readFileSync(file)).airports.RKPU
  const payload=path.join(root,'airport_model_comparison/ecmwf',pointer.path),before=fs.readFileSync(payload,'utf8')
  publishAirportWindow(input(root,{model:'ecmwf',offset:6}))
  initial.records.forEach(r=>r.collected_at='2026-09-06T11:00:00.000Z');publishAirportWindow(initial)
  assert.equal(fs.readFileSync(payload,'utf8'),before)
  assert.equal(readAirportComparison({root,airport_icao:'RKPU'}).models[0].collected_at,pointer.collected_at)
})
