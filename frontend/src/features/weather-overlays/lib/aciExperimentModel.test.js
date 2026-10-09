import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, calculateScore } from './aciExperimentScore.js'
import { buildAciGeoJSON, syncAciLayer, removeAciLayer, ACI_LAYER, ACI_SOURCE } from './aciExperimentModel.js'
const data = { validAt: '2026-09-23T09:00:00Z', grid: { stepDegrees: 2/3 }, cells: [
  { lon: 119, lat: 30, cape: 500, rainRate: 2.5, olr: 200 },
  { lon: 120, lat: 31, cape: null, rainRate: 0, olr: 200 },
] }
test('all three inputs contribute; missing CAPE stays missing and cells stay within source domain', () => {
  const geo = buildAciGeoJSON(data)
  assert.equal(geo.features.length, 1)
  assert.ok(Math.abs(geo.features[0].properties.score - (0.04 + 0.4 * 2.3 / 4.8 + 0.24)) < 1e-12)
  assert.deepEqual(geo.features[0].geometry.coordinates[0][0], [119,30])
  assert.equal(calculateScore(data.cells[1]), null)
  assert.equal(buildAciGeoJSON(data, { ...DEFAULTS, capeWeight: 0, rainWeight: 0, olrWeight: 1 }).features[0].properties.olrContribution, .6)
})
test('toggle and repeated style replacement restore a single source/layer; cleanup removes both', () => {
  let sources = new Map(), layers = new Map()
  const map = { getSource: id=>sources.get(id), getLayer: id=>layers.get(id),
    addSource: (id,s)=>sources.set(id,{...s,setData(v){this.data=v}}), addLayer: l=>layers.set(l.id,l),
    setLayoutProperty: (id,k,v)=>{layers.get(id)[k]=v}, removeLayer: id=>layers.delete(id), removeSource: id=>sources.delete(id) }
  const geo = buildAciGeoJSON(data)
  for (let i=0;i<3;i++) {
    syncAciLayer(map,geo,true); assert.equal(layers.get(ACI_LAYER).visibility,'visible')
    syncAciLayer(map,geo,false); assert.equal(layers.get(ACI_LAYER).visibility,'none')
    assert.equal(sources.size,1); assert.equal(layers.size,1)
    sources=new Map();layers=new Map()
  }
  syncAciLayer(map,geo,true); removeAciLayer(map)
  assert.equal(map.getSource(ACI_SOURCE),undefined); assert.equal(layers.size,0)
})
