import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLinkedProfileBands } from './linkedProfileBands.js'

const scale = { maxDistance: 100, yMax: 10000, xFor: (nm) => nm * 2, yFor: (ft) => 100 - ft / 100 }

test('builds every distance interval and applies a bounded altitude', () => {
  const bands = buildLinkedProfileBands({ ...scale, activeItemId: 'annotation:a', linkedItems: [{
    sourceKind: 'annotation', id: 'a', altitude: { minFt: 2000, maxFt: 5000 },
    distanceIntervals: [{ startNm: 10, endNm: 20 }, { startNm: 70, endNm: 75 }],
  }] })
  assert.equal(bands.length, 2)
  assert.equal(bands[0].active, true)
  assert.equal(bands[0].positionOnly, false)
  assert.equal(bands[0].height, 30)
})

test('a zero-width point remains selectable and altitude omission is position-only', () => {
  const [band] = buildLinkedProfileBands({ ...scale, linkedItems: [{
    sourceKind: 'annotation', id: 'point', distanceIntervals: [{ startNm: 25, endNm: 25 }],
  }] })
  assert.equal(band.width, 5)
  assert.equal(band.positionOnly, true)
})
