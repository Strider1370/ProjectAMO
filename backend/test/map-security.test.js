import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createDb } from '../src/db/index.js'
import { createMapWriteGuard } from '../src/maps/request-guard.js'
import { assertMapGrowth, assertDiskSpace, reserveMaterialBytes, MAX_MATERIAL_ORG_BYTES, MIN_FREE_BYTES } from '../src/maps/storage-budget.js'
import { parseOrganizationMapMaterial } from '../src/lib/organization-kml.js'
import { parseOrganizationMapMaterialAsync } from '../src/lib/organization-kml-async.js'

const point=Buffer.from('<kml><Placemark><Point><coordinates>127,37</coordinates></Point></Placemark></kml>')
function call(guard,{id=1,size=1,encoding,method='POST'}={}) {
  const res=new EventEmitter(); res.statusCode=200; res.headers={}
  res.status=n=>(res.statusCode=n,res);res.set=(key,value)=>(res.headers[key]=value,res);res.json=body=>(res.body=body,res)
  let passed=false
  guard({method,session:{userId:id},socket:{remoteAddress:'local'},headers:{...(size==null?{}:{'content-length':String(size)}),...(encoding?{'content-encoding':encoding}:{})}},res,()=>{passed=true})
  return {res,passed}
}
test('write guard rejects oversized/encoded/chunked-budget requests before next and throttles per account',()=>{
 let now=0;const guard=createMapWriteGuard({maxRequests:2,maxBytes:10,maxBodyBytes:8,now:()=>now,log:()=>{}})
 assert.equal(call(guard,{size:9}).res.statusCode,413)
 assert.equal(call(guard,{encoding:'gzip'}).res.statusCode,415)
 const a=call(guard,{size:6});assert.equal(a.passed,true);a.res.emit('finish')
 assert.equal(call(guard,{size:5}).res.statusCode,429)
 assert.equal(call(guard,{size:null}).res.statusCode,429)
 const b=call(guard,{size:1});assert.equal(b.passed,true);b.res.emit('finish')
 assert.equal(call(guard).res.statusCode,429)
 const other=call(guard,{id:2});assert.equal(other.passed,true);other.res.emit('finish')
 assert.equal(call(guard,{method:'GET'}).passed,true)
 now=60001;const renewed=call(guard);assert.equal(renewed.passed,true);renewed.res.emit('finish')
})
test('concurrency slots release exactly once on finish and close',()=>{
 const guard=createMapWriteGuard({maxConcurrent:1,log:()=>{}})
 const first=call(guard);assert.equal(call(guard,{id:2}).res.statusCode,429)
 first.res.emit('finish');first.res.emit('close')
 const second=call(guard,{id:2});assert.equal(second.passed,true)
 assert.equal(call(guard,{id:3}).res.statusCode,429);second.res.emit('close')
})
test('storage reservations prevent overlapping material writes from exceeding quota and release on failure',()=>{
 const db=createDb(':memory:')
 try {
  const release=reserveMaterialBytes(db,77,MAX_MATERIAL_ORG_BYTES-1,':memory:')
  assert.throws(()=>reserveMaterialBytes(db,77,2,':memory:'),{code:'organization_material_storage_full'})
  assert.throws(()=>assertMapGrowth(db,500*1024*1024),{code:'map_storage_full'})
  release();release();assert.doesNotThrow(()=>assertMapGrowth(db,1,{orgId:77}))
 }finally{db.close()}
})
test('low disk blocks growth but permits shrink; equality preserves 3GiB free',()=>{
 assert.throws(()=>assertDiskSpace('.',1,()=>({bavail:MIN_FREE_BYTES,bsize:1})),{code:'map_storage_low_disk'})
 assert.doesNotThrow(()=>assertDiskSpace('.',1,()=>({bavail:MIN_FREE_BYTES+1,bsize:1})))
 assert.doesNotThrow(()=>assertDiskSpace('.',-1,()=>{throw Error('must not check')}))
})
test('complex polygon rejected before quadratic intersection work',()=>{
 const n=12000,pts=Array.from({length:n},(_,i)=>[127+Math.cos(i/n*Math.PI*2),37+Math.sin(i/n*Math.PI*2)].join(','));pts.push(pts[0])
 const data=Buffer.from(`<kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>${pts.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`)
 assert.throws(()=>parseOrganizationMapMaterial(data),/polygon_complexity/)
})
test('analysis worker returns valid maps and terminates on deadline',async()=>{
 assert.equal((await parseOrganizationMapMaterialAsync(point,'application/vnd.google-earth.kml+xml')).featureCount,1)
 await assert.rejects(()=>parseOrganizationMapMaterialAsync(point,'application/vnd.google-earth.kml+xml',{timeoutMs:1}),/analysis_timeout/)
 assert.equal((await parseOrganizationMapMaterialAsync(point,'application/vnd.google-earth.kml+xml')).featureCount,1)
})
