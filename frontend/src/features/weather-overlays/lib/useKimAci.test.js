import test from 'node:test'
import assert from 'node:assert/strict'
import { pickAciTime, aciSelectionKey } from './useKimAci.js'
import { aciFieldPixels } from './useKimAciOverlay.js'
const index={domain:'ea',latestRun:'2026100900',times:[{hf:0,validTime:'2026-10-09T00:00:00Z',revision:'a'},{hf:12,validTime:'2026-10-09T12:00:00Z',revision:'b'}]}
test('ACI alone follows absolute time; combined layers require matching run/domain/hf and ignore altitude',()=>{
 assert.equal(pickAciTime(index,null,{selectedMs:Date.parse('2026-10-09T11:00:00Z')}).hf,12)
 const selection={domain:'ea',tmfc:index.latestRun,hf:12,level:'700hPa'}
 assert.equal(pickAciTime(index,selection,{commonActive:true}).hf,12)
 assert.equal(pickAciTime(index,{...selection,domain:'kr'},{commonActive:true}),null)
 assert.equal(pickAciTime(index,{...selection,tmfc:'2026100906'},{commonActive:true}),null)
 assert.equal(pickAciTime(index,{...selection,hf:1},{commonActive:true}),null)
 assert.equal(aciSelectionKey(selection),aciSelectionKey({...selection,level:'300hPa'}))
})
test('score boundary colours preserve yellow/orange/red and missing transparency',()=>{
 const field={grid:{nx:2,ny:2,lonMin:90,lonMax:91,latMin:6,latMax:7},scoreScale:.0001,score:[-32768,2499,5000,7500]}
 const pixels=aciFieldPixels(field)
 assert.deepEqual([...pixels.slice(0,4)],[251,146,60,166])
 assert.deepEqual([...pixels.slice(4,8)],[239,68,68,166])
 assert.equal(pixels[11],0);assert.equal(pixels[15],0)
})
