import test from 'node:test'
import assert from 'node:assert/strict'

import { defaultBriefingName } from './briefingName.js'

test('노선·ETD·순항고도를 이름에 담는다', () => {
  const name = defaultBriefingName({
    departureAirport: 'RKSI', arrivalAirport: 'RJBB',
    etd: '2026-08-19T02:00:00Z', cruiseAltitudeFt: 28000,
  })
  assert.match(name, /RKSI/)
  assert.match(name, /RJBB/)
  assert.match(name, /0200Z/) // 항공 표기: 콜론 없는 Zulu
  assert.match(name, /FL280/)
})

test('고도가 전이고도 미만이면 ft로 적는다', () => {
  const name = defaultBriefingName({
    departureAirport: 'RKSS', arrivalAirport: 'RKPC',
    etd: '2026-08-19T02:00:00Z', cruiseAltitudeFt: 9000,
  })
  assert.match(name, /9,000 ft/)
  assert.doesNotMatch(name, /FL/)
})

test('빠진 값이 있어도 만들 수 있는 만큼 만든다', () => {
  assert.equal(typeof defaultBriefingName({}), 'string')
  assert.ok(defaultBriefingName({}).length > 0)
  assert.match(defaultBriefingName({ departureAirport: 'RKSI', arrivalAirport: 'RJBB' }), /RKSI → RJBB/)
})

test('같은 노선이라도 ETD·고도가 다르면 이름이 갈린다', () => {
  const a = defaultBriefingName({ departureAirport: 'RKSI', arrivalAirport: 'RJBB', etd: '2026-08-19T02:00:00Z', cruiseAltitudeFt: 28000 })
  const b = defaultBriefingName({ departureAirport: 'RKSI', arrivalAirport: 'RJBB', etd: '2026-08-19T05:00:00Z', cruiseAltitudeFt: 34000 })
  assert.notEqual(a, b)
})
