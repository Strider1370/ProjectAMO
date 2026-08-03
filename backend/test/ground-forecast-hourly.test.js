import assert from 'node:assert/strict'
import test from 'node:test'

import { skyPtyToIcon, extractHourlySlots } from '../src/processors/ground-forecast-processor.js'

test('skyPtyToIcon: 강수형태(PTY)가 하늘상태(SKY)보다 우선', () => {
  assert.equal(skyPtyToIcon(1, 1), 'rain')   // 맑아도 비 오면 rain
  assert.equal(skyPtyToIcon(4, 3), 'snow')
  assert.equal(skyPtyToIcon(1, 0), 'sunny')
  assert.equal(skyPtyToIcon(3, 0), 'mostly_cloudy')
  assert.equal(skyPtyToIcon(4, 0), 'cloudy')
})

function makeItem(date, time, category, value) {
  return { fcstDate: date, fcstTime: time, category, fcstValue: value }
}

test('extractHourlySlots: 향후 24h를 1시간 간격 24슬롯으로 추출', () => {
  // 기준 시각 2026-06-30 14:00 KST → UTC 05:00
  const now = new Date('2026-06-30T05:00:00Z')
  const items = []
  // 12:00부터 +27h까지 매시간 TMP/POP/SKY/PTY 생성
  for (let h = 12; h <= 39; h += 1) {
    const day = h < 24 ? '20260630' : '20260701'
    const hh = String(h % 24).padStart(2, '0') + '00'
    items.push(makeItem(day, hh, 'TMP', String(20 + (h % 5))))
    items.push(makeItem(day, hh, 'POP', String((h % 6) * 10)))
    items.push(makeItem(day, hh, 'SKY', '1'))
    items.push(makeItem(day, hh, 'PTY', '0'))
  }

  const slots = extractHourlySlots(items, now)
  assert.equal(slots.length, 24)
  for (const slot of slots) {
    assert.ok(Number.isFinite(slot.temp))
    assert.ok(Number.isFinite(slot.rainProb))
    assert.equal(slot.icon, 'sunny')
  }

  // 현재(14시) 직전 한 시간부터 매시간 빠짐없이 이어진다. 도착 시각이 몇 시든 그 칸이 있어야 한다.
  const hours = slots.map((s) => Number(s.time.slice(0, 2)))
  assert.equal(hours[0], 13)
  for (let index = 1; index < hours.length; index += 1) {
    assert.equal(hours[index], (hours[index - 1] + 1) % 24, `${index}번째 슬롯이 1시간 간격이 아니다`)
  }
})

test('extractHourlySlots: 3시간 간격 화면은 원본에서 솎아 쓸 수 있다', () => {
  // GroundHourlyStrip이 하는 일. 1시간 원본에서 3의 배수만 골라도 8칸이 나온다.
  const now = new Date('2026-06-30T05:00:00Z')
  const items = []
  for (let h = 12; h <= 39; h += 1) {
    const day = h < 24 ? '20260630' : '20260701'
    const hh = `${String(h % 24).padStart(2, '0')}00`
    for (const [category, value] of [['TMP', '20'], ['POP', '0'], ['SKY', '1'], ['PTY', '0']]) {
      items.push(makeItem(day, hh, category, value))
    }
  }
  const everyThird = extractHourlySlots(items, now).filter((slot) => Number(slot.time.slice(0, 2)) % 3 === 0)
  assert.equal(everyThird.length, 8)
  assert.equal(Number(everyThird[0].time.slice(0, 2)), 15)
})

test('extractHourlySlots: 빈 입력은 빈 배열', () => {
  assert.deepEqual(extractHourlySlots([], new Date()), [])
})
