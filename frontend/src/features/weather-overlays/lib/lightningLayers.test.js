import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIGHTNING_TIME_WINDOW_MINUTES,
  createLightningGeoJSON,
  getLightningAgeBand,
} from './lightningLayers.js'

test('getLightningAgeBand maps ages into configured bands', () => {
  assert.equal(getLightningAgeBand(0)?.iconId, 'lightning-0-10')
  assert.equal(getLightningAgeBand(19.9)?.iconId, 'lightning-10-20')
  assert.equal(getLightningAgeBand(59.9)?.iconId, 'lightning-50-60')
  assert.equal(getLightningAgeBand(LIGHTNING_TIME_WINDOW_MINUTES + 1), null)
})

test('createLightningGeoJSON keeps only recent valid strikes', () => {
  const referenceTimeMs = Date.UTC(2026, 4, 14, 3, 0, 0)
  const result = createLightningGeoJSON({
    nationwide: {
      strikes: [
        { lon: 126.1, lat: 37.1, time: new Date(referenceTimeMs - 5 * 60_000).toISOString(), type: 'CG' },
        { lon: 127.1, lat: 38.1, time: new Date(referenceTimeMs - 70 * 60_000).toISOString(), type: 'IC' },
        { lon: 'bad', lat: 37.2, time: new Date(referenceTimeMs - 5 * 60_000).toISOString(), type: 'CG' },
      ],
    },
  }, referenceTimeMs)

  assert.equal(result.type, 'FeatureCollection')
  assert.equal(result.features.length, 1)
  assert.deepEqual(result.features[0].geometry.coordinates, [126.1, 37.1])
  assert.equal(result.features[0].properties.iconId, 'lightning-0-10')
  assert.equal(result.features[0].properties.iconKey, 'lightning-0-10')
})
