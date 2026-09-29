import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { installHighLayers, removeHighLayers, HIGH_LAYERS, HIGH_SOURCE } from './sigwxHighLayers.js'
import { HAZARD_LAYER, HAZARD_SOURCE } from './wafsHazardFill.js'
import { WAFS_CHART_PALETTES } from './wafsChartPalette.js'
const frame = JSON.parse(fs.readFileSync(new URL('../../../../public/samples/sigwx-high/frame-00.json', import.meta.url)))

test('HIGH installs below aviation fills, restores after style changes and removes only its own resources', () => {
  const layers = new Map([['airport', { id: 'airport', slot: 'top' }]])
  const sources = new Map([['airport', {}]])
  const map = {
    getStyle: () => ({ layers: [...layers.values()] }),
    getLayer: id => layers.get(id), getSource: id => sources.get(id),
    addSource: (id, source) => sources.set(id, { ...source, setData(data) { this.data = data } }),
    addLayer: (layer, before) => { if (layer.id === HAZARD_LAYER) assert.equal(before, 'airport'); layers.set(layer.id, layer) },
    setPaintProperty: (id, key, value) => { layers.get(id).paint[key] = value },
    moveLayer: (id, before) => { assert.equal(id, HAZARD_LAYER); assert.equal(before, 'airport') },
    removeLayer: id => layers.delete(id), removeSource: id => sources.delete(id),
  }
  for (const palette of [WAFS_CHART_PALETTES.light, WAFS_CHART_PALETTES.dark]) {
    installHighLayers(map, frame, palette)
    assert.ok(sources.get(HIGH_SOURCE).data.features.length)
    assert.ok(sources.get(HAZARD_SOURCE).data.features.length)
    assert.ok(HIGH_LAYERS.every(id => layers.has(id)))
    assert.equal(layers.get(HIGH_SOURCE + '-CLOUD').paint['line-color'], palette.cloud)
    installHighLayers(map, { ...frame, features: [], areas: [] }, palette)
    assert.equal(sources.get(HAZARD_SOURCE).data.features.length, 0)
    removeHighLayers(map)
    assert.deepEqual([...layers.keys()], ['airport'])
    assert.deepEqual([...sources.keys()], ['airport'])
  }
})
