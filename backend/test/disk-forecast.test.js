// backend/test/disk-forecast.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forecastDiskFull } from '../src/admin/disk-forecast.js'

const GB = 1024 ** 3
const row = (dayOffset, usedGb) => ({
  ts: new Date(Date.parse('2026-08-01T00:00:00Z') + dayOffset * 86400000).toISOString(),
  disk_used: usedGb * GB,
  disk_total: 30 * GB,
})

test('하루 1GB씩 늘면 남은 용량을 그 속도로 나눈다', () => {
  const out = forecastDiskFull([row(0, 10), row(5, 15)])
  assert.ok(Math.abs(out.perDayBytes - GB) < GB * 0.01)
  assert.equal(out.daysLeft, 15) // (30-15)GB ÷ 1GB/일
})

test('늘지 않으면 예측하지 않는다', () => {
  assert.equal(forecastDiskFull([row(0, 18), row(5, 18)]), null)
})

test('줄어들면 예측하지 않는다', () => {
  assert.equal(forecastDiskFull([row(0, 20), row(5, 18)]), null)
})

test('표본이 둘 미만이거나 기간이 없으면 null', () => {
  assert.equal(forecastDiskFull([row(0, 10)]), null)
  assert.equal(forecastDiskFull([]), null)
  assert.equal(forecastDiskFull([row(0, 10), row(0, 12)]), null)
})
