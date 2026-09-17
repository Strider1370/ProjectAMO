import assert from 'node:assert/strict'
import test from 'node:test'

import apiClient from '../src/api-client.js'
import config from '../src/config.js'
import airportInfoParser from '../src/parsers/airport-info-parser.js'
import airportInfoProcessor from '../src/processors/airport-info-processor.js'
import store from '../src/store.js'

test('airport info processor does not overwrite latest data with an empty collection', async () => {
  const originalAirports = config.airports
  const originalFetchAirportInfo = apiClient.fetchAirportInfo
  const originalSave = store.save
  const saveCalls = []

  config.airports = [{ icao: 'RKSI' }, { icao: 'RKSS' }]
  apiClient.fetchAirportInfo = async () => {
    throw new Error('no new airport info')
  }
  store.save = (...args) => {
    saveCalls.push(args)
    return { saved: true }
  }

  try {
    const result = await airportInfoProcessor.process()

    assert.equal(result.type, 'airport_info')
    assert.equal(result.saved, false)
    assert.equal(result.airports, 0)
    assert.equal(result.reason, 'empty')
    assert.deepEqual(saveCalls, [])
  } finally {
    config.airports = originalAirports
    apiClient.fetchAirportInfo = originalFetchAirportInfo
    store.save = originalSave
  }
})

test('airport info processor keeps previous airport info for missing airports during partial collection', async () => {
  const originalAirports = config.airports
  const originalFetchAirportInfo = apiClient.fetchAirportInfo
  const originalParse = airportInfoParser.parse
  const originalGetLiveCached = store.getLiveCached
  const originalSave = store.save
  const previousRkss = { icao: 'RKSS', tm: '2026-05-21 06:00:00.0', title: 'Previous RKSS' }
  let savedPayload

  config.airports = [{ icao: 'RKSI' }, { icao: 'RKSS' }]
  apiClient.fetchAirportInfo = async (_icao) => '<xml />'
  airportInfoParser.parse = (_xml, icao) => {
    if (icao === 'RKSI') return { icao: 'RKSI', tm: '2026-05-21 17:00:00.0', title: 'New RKSI' }
    return null
  }
  store.getLiveCached = (type) => type === 'airport_info'
    ? { airports: { RKSS: previousRkss } }
    : null
  store.save = (_type, payload) => {
    savedPayload = payload
    return { saved: true }
  }

  try {
    const result = await airportInfoProcessor.process()

    assert.equal(result.saved, true)
    assert.equal(result.airports, 2)
    assert.equal(savedPayload.airports.RKSI.title, 'New RKSI')
    assert.deepEqual(savedPayload.airports.RKSS, { ...previousRkss, _stale: true })
  } finally {
    config.airports = originalAirports
    apiClient.fetchAirportInfo = originalFetchAirportInfo
    airportInfoParser.parse = originalParse
    store.getLiveCached = originalGetLiveCached
    store.save = originalSave
  }
})
