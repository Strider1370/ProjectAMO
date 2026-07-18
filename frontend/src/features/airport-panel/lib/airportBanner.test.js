import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAirportBanner } from './airportBanner.js'

const airport = { lon: 127 }
const metar = (observation, observation_time = '2026-07-19T03:00:00Z') => ({ header: { observation_time }, observation })

test('selects the six airport weather banners in priority order', () => {
  assert.equal(resolveAirportBanner(metar({ display: { weather: '-RA' } }), airport), 'precipitation')
  assert.equal(resolveAirportBanner(metar({ display: { weather_icon: 'BR' } }), airport), 'fog')
  assert.equal(resolveAirportBanner(metar({ display: { clouds: 'OVC' } }, '2026-07-19T12:00:00Z'), airport), 'night')
  assert.equal(resolveAirportBanner(metar({ display: { clouds: 'OVC' } }), airport), 'overcast')
  assert.equal(resolveAirportBanner(metar({ display: { clouds: 'SCT' } }), airport), 'partly-cloudy')
  assert.equal(resolveAirportBanner(metar({ display: { clouds: 'NSC' } }), airport), 'clear')
})
