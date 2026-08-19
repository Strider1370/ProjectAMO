import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNavlogNwpPatch } from '../src/briefing/navlog-nwp-patch.js'

test('buildNavlogNwpPatch exposes only NWP-derived fields for route and procedure legs', () => {
  const result = buildNavlogNwpPatch({
    legs: [{ from: 'A', to: 'B', startNm: 0, endNm: 10, wind: { speedKt: 22 }, temp: { meanC: -10 }, icing: { peakLevel: 1 }, turbulence: { peakLevel: 'light' }, hazards: [{ code: 'TS' }], notams: [{ id: 'N1' }] }],
    procedures: [{ type: 'SID', id: 'SID1', legs: [{ from: 'DEP', to: 'A', startNm: 0, endNm: 2, wind: { speedKt: 14 }, temp: { meanC: 3 }, icing: { peakLevel: null }, turbulence: { peakLevel: null }, hazards: [{ code: 'WS' }] }] }],
  })

  assert.deepEqual(result, {
    legs: [{ key: 'A-B-0.00-10.00', wind: { speedKt: 22 }, temp: { meanC: -10 }, icing: { peakLevel: 1 }, turbulence: { peakLevel: 'light' } }],
    procedures: [{ type: 'SID', id: 'SID1', legs: [{ key: 'DEP-A-0.00-2.00', wind: { speedKt: 14 }, temp: { meanC: 3 }, icing: { peakLevel: null }, turbulence: { peakLevel: null } }] }],
  })
})
