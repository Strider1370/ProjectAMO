import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleStateOverWindow } from '../src/briefing/schedule-window.js'

const BASE = { validFrom: '2026-07-25T10:00:00Z', validTo: '2026-08-29T12:00:00Z' }
const FIREWORKS = 'JUL 25 1000-1200, AUG 01-02 08 15-16 22 29 1000-1200'

test('시간표 안의 비행 → active', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: FIREWORKS, etd: '2026-08-01T10:10:00Z', eta: '2026-08-01T11:10:00Z',
  }), 'active')
})

test('시간표 밖의 비행 → outside', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: FIREWORKS, etd: '2026-08-05T02:00:00Z', eta: '2026-08-05T03:00:00Z',
  }), 'outside')
})

test('구간이 시간표에 걸치기만 해도 active', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: FIREWORKS, etd: '2026-08-01T09:30:00Z', eta: '2026-08-01T10:05:00Z',
  }), 'active')
})

test('시간표가 없으면 unknown이 아니라 active로 둔다', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: null, etd: '2026-08-05T02:00:00Z', eta: '2026-08-05T03:00:00Z',
  }), 'active')
})

test('해석 못 하는 표기는 unknown — 꺼진 것으로 치지 않는다', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: 'MON-FRI SR-SS', etd: '2026-08-05T02:00:00Z', eta: '2026-08-05T03:00:00Z',
  }), 'unknown')
})

test('비행시각이 없으면 unknown', () => {
  assert.equal(scheduleStateOverWindow({
    ...BASE, scheduleText: FIREWORKS, etd: null, eta: null,
  }), 'unknown')
})
