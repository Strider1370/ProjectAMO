import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseFlightId, searchWithoutFlight } from './deeplinkFlight.js'

test('주소에서 비행 번호를 읽는다', () => {
  assert.equal(parseFlightId('?flight=7'), 7)
  assert.equal(parseFlightId('?airport=RKSI&flight=7'), 7)
})

test('번호가 없거나 숫자가 아니면 아무것도 안 연다', () => {
  assert.equal(parseFlightId(''), null)
  assert.equal(parseFlightId('?airport=RKSI'), null)
  assert.equal(parseFlightId('?flight='), null)
  assert.equal(parseFlightId('?flight=abc'), null)
})

test('flight만 지우고 다른 딥링크는 남긴다 — 공항 딥링크를 같이 날리면 안 된다', () => {
  assert.equal(searchWithoutFlight('?airport=RKSI&flight=7'), '?airport=RKSI')
  assert.equal(searchWithoutFlight('?flight=7'), '')
  assert.equal(searchWithoutFlight(''), '')
})
