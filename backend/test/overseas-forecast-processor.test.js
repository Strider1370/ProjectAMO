import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractOverseasSlots, symbolToIcon } from '../src/processors/overseas-forecast-processor.js'

// 2026-08-03 도쿄 하네다(RJTT) 좌표로 받은 MET Norway 실제 응답.
const HANEDA = JSON.parse(readFileSync(new URL('./fixtures/met-no-rjtt.json', import.meta.url), 'utf8'))

test('symbolToIcon: 낮/밤 접미사를 떼고 표시 어휘로 바꾼다', () => {
  assert.equal(symbolToIcon('clearsky_day'), 'sun')
  assert.equal(symbolToIcon('clearsky_night'), 'sun')
  assert.equal(symbolToIcon('fair_day'), 'sun')
  assert.equal(symbolToIcon('partlycloudy_night'), 'partly')
  assert.equal(symbolToIcon('cloudy'), 'cloudy')
  assert.equal(symbolToIcon('lightrain'), 'rain')
  assert.equal(symbolToIcon('lightrainshowers_night'), 'shower')
  assert.equal(symbolToIcon('heavysnow'), 'snow')
  assert.equal(symbolToIcon('rainandthunder'), 'storm')
  assert.equal(symbolToIcon('알수없는값'), null, '모르는 부호를 아무 날씨로 지어내지 않는다')
  assert.equal(symbolToIcon(undefined), null)
})

test('실제 응답에서 한국 시각 기준 시간별 예보를 뽑는다', () => {
  const slots = extractOverseasSlots(HANEDA)
  assert.equal(slots.length, 24)

  // 응답 첫 항목은 2026-08-03T06:00:00Z = 한국 15시.
  assert.equal(slots[0].date, '20260803')
  assert.equal(slots[0].time, '1500')
  assert.ok(Number.isFinite(slots[0].temp))

  // 1시간 간격으로 빠짐없이 이어져야 도착 시각이 몇 시든 그 칸을 찾을 수 있다.
  const hours = slots.map((slot) => Number(slot.time.slice(0, 2)))
  for (let index = 1; index < hours.length; index += 1) {
    assert.equal(hours[index], (hours[index - 1] + 1) % 24, `${index}번째가 1시간 간격이 아니다`)
  }
})

test('모든 칸이 표시에 필요한 값을 갖춘다', () => {
  for (const slot of extractOverseasSlots(HANEDA)) {
    assert.ok(Number.isFinite(slot.temp), `${slot.time} 기온 없음`)
    assert.ok(slot.icon, `${slot.time} 날씨 아이콘 없음`)
    assert.match(slot.date, /^\d{8}$/)
    assert.match(slot.time, /^\d{4}$/)
  }
})

test('기온이 없는 칸은 버린다', () => {
  const broken = { properties: { timeseries: [
    { time: '2026-08-03T06:00:00Z', data: { instant: { details: {} }, next_1_hours: { summary: { symbol_code: 'cloudy' } } } },
    { time: '2026-08-03T07:00:00Z', data: { instant: { details: { air_temperature: 27.5 } }, next_1_hours: { summary: { symbol_code: 'cloudy' } } } },
  ] } }
  const slots = extractOverseasSlots(broken)
  assert.equal(slots.length, 1)
  assert.equal(slots[0].temp, 27.5)
})

test('빈 응답은 빈 배열', () => {
  assert.deepEqual(extractOverseasSlots(null), [])
  assert.deepEqual(extractOverseasSlots({}), [])
  assert.deepEqual(extractOverseasSlots({ properties: { timeseries: [] } }), [])
})
