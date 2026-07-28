import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { buildAlertKey, isInCooldown, recordAlert, clearResolvedAlerts, getHistory } from './alert-state.js'

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
