import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAirportLightningModel } from './airportLightningModel.js'

const now = Date.parse('2026-10-18T06:00:00Z')
const airport = { icao: 'RKSI' }
const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString()
const strike = (minutesAgo, distance_km) => ({ time: iso(minutesAgo), distance_km })
const payload = (strikes, coverage = {}) => ({
  airports: { RKSI: { strikes } },
  nationwide: { coverage: {
    status: 'complete',
    to: iso(5),
    successfulWindows: [{ from: iso(240), to: iso(5) }],
    ...coverage,
  } },
})

test('uses only observed strikes within 16 km and 30 minutes, with inclusive limits', () => {
  const model = buildAirportLightningModel(payload([
    strike(15, 8), strike(30, 16), strike(5, 16.01), { ...strike(2, 16), zone: 'caution' }, strike(30.01, 2), strike(-1, 3),
    { time: 'invalid', distance_km: 3 }, { time: iso(1), distance_km: null },
  ]), airport, now)
  assert.equal(model.count, 2)
  assert.equal(model.recent, true)
  assert.equal(model.near, true)
  assert.equal(model.nearestKm, 8)
  assert.equal(model.dataStatus, null)
})

test('marks 15–30 minute observations as earlier and expires after 30 minutes', () => {
  assert.equal(buildAirportLightningModel(payload([strike(15.01, 12)]), airport, now).recent, false)
  assert.equal(buildAirportLightningModel(payload([strike(30.01, 12)]), airport, now).active, false)
})

test('qualifies positive observations when the source is delayed or has a recent gap', () => {
  const delayed = buildAirportLightningModel(payload([strike(20, 10)], { to: iso(16) }), airport, now)
  assert.equal(delayed.dataStatus, '자료 갱신 지연')
  const partial = buildAirportLightningModel(payload([strike(10, 10)], {
    status: 'partial',
    successfulWindows: [{ from: iso(240), to: iso(20) }, { from: iso(15), to: iso(5) }],
  }), airport, now)
  assert.equal(partial.dataStatus, '일부 관측 구간 누락')
  const oldGap = buildAirportLightningModel(payload([strike(10, 10)], {
    status: 'partial',
    successfulWindows: [{ from: iso(30), to: iso(5) }],
  }), airport, now)
  assert.equal(oldGap.dataStatus, null)
})

test('does not show a lightning card without a confirmed nearby observation', () => {
  assert.equal(buildAirportLightningModel(payload([strike(3, 20)]), airport, now).active, false)
  assert.equal(buildAirportLightningModel(null, airport, now).active, false)
  assert.equal(buildAirportLightningModel(payload([strike(3, 3)]), { icao: 'RJAA', overseas: true }, now).active, false)
})
