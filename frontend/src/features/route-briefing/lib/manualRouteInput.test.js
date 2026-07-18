import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCoordinateToken, formatManualRouteString, formatVfrDraftText, parseCoordinateToken, parseManualRouteString, parseVfrDraftText } from './manualRouteInput.js'

test('manual route input preserves airway and DCT terms without procedure tokens', () => {
  const parsed = parseManualRouteString('OSPAT Y711 GONA DCT WP1 DCT N3721.4E12712.8', {
    userWaypoints: [{ id: 'wp-1', name: 'WP1', lat: 37, lon: 127 }],
  })
  assert.deepEqual(parsed.connectors, ['Y711', 'DCT', 'DCT'])
  assert.equal(parsed.terms[2].id, 'wp-1')
  assert.deepEqual(parsed.terms[3].coordinate, { lat: 37.3567, lon: 127.2133 })
})

test('coordinate tokens round-trip and reject invalid VFR airways', () => {
  assert.equal(formatCoordinateToken(parseCoordinateToken('S3721.4W12712.8')), 'S3721.4W12712.8')
  assert.throws(() => parseManualRouteString('A Y711 B', { flightRule: 'VFR' }), /VFR/)
  assert.throws(() => parseCoordinateToken('N9912.0E12712.8'), /범위/)
})

test('formatted manual route uses local user waypoint names', () => {
  assert.equal(formatManualRouteString({
    terms: [{ kind: 'fix', id: 'A' }, { kind: 'user-waypoint', id: 'u1' }, { kind: 'fix', id: 'B' }],
    connectors: ['DCT', 'DCT'], userWaypoints: [{ id: 'u1', name: 'WP1' }],
  }), 'A DCT WP1 DCT B')
})

test('bare FIX entries become auto-resolved legs and a trailing airway does not block the draft', () => {
  const direct = parseManualRouteString('SEL APELA')
  assert.deepEqual(direct.legIntents, [{ kind: 'auto' }])
  const partial = parseManualRouteString('SEL A582')
  assert.equal(partial.terms.length, 1)
  assert.equal(formatManualRouteString(partial), 'SEL')
})

test('VFR draft text keeps airports in display text and strips them from enroute', () => {
  const direct = parseVfrDraftText('RKSI DCT RKPK', { departureAirport: 'RKSI', arrivalAirport: 'RKPK' })
  assert.deepEqual(direct.enroute.terms, [])
  assert.equal(direct.displayText, 'RKSI DCT RKPK')

  const parsed = parseVfrDraftText('RKSI DCT GONAX DCT N3721.4E12712.8 DCT RKPK', { departureAirport: 'RKSI', arrivalAirport: 'RKPK' })
  assert.equal(parsed.enroute.terms[0].id, 'GONAX')
  assert.equal(formatVfrDraftText({ departureAirport: 'RKSI', arrivalAirport: 'RKPK', enroute: parsed.enroute }), 'RKSI DCT GONAX DCT N3721.4E12712.8 DCT RKPK')
})

test('VFR draft text rejects mismatched airports, airways, and middle airport ICAO', () => {
  const context = { departureAirport: 'RKSI', arrivalAirport: 'RKPK' }
  assert.throws(() => parseVfrDraftText('RKSS DCT RKPK', context), /출발\/도착/)
  assert.throws(() => parseVfrDraftText('RKSI Y711 RKPK', context), /VFR/)
  assert.throws(() => parseVfrDraftText('RKSI DCT RKSS DCT RKPK', context), /중간 공항/)
})
