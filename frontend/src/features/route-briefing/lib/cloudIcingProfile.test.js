import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProfileTurbulenceCells, profileIcingHidesTurbulence } from './cloudIcingProfile.js'
import { toggleCrossSectionLayer, showCrossSectionTurbulence, restoreCrossSectionLayers } from './crossSectionLayerState.js'

const levels = [10000, 15000].map((altFt, i) => ({ altFt, pressure: i ? 550 : 700,
  values: [0, 10].map(distanceNm => ({ distanceNm, icing: 2, spread: 1 })) }))
const turbulence = { available: true, product: 'GKTG', levels: [12000, 14000].map(altFt => ({ altFt,
  values: [0, 10].map(distanceNm => ({ distanceNm, altFt, gktg: .25 })) })) }

test('occlusion requires actual altitude and route-distance intersection of rendered cells', () => {
  assert.equal(profileIcingHidesTurbulence({ levels, turbulence }), true)
  for (const outside of [
    { ...turbulence, levels: turbulence.levels.map(l => ({ ...l, values: l.values.map(v => ({ ...v, distanceNm: v.distanceNm + 10 })) })) },
    { ...turbulence, levels: turbulence.levels.map(l => ({ ...l, values: l.values.map(v => ({ ...v, altFt: v.altFt + 5000 })) })) },
    { ...turbulence, available: false },
    { ...turbulence, levels: turbulence.levels.slice(0,1) },
    { ...turbulence, levels: turbulence.levels.map(l => ({ ...l, values: l.values.map(v => ({ ...v, gktg: null })) })) },
    { ...turbulence, levels: turbulence.levels.map(l => ({ ...l, values: l.values.map(v => ({ ...v, gktg: .1 })) })) },
  ]) assert.equal(profileIcingHidesTurbulence({ levels, turbulence: outside }), false)
  assert.equal(profileIcingHidesTurbulence({ turbulence }), false)
  assert.equal(profileIcingHidesTurbulence({ levels: levels.map(l => ({ ...l, values: l.values.map(v => ({ ...v, icing: 0 })) })), turbulence }), false)
})

test('native GKTG cells require paired valid samples; legacy KTG retains its 1000 ft band', () => {
  const [cell] = buildProfileTurbulenceCells(turbulence)
  assert.equal(cell.bottomFt,12000); assert.equal(cell.topFt,14000)
  assert.equal(buildProfileTurbulenceCells({ ...turbulence, levels: [turbulence.levels[0]] }).length,0)
  const [legacy] = buildProfileTurbulenceCells({ available:true, product:'KTG', levels:[{ altFt:11000, values:[{distanceNm:0,ktg:.3},{distanceNm:10,ktg:.3}] }] })
  assert.equal(legacy.bottomFt,10500);assert.equal(legacy.topFt,11500)
})

test('turbulence view restores prior face choices and preserves unrelated selections', () => {
  const initial = { layers: { moisture:false, icing:true, turbulence:false, temp:true, cloud:true, wind:true }, restore:null }
  const shown = showCrossSectionTurbulence(initial)
  assert.deepEqual(shown.layers,{...initial.layers,icing:false,turbulence:true})
  assert.equal(showCrossSectionTurbulence(shown),shown)
  const edited = toggleCrossSectionLayer(shown,'wind')
  const restored = restoreCrossSectionLayers(edited)
  assert.deepEqual(restored.layers,{...initial.layers,wind:false})
  assert.equal(restored.restore,null)
  assert.equal(toggleCrossSectionLayer(shown,'icing').restore,null, 'manual face choice leaves temporary view')
})
