import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { process as calculateAci, ACI_SPEC, validateAciSupplement } from '../src/processors/kim-aci-processor.js'
import { readKimAciLatest, readKimAciField, readKimAciIndex, aciMapField, ensureAciBinary, aciPath } from '../src/processors/kim-aci-store.js'
import { writeKimNwpGrid, writeKimNwpLatest, cleanupKimNwpRuns } from '../src/processors/kim-nwp-store.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpGrid } from '../src/processors/kim-nwp-model.js'
import { writeKimRawText } from '../src/processors/kim-doc-store.js'
import { decodeKimMapBinary } from '../../shared/kim-map-binary.js'
import { registerKimAciRoutes } from '../src/http/kim-aci-routes.js'
import { gunzipSync } from 'node:zlib'
const tmfc='2026100900',hf=12,domain='ea',grid={nx:2,ny:2,lonMin:90,lonMax:90+1/12,latMin:6,latMax:6+1/12}
function setup(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amo-aci-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}))
 const format=process.env.KIM_STORE_FORMAT;process.env.KIM_STORE_FORMAT='both';t.after(()=>{if(format===undefined)delete process.env.KIM_STORE_FORMAT;else process.env.KIM_STORE_FORMAT=format})
 for(const level of KIM_NWP_LEVELS) {
  const names=level.kind==='pressure'?['T','q']:['T']
  writeKimNwpGrid({root,domain,grid:buildKimNwpGrid({tmfc,hf,level,components:names.map(variable=>({variable,unit:variable==='T'?'K':'kg/kg',nx:2,ny:2,bounds:grid,values:Array(4).fill(variable==='T'?285:.005)}))})})
 }
 for(const [name,value,unit] of [['ps',100000,'Pa'],['q2m',.005,'kg/kg'],['pr',1/3600,'kg/m2/s'],['ulwrtoa',180,'W/m2']]) {
  const text=`# /NE57/file.ft012.${tmfc}.nc\n# = ${name}, unit = ${unit}, level = 0,\n# i = 2, j = 2\n# lon1 = 90.0, lat1 = 6.0, lon2 = 90.1, lat2 = 6.1\n${value} ${value}\n${value} ${value}\n`
  writeKimRawText(path.join(root,'kim_nwp_ea','runs',`KIMG_NE57_${tmfc}`,'raw',name==='ps'?'gktg':'aci',`hf${hf}-${name}-0.txt`),text)
 }
 return root
}
const fakeCalculate=async()=>({values:Float32Array.from([2500,1000,0,NaN,0,0,0,NaN,0,0,0,1]),fallbacks:0,seconds:.01})
test('NC round trip, immutable binary/JSON, CAPE reuse across score changes and retention',async t=>{
 const root=setup(t);let calls=0;const calculate=async()=>{calls++;return fakeCalculate()}
 const result=await calculateAci({root,domain,tmfc,forecastHours:[hf],calculate})
 assert.deepEqual(result.failures,[]);assert.equal(calls,1)
 const revision=result.entries[0].revision,field=readKimAciField({root,domain,tmfc,hf,revision})
 assert.equal(field.status[3],1);assert.equal(field.score[3],-32768);assert.equal(field.validCount,3)
 const binary=decodeKimMapBinary(gunzipSync(ensureAciBinary({root,domain,tmfc,hf,revision}).gzip))
 assert.deepEqual(binary,aciMapField(field))
 const changed=await calculateAci({root,domain,tmfc,forecastHours:[hf],calculate,scoreSpec:{version:'test-v3',settings:{...ACI_SPEC.settings,capeHigh:5000}}})
 assert.equal(calls,1);assert.notEqual(changed.entries[0].revision,revision);assert.equal(changed.entries[0].capeRevision,result.entries[0].capeRevision)
 cleanupKimNwpRuns({root,domain,maxRuns:1,latestRunId:'KIMG_NE57_2026100906'})
 assert.ok(fs.existsSync(aciPath({root,domain,tmfc,hf,revision})))
 assert.throws(()=>readKimAciField({root,domain:'kr',tmfc,hf,revision}),/ENOENT/)
 writeKimNwpLatest(root,{latestRun:'2026100906'},domain)
 assert.equal(readKimAciIndex(root,domain).times.length,0)
 assert.equal(readKimAciIndex(root,domain).reason,'aci_base_run_mismatch')
})
test('empty failed calculation preserves previous usable ACI publication',async t=>{
 const root=setup(t);await calculateAci({root,domain,tmfc,forecastHours:[hf],calculate:fakeCalculate})
 const before=readKimAciLatest(root,domain)
 const failed=await calculateAci({root,domain,tmfc,forecastHours:[0],calculate:fakeCalculate})
 assert.equal(failed.entries.length,0);assert.equal(failed.failures.length,1);assert.deepEqual(readKimAciLatest(root,domain),before)
})
test('API point shares the published score; bad selectors and outside points are rejected',async t=>{
 const root=setup(t),r=await calculateAci({root,domain,tmfc,forecastHours:[hf],calculate:fakeCalculate}),revision=r.entries[0].revision
 const app=express();registerKimAciRoutes(app,{root,resolveDomain:()=>domain,sendIndex:(res,v,key)=>res.set('ETag',key).json(v),sendField:(res,v,key)=>res.set('ETag',key).json(v)})
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close())
 const base=`http://127.0.0.1:${server.address().port}/api/kim/aci`
 const index=await (await fetch(base+'/index')).json();assert.equal(index.times[0].hf,hf)
 const query=`tmfc=${tmfc}&hf=${hf}&revision=${revision}`
 const point=await (await fetch(`${base}/point?${query}&lon=90&lat=6`)).json(),field=await (await fetch(`${base}/field?${query}`)).json()
 assert.equal(point.score,field.score[0]*field.scoreScale)
 assert.equal((await fetch(`${base}/point?${query}&lon=80&lat=6`)).status,404)
 assert.equal((await fetch(`${base}/field?${query.replace(revision,'bad')}`)).status,400)
})
test('supplement identity mismatch is not accepted as a missing column',()=>{
 assert.throws(()=>validateAciSupplement('bad',{name:'q2m',tmfc,hf,grid}),/identity/)
})

test('base replacement during calculation prevents publication and records a failed hour',async t=>{
 const root=setup(t)
 const result=await calculateAci({root,domain,tmfc,forecastHours:[hf],calculate:async()=>{
  const file=path.join(root,'kim_nwp_ea','runs',`KIMG_NE57_${tmfc}`,'normalized','hf012','700hPa','grid.json')
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));doc.fetched_at='2099-01-01T00:00:00Z';fs.writeFileSync(file,JSON.stringify(doc))
  return fakeCalculate()
 }})
 assert.equal(result.entries.length,0)
 assert.match(result.failures[0].reason,/inputs changed/)
 assert.equal(readKimAciLatest(root,domain),null)
})
