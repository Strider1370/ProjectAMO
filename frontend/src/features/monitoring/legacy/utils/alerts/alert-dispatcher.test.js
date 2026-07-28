import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { dispatch, setAlertCallback } from './alert-dispatcher.js'

afterEach(() => {
  setAlertCallback(null)
})

test('highlightSince를 넘기면 그대로 알림 객체에 실린다 (강조 기준점 고정)', () => {
  let received
  setAlertCallback((alertObj) => {
    received = alertObj
  })

  const fixedFirstFired = 1000
  dispatch({ severity: 'warning', title: 't', message: 'm' }, {}, 'RKSI', 'key1', fixedFirstFired)

  assert.equal(received.highlightSince, fixedFirstFired)
  assert.ok(received.timestamp >= fixedFirstFired, 'timestamp(마지막 발동)는 별도로 지금 시각을 쓴다')
})

test('highlightSince를 넘기지 않으면 지금 시각으로 대체된다 (예시 알람 등)', () => {
  let received
  setAlertCallback((alertObj) => {
    received = alertObj
  })

  const before = Date.now()
  dispatch({ severity: 'info', title: 't', message: 'm' }, {}, 'RKSI', 'key1')
  const after = Date.now()

  assert.ok(received.highlightSince >= before && received.highlightSince <= after)
})
