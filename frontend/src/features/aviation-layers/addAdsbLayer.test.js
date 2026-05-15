import test from 'node:test'
import assert from 'node:assert/strict'
import { bindAdsbHover, syncAdsbLayer } from './addAdsbLayer.js'

function createMapMock() {
  const calls = []
  const source = {
    data: null,
    setData(data) {
      this.data = data
    },
  }
  return {
    calls,
    source,
    on(type, layerId, handler) {
      calls.push(['on', type, layerId, handler])
    },
    off(type, layerId, handler) {
      calls.push(['off', type, layerId, handler])
    },
    getSource() {
      return source
    },
    getLayer() {
      return true
    },
    setLayoutProperty(layerId, property, value) {
      calls.push(['layout', layerId, property, value])
    },
  }
}

test('bindAdsbHover returns cleanup for all registered handlers', () => {
  const map = createMapMock()
  const cleanup = bindAdsbHover(map)
  assert.equal(typeof cleanup, 'function')
  cleanup()
  assert.equal(map.calls.filter((call) => call[0] === 'on').length, 3)
  assert.equal(map.calls.filter((call) => call[0] === 'off').length, 3)
})

test('syncAdsbLayer applies current data and visibility', () => {
  const map = createMapMock()
  const geojson = { type: 'FeatureCollection', features: [] }
  syncAdsbLayer(map, { geojson, isVisible: true })
  assert.equal(map.source.data, geojson)
  assert.deepEqual(map.calls.at(-1), ['layout', 'adsb-layer', 'visibility', 'visible'])
})
