import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOrganizationFlightDraft } from './flightDraft.js'

const source = {
  id: 9, version: 3, name: '저장 경로', kind: 'route',
  base: { routeForm: { departureAirport: 'RKJJ', arrivalAirport: 'RKJY' }, routeString: 'RKJJ DCT RKJY' },
  alternatives: [], routeGeometry: { type: 'LineString', coordinates: [[126.8, 35.1], [127.6, 34.8]] },
  profileRequest: { routeGeometry: { type: 'LineString', coordinates: [[126.8, 35.1], [127.6, 34.8]] }, plannedCruiseAltitudeFt: 3500 },
}

test('기관 비행 초안은 v3 경로와 profileRequest를 별도로 보존하고 시각을 UTC로 만든다', () => {
  const out = buildOrganizationFlightDraft({ source, name: '동부 순찰', assignedUserId: '4', etd: '2026-09-10T09:00', eta: '2026-09-10T10:00', cruiseAltitudeFt: '4500', tz: 'KST' })
  assert.equal(out.snapshot.version, 3)
  assert.deepEqual(out.snapshot.routeGeometry, source.routeGeometry)
  assert.equal(out.profileRequest.plannedCruiseAltitudeFt, 4500)
  assert.equal(out.etd, '2026-09-10T00:00:00.000Z')
  assert.equal(out.eta, '2026-09-10T01:00:00.000Z')
})

test('profileRequest 없는 옛 경로와 역전 시각을 거부한다', () => {
  assert.throws(() => buildOrganizationFlightDraft({ source: { ...source, profileRequest: null }, etd: '2026-09-10T00:00Z', eta: '2026-09-10T01:00Z' }), /옛 경로/)
  assert.throws(() => buildOrganizationFlightDraft({ source, etd: '2026-09-10T02:00Z', eta: '2026-09-10T01:00Z' }), /도착시각/)
})
