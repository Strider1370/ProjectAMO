import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RAINVIEWER_SOURCE,
  removeRainviewerLayers,
  syncRainviewerLayers,
} from './rainviewerLayers.js'

function createMap() {
  const sources = new Map()
  const layers = new Map()
  let setTilesCalls = 0
  return {
    sources, layers,
    setTilesCalls: () => setTilesCalls,
    getSource: (id) => sources.get(id),
    addSource(id, source) { sources.set(id, { ...source, setTiles() { setTilesCalls += 1 } }) },
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id),
    addLayer: (layer) => layers.set(layer.id, layer),
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty() {},
  }
}

const meta = {
  host: 'https://tiles.example',
  tileTemplate: '{host}{path}/{z}/{x}/{y}.png',
  coverageTemplate: '{host}/coverage/{z}/{x}/{y}.png',
}

test('숨긴 RainViewer는 소스를 만들거나 TileJSON reload를 예약하지 않는다', () => {
  const map = createMap()
  syncRainviewerLayers(map, { meta, frame: { path: '/radar/1' }, visible: false })
  assert.equal(map.getSource(RAINVIEWER_SOURCE), undefined)
  assert.equal(map.setTilesCalls(), 0)
})

test('같은 RainViewer URL은 setTiles를 반복하지 않고 teardown에서 소스를 제거한다', () => {
  const map = createMap()
  const input = { meta, frame: { path: '/radar/1' }, visible: true }
  syncRainviewerLayers(map, input)
  syncRainviewerLayers(map, input)
  assert.equal(map.setTilesCalls(), 0)
  removeRainviewerLayers(map)
  assert.equal(map.getSource(RAINVIEWER_SOURCE), undefined)
})
