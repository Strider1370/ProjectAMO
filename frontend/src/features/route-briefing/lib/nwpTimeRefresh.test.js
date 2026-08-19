import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeNavlogNwpPatch } from './nwpTimeRefresh.js'

test('mergeNavlogNwpPatch replaces only NWP fields and preserves hazards and NOTAMs', () => {
  const enroute = {
    legs: [{ from: 'A', to: 'B', startNm: 0, endNm: 10, wind: { speedKt: 10 }, hazards: [{ code: 'TS' }], notams: [{ id: 'N1' }], altitudeConstraint: { status: 'matched' } }],
    procedures: [],
  }
  const result = mergeNavlogNwpPatch(enroute, {
    legs: [{ key: 'A-B-0.00-10.00', wind: { speedKt: 30 }, temp: { meanC: -12 }, icing: { peakLevel: 1 }, turbulence: { peakLevel: 'light' } }],
    procedures: [],
  })

  assert.equal(result.legs[0].wind.speedKt, 30)
  assert.equal(result.legs[0].temp.meanC, -12)
  assert.deepEqual(result.legs[0].hazards, [{ code: 'TS' }])
  assert.deepEqual(result.legs[0].notams, [{ id: 'N1' }])
  assert.deepEqual(result.legs[0].altitudeConstraint, { status: 'matched' })
})
