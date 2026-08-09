import test from 'node:test'
import assert from 'node:assert/strict'
import { bindAdsbHover, createAdsbGeoJSON, syncAdsbLayer } from './addAdsbLayer.js'

function createMapMock() {
  const calls = []
  const sources = {}
  return {
    calls,
    sources,
    on(type, layerId, handler) {
      calls.push(['on', type, layerId, handler])
    },
    off(type, layerId, handler) {
      calls.push(['off', type, layerId, handler])
    },
    getSource(id) {
      if (!sources[id]) sources[id] = { data: null, setData(data) { this.data = data } }
      return sources[id]
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

test('syncAdsbLayer applies data to point and trail sources, and visibility to all layers', () => {
  const map = createMapMock()
  const geojson = { type: 'FeatureCollection', features: [] }
  const trailGeojson = { type: 'FeatureCollection', features: [] }
  syncAdsbLayer(map, { geojson, trailGeojson, isVisible: true })
  assert.equal(map.sources['adsb-source'].data, geojson)
  assert.equal(map.sources['adsb-trail-source'].data, trailGeojson)
  const visibilityCalls = map.calls.filter((call) => call[0] === 'layout' && call[2] === 'visibility')
  assert.deepEqual(visibilityCalls, [
    ['layout', 'adsb-range-layer', 'visibility', 'visible'],
    ['layout', 'adsb-trail-layer', 'visibility', 'visible'],
    ['layout', 'adsb-layer', 'visibility', 'visible'],
    ['layout', 'adsb-logo-layer', 'visibility', 'visible'],
  ])
})

test('ADS-B GeoJSON keeps reported wind and temperatures for the hover popup', () => {
  const geojson = createAdsbGeoJSON({ aircraft: [{ icao24: 'abc123', lat: 37, lon: 127, true_track: 180, velocity: 200, wind_direction: 216, wind_speed: 34, outside_air_temperature: -18 }] })
  const properties = geojson.features[0].properties
  assert.deepEqual([properties.wind_direction, properties.wind_speed, properties.outside_air_temperature], [216, 34, -18])
})

test('ADS-B GeoJSON hides aircraft without a reported direction or speed', () => {
  const geojson = createAdsbGeoJSON({ aircraft: [
    { icao24: 'complete', lat: 37, lon: 127, true_track: 0, velocity: 0 },
    { icao24: 'no-track', lat: 37, lon: 127, velocity: 200 },
    { icao24: 'no-speed', lat: 37, lon: 127, true_track: 180 },
  ] })
  assert.deepEqual(geojson.features.map((feature) => feature.properties.icao24), ['complete'])
})

test('HL5240 is identified as the Korea Meteorological Administration', () => {
  const geojson = createAdsbGeoJSON({ aircraft: [{
    icao24: 'kma001', lat: 37, lon: 127, true_track: 180, velocity: 200, registration: 'HL5240',
  }] })
  const { operator, airline_name: name } = geojson.features[0].properties
  assert.equal(operator, 'KMA')
  assert.equal(name, '기상청')
})
