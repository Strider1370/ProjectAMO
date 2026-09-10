import test from 'node:test'
import assert from 'node:assert/strict'
import { organizationMapWeatherProps } from './organizationMapWeather.js'

test('presentation airport observations change only with the applied bundle', () => {
  const old = { airports: [{ icao: 'RKSS' }], metar: { revision: 'old' } }
  const next = { airports: [{ icao: 'RKPC' }], metar: { revision: 'new' } }
  const situation = { mapData: next }
  assert.deepEqual(organizationMapWeatherProps({ situation }).metarData, next.metar)
  assert.deepEqual(organizationMapWeatherProps({ situation, bundle: { mapData: old }, dataMode: 'pinned' }).metarData, old.metar)
  assert.deepEqual(organizationMapWeatherProps({ situation, bundle: { mapData: next }, dataMode: 'pinned' }).metarData, next.metar)
  assert.equal(organizationMapWeatherProps({ situation, dataMode: 'pinned' }).metarData, null)
})

test('live overlay refresh never changes presentation observations or imagery', () => {
  const layerWeather = { hsrMeta: { revision: 'latest' }, sigmet: { items: [{ id: 'latest' }] } }
  const bundle = { mapData: { hsrMeta: { revision: 'applied' } } }
  const live = organizationMapWeatherProps({ bundle, layerWeather })
  assert.equal(live.hsrMeta.revision, 'latest')
  assert.equal(live.sigmetData.items[0].id, 'latest')
  const pinned = organizationMapWeatherProps({ bundle, layerWeather, dataMode: 'pinned' })
  assert.equal(pinned.hsrMeta.revision, 'applied')
  assert.equal(pinned.sigmetData, null)
  assert.equal(organizationMapWeatherProps({ layerWeather, dataMode: 'pinned' }).hsrMeta, null)
})
