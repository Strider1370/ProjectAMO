import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatNotification, briefingChangeLines } from './notificationFormat.js'

const n = (over) => ({ routeId: 3, detectedAt: '2026-08-20T15:18:40.080Z', ...over })

test('formatNotification: 백엔드 sender.formatAlert와 같은 어휘', () => {
  assert.equal(formatNotification(n({ type: 'MINIMA', target: 'RKSI', role: 'dep', toVal: 'personal' })), '출발 RKSI 내 미니마 미만 예보')
  assert.equal(formatNotification(n({ type: 'MINIMA', target: 'RKTU', role: 'dest', toVal: 'airport' })), '도착 RKTU 접근최저치 미만 예보')
  assert.equal(formatNotification(n({ type: 'MINIMA', target: 'RKPC', role: 'dest', toVal: 'default' })), '도착 RKPC IFR 이하 예보')
  assert.equal(formatNotification(n({ type: 'TS', target: 'RKSI', role: 'dep' })), '출발 RKSI 뇌전 예보')
  assert.equal(formatNotification(n({ type: 'FG', target: 'RKPK', role: 'altn' })), '교체 RKPK 안개 예보')
  assert.equal(formatNotification(n({ type: 'SN', target: 'RKPC', role: 'dest' })), '도착 RKPC 눈 예보')
  assert.equal(formatNotification(n({ type: 'SIGMET', target: 'SIGMET WS01' })), '경로상 신규 SIGMET (SIGMET WS01)')
})

test('역할이 없으면 공항 코드만 — 없는 역할을 지어내지 않는다', () => {
  assert.equal(formatNotification(n({ type: 'TS', target: 'RKSI', role: null })), 'RKSI 뇌전 예보')
})

test('변경점 띠: 같은 문장은 한 번만 — "뇌전 예보 · 뇌전 예보"가 되면 안 된다', () => {
  const feed = [
    n({ type: 'TS', target: 'RKSI', role: 'dep' }),
    n({ type: 'MINIMA', target: 'RKSI', role: 'dep', toVal: 'personal' }),
    n({ type: 'TS', target: 'RKSI', role: 'dep' }),      // 강제 발화로 또 쌓인 같은 조건
    n({ type: 'MINIMA', target: 'RKSI', role: 'dep', toVal: 'personal' }),
  ]
  const { lines, more } = briefingChangeLines(feed, 3)
  assert.deepEqual(lines, ['출발 RKSI 뇌전 예보', '출발 RKSI 내 미니마 미만 예보'])
  assert.equal(more, 0)
})

test('변경점 띠: 다른 비행의 알림은 섞이지 않는다', () => {
  const feed = [n({ type: 'TS', target: 'RKSI', role: 'dep' }), n({ routeId: 9, type: 'FG', target: 'RKPC', role: 'dest' })]
  assert.deepEqual(briefingChangeLines(feed, 3).lines, ['출발 RKSI 뇌전 예보'])
})

test('변경점 띠: 많으면 앞의 넷만 두고 나머지는 개수로 접는다 — 한 줄이 문단이 되면 안 된다', () => {
  const feed = ['RKSI', 'RKPC', 'RKPK', 'RKTU', 'RKJJ', 'RKTN'].map((icao) => n({ type: 'FG', target: icao, role: 'dest' }))
  const { lines, more } = briefingChangeLines(feed, 3)
  assert.equal(lines.length, 4)
  assert.equal(more, 2)
})

test('변경점 띠: 딥링크가 없으면 아무것도 내지 않는다', () => {
  assert.deepEqual(briefingChangeLines([n({ type: 'TS', target: 'RKSI', role: 'dep' })], null).lines, [])
})
