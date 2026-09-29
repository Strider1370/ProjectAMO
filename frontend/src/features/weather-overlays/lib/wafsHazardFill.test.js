import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clipHazardRing, hazardFillData, installHazardFill, selectHazardFill, HAZARD_LAYER, HAZARD_SOURCE } from './wafsHazardFill.js'
import { insideArea } from './wafsChartGeometry.js'
import { wafsChartPalette } from './wafsChartPalette.js'

const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]]

test('fill clipping retains holes, concave lobes and dateline world copies', () => {
  const outer = [[70, 10], [100, 10], [100, 75], [130, 75], [130, 10], [180, 10], [180, 100], [70, 100], [70, 10]]
  const hole = box(140, 25, 160, 50)
  const bounds = [75, -20, 170, 70]
  const clipped = [[clipHazardRing(outer, bounds), clipHazardRing(hole, bounds)]]
  for (let x = 75.25; x < 170; x += 2.5) for (let y = -19.75; y < 70; y += 2.5) {
    assert.equal(insideArea([x, y], clipped), insideArea([x, y], [[outer, hole]]))
  }
  assert.equal(insideArea([115, 40], clipped), false, 'clipped disconnected lobes must not acquire a false interior')
  assert.equal(insideArea([150, 40], clipped), false, 'hole remains empty')
  const wrapped = clipHazardRing(box(175, 20, 190, 40), [170, -20, 185, 70])
  assert.equal(insideArea([179, 30], [[wrapped]]), true)
  assert.deepEqual(clipHazardRing(box(0, 90, 10, 100), bounds), [])
})

test('all 30 sample frames preserve area membership within preview bounds', () => {
  const { frames } = JSON.parse(readFileSync(new URL('../fixtures/wafs-sigwx-series.json', import.meta.url)))
  for (const data of frames) {
    const features = new Map(hazardFillData(data).features.map(f => [f.properties.objectId, f]))
    for (const area of data.areas) {
      const polygons = features.get(area.objectId)?.geometry.coordinates || []
      for (const polygon of polygons) for (const ring of polygon) {
        assert.deepEqual(ring[0], ring.at(-1))
        assert.ok(ring.every(([lon, lat]) => lon >= 75 && lon <= 170 && lat >= -20 && lat <= 70))
      }
      for (let lon = 78.25; lon < 170; lon += 9.5) for (let lat = -17.25; lat < 70; lat += 9) {
        assert.equal(insideArea([lon, lat], polygons), insideArea([lon, lat], area.polygons), `${data.metadata.frameId}/${area.objectId}`)
      }
    }
  }
})

test('fills stay below aviation vectors through installation, style reload and selection', () => {
  const sources = new Map()
  let layers
  const reset = () => { sources.clear(); layers = [
    { id: 'radar', slot: 'middle' }, { id: 'fir', slot: 'top' }, { id: 'airport', slot: 'top' },
  ] }
  const map = {
    getStyle: () => ({ layers }), getLayer: id => layers.find(l => l.id === id),
    addLayer(layer, before) { const i = layers.findIndex(l => l.id === before); layers.splice(i < 0 ? layers.length : i, 0, layer) },
    moveLayer(id, before) { const layer = this.getLayer(id); layers = layers.filter(l => l.id !== id); this.addLayer(layer, before) },
    setPaintProperty(id, key, value) { this.getLayer(id).paint[key] = value },
    getSource: id => sources.get(id), addSource(id, source) { sources.set(id, { ...source, setData(data) { this.data = data } }) },
  }
  const data = { features: [], areas: [], metadata: { bounds: [75, -20, 170, 70] } }
  for (const basemap of ['standard', 'outline', 'outline-green']) {
    reset()
    const palette = wafsChartPalette(basemap)
    installHazardFill(map, data, palette)
    layers.push({ id: 'late-airway', slot: 'top' })
    installHazardFill(map, data, palette)
    selectHazardFill(map, 'chosen', palette)
    assert.deepEqual(layers.map(l => l.id), ['radar', HAZARD_LAYER, 'fir', 'airport', 'late-airway'])
    assert.equal(map.getLayer(HAZARD_LAYER).paint['fill-antialias'], false)
    assert.ok(JSON.stringify(map.getLayer(HAZARD_LAYER).paint['fill-opacity']).includes('chosen'))
    selectHazardFill(map, null, palette)
    assert.ok(!JSON.stringify(map.getLayer(HAZARD_LAYER).paint['fill-opacity']).includes('chosen'))
    assert.equal(map.getSource(HAZARD_SOURCE).data.features.length, 0)
  }
})
