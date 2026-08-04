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
  // 12:00부터 +24h까지 매시간 TMP/POP/SKY/PTY 생성 (72칸 상한보다 적게 만들어 상한과 무관하게 검증)
  for (let h = 12; h <= 36; h += 1) {
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
  for (let h = 12; h <= 36; h += 1) {
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

test('extractHourlySlots: 3일치(72칸)까지 담는다', () => {
  // 2안·3안 사이니지가 3일 예보를 그리므로 24칸이 아니라 72칸까지 나와야 한다.
  const now = new Date('2026-06-30T05:00:00Z') // 2026-06-30 14:00 KST
  const items = []
  const start = new Date('2026-06-30T12:00:00Z') // fcstDate/fcstTime은 KST 벽시계 숫자를 그대로 담으므로 12:00부터, 날짜 롤오버는 Date 연산에 맡긴다
  for (let h = 0; h < 80; h += 1) {
    const at = new Date(start.getTime() + h * 3600 * 1000)
    const pad = (value) => String(value).padStart(2, '0')
    const fcstDate = `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`
    const fcstTime = `${pad(at.getUTCHours())}00`
    items.push(makeItem(fcstDate, fcstTime, 'TMP', '20'))
    items.push(makeItem(fcstDate, fcstTime, 'POP', '30'))
    items.push(makeItem(fcstDate, fcstTime, 'SKY', '1'))
  }
  const slots = extractHourlySlots(items, now)
  assert.equal(slots.length, 72)
})

test('extractHourlySlots: 예보가 짧으면 있는 만큼만 담는다', () => {
  const now = new Date('2026-06-30T05:00:00Z')
  const items = []
  for (let h = 12; h <= 21; h += 1) {
    const hh = `${String(h % 24).padStart(2, '0')}00`
    items.push(makeItem('20260630', hh, 'TMP', '20'))
    items.push(makeItem('20260630', hh, 'POP', '30'))
    items.push(makeItem('20260630', hh, 'SKY', '1'))
  }
  const slots = extractHourlySlots(items, now)
  assert.equal(slots.length, 9) // h=13..21, now-1h 필터 이후 9칸
})

test('extractHourlySlots: 빈 입력은 빈 배열', () => {
  assert.deepEqual(extractHourlySlots([], new Date()), [])
})
