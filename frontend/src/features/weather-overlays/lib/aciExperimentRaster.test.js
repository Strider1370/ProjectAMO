import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeAciGrid, aciCellAt, aciRasterPixels } from './aciExperimentRaster.js'
import { mercatorSourceRows } from './overlayUtils.js'
const grid={nx:2,ny:3,lonMin:90,lonMax:91,latMin:6,latMax:50}
const meta={format:'aci-f32-v1',validAt:'2026-10-09T12:00:00Z',grid}
const data=decodeAciGrid(meta,new Float32Array([0,NaN,500,500,1000,1000,0,0,2.5,2.5,5,5,250,250,200,200,150,150]).buffer)
test('expanded grid click preserves all three source values and excludes missing/outside cells',()=>{
 assert.ok(Math.abs(aciCellAt(data,90,50).score - .88) < 1e-12)
 assert.ok(Math.abs(aciCellAt(data,90,28).score - (0.04 + 0.4 * 2.3 / 4.8 + 0.24)) < 1e-12)
 assert.equal(aciCellAt(data,91,6),null)
 assert.equal(aciCellAt(data,126,37),null)
 assert.throws(()=>decodeAciGrid(meta,new ArrayBuffer(12)),/크기/)
})
test('native pixels use Mercator source rows; transparent low/missing cells and boundary bands agree with point lookup',()=>{
 const {pixels,validCount}=aciRasterPixels(data)
 assert.equal(validCount,5)
 const rows=mercatorSourceRows(grid)
 for(let y=0;y<grid.ny;y++)for(let x=0;x<grid.nx;x++){
  const cell=aciCellAt(data,90+x,6+rows[y]*22),i=(y*grid.nx+x)*4
  assert.equal(pixels[i+3],cell&&cell.score>=.25?166:0)
  if(cell?.score>=.75)assert.deepEqual([...pixels.slice(i,i+3)],[239,68,68])
 }
})
