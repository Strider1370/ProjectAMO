import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { buildAlertKey, isInCooldown, recordAlert, clearResolvedAlerts, getHistory, getFirstFired } from './alert-state.js'

beforeEach(() => {
  // 이력은 모듈 수준 객체다. 테스트마다 비운다.
  clearResolvedAlerts(new Set(), 'RKSI')
  clearResolvedAlerts(new Set(), 'RKPC')
})

test('알람 키에 공항이 들어간다', () => {
  const key = buildAlertKey({ triggerId: 'high_wind' }, 'RKSI')
  assert.equal(key, 'high_wind:RKSI')
})

test('공항경보 분기가 사라졌다', () => {
  const key = buildAlertKey({ triggerId: 'warning_issued', data: [] }, 'RKSI')
  assert.equal(key, 'warning_issued:RKSI')
})

test('다른 공항을 보는 동안 이전 공항 이력이 지워지지 않는다', () => {
  const sipKey = buildAlertKey({ triggerId: 'high_wind' }, 'RKSI')
  const pcKey = buildAlertKey({ triggerId: 'high_wind' }, 'RKPC')
  recordAlert(sipKey)

  // RKPC를 보는 사이클: RKPC 키만 발동했다
  clearResolvedAlerts(new Set([pcKey]), 'RKPC')

  assert.ok(getHistory()[sipKey], 'RKSI 이력이 남아 있어야 한다')
  assert.equal(isInCooldown(sipKey, 300), true)
})

test('같은 공항에서 조건이 해소되면 이력이 지워진다', () => {
  const key = buildAlertKey({ triggerId: 'high_wind' }, 'RKSI')
  recordAlert(key)
  clearResolvedAlerts(new Set(), 'RKSI')
  assert.equal(getHistory()[key], undefined)
})

test('최초 발동 시각(firstFired)은 재발화에도 바뀌지 않는다', () => {
  const key = buildAlertKey({ triggerId: 'high_wind' }, 'RKSI')
  recordAlert(key)
  const firstFired = getFirstFired(key)
  assert.ok(firstFired)

  // 쿨다운 만료 후 재발화 — recordAlert가 다시 호출돼도 firstFired는 그대로다
  recordAlert(key)
  assert.equal(getFirstFired(key), firstFired)
  assert.equal(getHistory()[key].count, 2)
})

test('조건이 해소됐다가 다시 발동하면 firstFired가 새로 갱신된다', () => {
  const key = buildAlertKey({ triggerId: 'high_wind' }, 'RKSI')
  recordAlert(key)
  const firstFired = getFirstFired(key)

  clearResolvedAlerts(new Set(), 'RKSI') // 조건 해소 — 이력 삭제
  assert.equal(getFirstFired(key), null)

  recordAlert(key) // 새로 발동
  assert.ok(getFirstFired(key) >= firstFired)
})

test('TAF 변화 알람 키는 발표(issued)마다 달라진다', () => {
  const k1 = buildAlertKey({ triggerId: 'taf_change', issued: 'i1' }, 'RKSI')
  const k2 = buildAlertKey({ triggerId: 'taf_change', issued: 'i2' }, 'RKSI')

  assert.equal(k1, 'taf_change:RKSI:i1')
  assert.notEqual(k1, k2, '키가 같으면 재알림 간격이 새 발표를 가로막는다')
})

test('TAF 변화 알람 키가 공항별 이력 정리 규칙에 걸린다', () => {
  const key = buildAlertKey({ triggerId: 'taf_new_period', issued: 'i1' }, 'RKSI')
  recordAlert(key)
  clearResolvedAlerts(new Set(), 'RKSI')
  assert.equal(getHistory()[key], undefined, ':ICAO: 모양을 정리 규칙이 잡아야 한다')
})
