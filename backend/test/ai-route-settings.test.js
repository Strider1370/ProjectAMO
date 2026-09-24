import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareRouteSettings } from '../src/ai/route-settings.js'

test('route proposal resolves airports, FL and local time without executing or inventing a route', () => {
  const value = prepareRouteSettings({ departure: '김포공항', arrival: '제주', flightRule: 'IFR',
    cruiseAltitude: { value: 310, unit: 'FL' }, departureLocal: '2026-09-23T21:03', arrivalLocal: '2026-09-23T22:30' })
  assert.equal(value.status, 'ok')
  assert.deepEqual(value.data.action.fields, { departureAirport: 'RKSS', arrivalAirport: 'RKPC', flightRule: 'IFR',
    cruiseAltitudeFt: 31000, etd: '2026-09-23T12:03:00.000Z', eta: '2026-09-23T13:30:00.000Z' })
  const utc = prepareRouteSettings({ departure: 'RKSS', arrival: 'RKPK', departureLocal: '2026-09-23T21:03' }, { timezone: 'UTC' })
  assert.equal(utc.data.action.fields.etd, '2026-09-23T21:03:00.000Z')
  assert.equal(utc.status, 'partial')
  assert.deepEqual(utc.data.missingFields, ['flightRule', 'cruiseAltitudeFt', 'eta'])
  assert.equal(utc.data.action.fields.eta, undefined)
  assert.equal(utc.data.action.fields.routeGeometry, undefined)
})

test('ambiguous/missing airports and unsupported conditions cannot produce an action', () => {
  const ambiguous = prepareRouteSettings({ departure: '서울', arrival: '제주' })
  assert.equal(ambiguous.data.action, null)
  assert.equal(ambiguous.issues[0].code, 'AMBIGUOUS_AIRPORT')
  assert.deepEqual(ambiguous.issues[0].candidates.map((x) => x.icao), ['RKSI', 'RKSS'])
  const unsupported = prepareRouteSettings({ departure: '김포', arrival: '제주', flightRule: 'VFR', unsupportedConditions: ['BULTI 경유'] })
  assert.equal(unsupported.data.preparationState, 'blocked')
  assert.deepEqual(unsupported.issues.map((issue) => issue.code), ['UNSUPPORTED_ROUTE_CONDITIONS', 'FLIGHT_RULE_UNSUPPORTED'])
  for (const args of [
    { departure: '김포' }, { departure: '김포', arrival: 'missing' },
    { departure: '김포', arrival: '제주', flightRule: 'VFR' },
    { departure: '김포', arrival: '제주', unsupportedConditions: ['BULTI를 경유'] },
    { departure: '김포', arrival: '김포' },
  ]) assert.equal(prepareRouteSettings(args).data.action, null)
})

test('out-of-range altitude, invalid calendar/time order and extraneous executable input are rejected', () => {
  for (const extra of [
    { cruiseAltitude: { value: 700, unit: 'FL' } },
    { cruiseAltitude: { value: 50, unit: 'ft' } },
    { departureLocal: '2026-02-30T12:00' },
    { arrivalLocal: '2026-09-23T22:00' },
    { departureLocal: '2026-09-23T22:00', arrivalLocal: '2026-09-23T21:00' },
    { departureLocal: '2026-09-23T22:00', arrivalLocal: '2026-09-26T23:00' },
  ]) assert.equal(prepareRouteSettings({ departure: '김포', arrival: '제주', ...extra }).data.action, null)
  for (const extra of [{ path: '/etc/passwd' }, { routeGeometry: {} }, { departureUtc: '2026-02-30T12:00:00Z' },
    { departureLocal: '2026-09-23T22:00', departureUtc: '2026-09-23T22:00:00Z' }]) {
    assert.equal(prepareRouteSettings({ departure: '김포', arrival: '제주', ...extra }).status, 'error')
  }
})
