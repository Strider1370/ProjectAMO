import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIGHTNING_TIME_WINDOW_MINUTES,
  createLightningGeoJSON,
  createLightningFrameSync,
  getLightningAgeBand,
} from './lightningLayers.js'

test('getLightningAgeBand maps ages into configured bands', () => {
  assert.equal(getLightningAgeBand(0)?.iconId, 'lightning-0-5')
  assert.equal(getLightningAgeBand(9.9)?.iconId, 'lightning-5-10')
  assert.equal(getLightningAgeBand(29.9)?.iconId, 'lightning-25-30')
  assert.equal(getLightningAgeBand(LIGHTNING_TIME_WINDOW_MINUTES + 1), null)
})

test('an older delayed lightning frame cannot overwrite a newer valid frame', async () => {
  let releaseOld
  const old = new Promise((resolve) => { releaseOld = resolve })
  const data = { value: null, setData(next) { this.value = next } }
  const sync = createLightningFrameSync({ getSource: () => data }, {
    prepare: ({ frameKey }) => frameKey === 'old' ? old : Promise.resolve({ type: 'FeatureCollection', features: [{ id: 'new' }] }),
  })

  const stale = sync.sync({ visible: true, frameKey: 'old' })
  await sync.sync({ visible: true, frameKey: 'new' })
  releaseOld({ type: 'FeatureCollection', features: [{ id: 'old' }] })
  await stale

  assert.deepEqual(data.value, { type: 'FeatureCollection', features: [{ id: 'new' }] })
})

test('an empty replacement keeps the prior valid lightning frame', async () => {
  const data = { value: { type: 'FeatureCollection', features: [{ id: 'prior' }] }, setData(next) { this.value = next } }
  const sync = createLightningFrameSync({ getSource: () => data })
  await sync.sync({ visible: true, frameKey: 'empty', geojson: { type: 'FeatureCollection', features: [] } })
  assert.deepEqual(data.value, { type: 'FeatureCollection', features: [{ id: 'prior' }] })
})

test('createLightningGeoJSON keeps only recent valid strikes', () => {
  const referenceTimeMs = Date.UTC(2026, 4, 14, 3, 0, 0)
  const result = createLightningGeoJSON({
    nationwide: {
      strikes: [
        { lon: 126.1, lat: 37.1, time: new Date(referenceTimeMs - 3 * 60_000).toISOString(), type: 'CG' },
        { lon: 127.1, lat: 38.1, time: new Date(referenceTimeMs - 40 * 60_000).toISOString(), type: 'IC' },
        { lon: 'bad', lat: 37.2, time: new Date(referenceTimeMs - 3 * 60_000).toISOString(), type: 'CG' },
      ],
    },
  }, referenceTimeMs)

  assert.equal(result.type, 'FeatureCollection')
  assert.equal(result.features.length, 1)
  assert.deepEqual(result.features[0].geometry.coordinates, [126.1, 37.1])
  assert.equal(result.features[0].properties.iconId, 'lightning-0-5')
  assert.equal(result.features[0].properties.iconKey, 'lightning-0-5')
})
