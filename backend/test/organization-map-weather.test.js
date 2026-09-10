import test from 'node:test'
import assert from 'node:assert/strict'
import { organizationMapWeather } from '../src/organizations/map-weather.js'

test('map weather keeps the airport catalog, observations and missing values without mutable source references', () => {
  const metar = { fetched_at: '2026-09-10T12:00:00Z', airports: { RKSS: { observation: { wind: { speed: 10 }, clouds: [] } } } }
  const overseas = { airports: { RJTT: { observation: { wind: { speed: 20 } } } } }
  const result = organizationMapWeather({ metar, metar_overseas: overseas })
  assert.ok(result.airports.some(airport => airport.icao === 'RKSS'))
  assert.ok(result.airports.some(airport => airport.icao === 'RJTT'))
  assert.deepEqual(result.metar.airports, { ...metar.airports, ...overseas.airports })
  metar.airports.RKSS.observation.wind.speed = 99
  assert.equal(result.metar.airports.RKSS.observation.wind.speed, 10)
  assert.equal(result.metar.fetched_at, '2026-09-10T12:00:00Z')
  const absent = organizationMapWeather({})
  assert.equal(absent.metar, null)
  assert.equal(absent.airports.length, result.airports.length)
})

test('briefing bundle identity includes the pinned airport observation', async () => {
  const { buildOrganizationBriefingBundle } = await import('../src/organizations/briefing.js')
  const weather = { metar: { fetched_at: '2026-09-10T09:00:00Z', airports: { RKSS: { observation: { wind: { speed: 10 } } } } } }
  const flight = { id: 1, orgId: 1, version: 1, name: 'flight', etd: '2026-09-10T10:00:00Z', eta: '2026-09-10T11:00:00Z',
    snapshot: { routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 36]] } },
    profileRequest: { plannedCruiseAltitudeFt: 10000 }, annotations: [], blocks: [], materialRefs: [] }
  const dependencies = { terrainSampler: {}, readWeatherSnapshot: () => ({ weather, dataRoot: '/tmp', effectiveNowMs: Date.parse('2026-09-10T09:00:00Z') }),
    buildVerticalProfile: () => ({}), loadRouteCrossSection: () => ({ available: false }), composeBriefing: () => ({}) }
  const first = await buildOrganizationBriefingBundle(flight, {}, dependencies)
  weather.metar.airports.RKSS.observation.wind.speed = 20
  const next = await buildOrganizationBriefingBundle(flight, {}, dependencies)
  assert.notEqual(first.bundleId, next.bundleId)
  assert.equal(first.mapData.metar.airports.RKSS.observation.wind.speed, 10)
  assert.equal(next.mapData.metar.airports.RKSS.observation.wind.speed, 20)
})
