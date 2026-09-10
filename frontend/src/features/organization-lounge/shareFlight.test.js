import test from 'node:test'
import assert from 'node:assert/strict'

import { buildShareFlightBody, organizationFlightHref, shareFlightDefaults } from './shareFlight.js'

test('저장 자료의 시각과 고도를 선택 표시시간대 기본값으로 만든다', () => {
  assert.deepEqual(shareFlightDefaults({ name: '서울-제주', etd: '2026-09-10T00:00:00Z', eta: '2026-09-10T01:10:00Z', cruiseAltitudeFt: 28000 }, 'KST'), {
    name: '서울-제주', etd: '2026-09-10T09:00', eta: '2026-09-10T10:10', cruiseAltitudeFt: '28000',
  })
  assert.equal(shareFlightDefaults({ profileRequest: { plannedCruiseAltitudeFt: 8500 } }).cruiseAltitudeFt, '8500')
  assert.equal(shareFlightDefaults({ cruiseAltitudeFt: null }).cruiseAltitudeFt, '')
})

test('공유 요청은 저장 자료 ID와 입력한 override만 전송한다', () => {
  const body = buildShareFlightBody({
    source: { id: 41 }, name: '  야간 순찰 ', etd: '2026-09-10T09:00', eta: '', cruiseAltitudeFt: '4500', tz: 'KST',
    toIso: (value, tz) => `${value}:${tz}`,
  })
  assert.deepEqual(body, { savedRouteId: 41, name: '야간 순찰', etd: '2026-09-10T09:00:KST', cruiseAltitudeFt: 4500 })
  assert.equal(organizationFlightHref('org/a', 7), '/lounge/org%2Fa/flights/7')
})

test('저장 자료를 선택하지 않으면 요청을 만들지 않는다', () => {
  assert.throws(() => buildShareFlightBody({ source: null, toIso: () => null }), /선택/)
})
