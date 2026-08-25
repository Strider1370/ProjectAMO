import assert from 'node:assert/strict'
import test from 'node:test'

import { formatVfrDraftText, parseVfrDraftText } from './manualRouteInput.js'

const AIRPORTS = { departureAirport: 'RKSS', arrivalAirport: 'RKPC' }

// 지도에서 경유점을 끌 때마다 신분을 좌표로 되돌리면, 다음 단계가 처음 보는 지점으로 알고
// 새 번호를 발급한다 — WP2가 WP3이 되고 WP3이 WP4가 되던 버그.
test('이름이 있는 경유점은 다시 좌표로 내려가지 않는다', () => {
  const userWaypoints = [
    { id: 'user-wp-1', name: 'WP1', lat: 35.5, lon: 126.4 },
    { id: 'user-wp-2', name: 'WP2', lat: 34.4, lon: 126.3 },
  ]
  const terms = userWaypoints.map((waypoint) => ({ kind: 'user-waypoint', id: waypoint.id, name: waypoint.name }))
  const text = formatVfrDraftText({ ...AIRPORTS, enroute: { terms, userWaypoints } })

  assert.equal(text, 'RKSS DCT WP1 DCT WP2 DCT RKPC')
  assert.doesNotMatch(text, /N\d{4}/, '좌표로 되돌아가면 번호가 새로 발급된다')

  // 다시 읽어도 좌표가 아니라 같은 경유점으로 인식돼야 번호가 유지된다.
  const parsed = parseVfrDraftText(text, { ...AIRPORTS, userWaypoints }).enroute
  assert.deepEqual(parsed.terms.map((term) => term.kind), ['user-waypoint', 'user-waypoint'])
  assert.deepEqual(parsed.terms.map((term) => term.id), ['user-wp-1', 'user-wp-2'])
})

// VFR은 모든 구간이 DCT다. auto/항공로 intent가 섞여도 DCT가 빠진 문자열이 나오면 안 된다.
test('VFR 문자열은 어떤 intent가 들어와도 DCT로 이어진다', () => {
  const terms = [{ kind: 'fix', id: 'ANYANG' }, { kind: 'fix', id: 'SAPRI' }]
  for (const legIntents of [[{ kind: 'auto' }], [{ kind: 'airway', routeId: 'Y697' }], []]) {
    const text = formatVfrDraftText({ ...AIRPORTS, enroute: { terms, legIntents } })
    assert.equal(text, 'RKSS DCT ANYANG DCT SAPRI DCT RKPC')
    parseVfrDraftText(text, { ...AIRPORTS, userWaypoints: [] }) // 거절되면 예외
  }
})

// 알약(칩)을 다시 문자열로 만들 때 DCT를 안 끼우면 "RKSS RKPC"가 되고, 그 문자열은
// parseVfrDraftText가 통째로 거절한다 — 공항 두 개만 골라도 빨간 오류가 뜨던 원인.
test('알약을 이은 VFR 문자열은 항상 파싱된다', () => {
  const join = (texts) => {
    const parts = []
    texts.forEach((text) => {
      if (text === 'DCT') { if (parts.length && parts.at(-1) !== 'DCT') parts.push('DCT'); return }
      if (parts.length && parts.at(-1) !== 'DCT') parts.push('DCT')
      parts.push(text)
    })
    if (parts.at(-1) === 'DCT') parts.pop()
    return parts.join(' ')
  }

  assert.equal(join(['RKSS', 'RKPC']), 'RKSS DCT RKPC')
  assert.equal(join(['RKSS', 'WP1', 'WP2', 'RKPC']), 'RKSS DCT WP1 DCT WP2 DCT RKPC')
  assert.equal(join(['RKSS', 'DCT', 'WP1', 'RKPC']), 'RKSS DCT WP1 DCT RKPC', '이미 있는 DCT를 두 번 넣지 않는다')

  const userWaypoints = [{ id: 'user-wp-1', name: 'WP1', lat: 35.5, lon: 126.4 }]
  for (const texts of [['RKSS', 'RKPC'], ['RKSS', 'WP1', 'RKPC'], ['RKSS', 'DCT', 'WP1', 'RKPC']]) {
    parseVfrDraftText(join(texts), { ...AIRPORTS, userWaypoints }) // 거절되면 예외
  }
})
