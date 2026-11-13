import test from 'node:test'
import assert from 'node:assert/strict'
import { bulletinSeasonLabels, fmtBulletinTime } from './airportInfoTime.js'

test('bulletin labels use the KST issue month, including both winter boundaries', () => {
  for (const month of ['11', '12', '01', '02', '03', '04']) {
    const labels = bulletinSeasonLabels(`2026-${month}-01 00:30:00.0`)
    assert.equal(labels.feelsLike, '예상 최저체감온도 (℃)')
    assert.equal(labels.precipitation, '예상 강수량(mm)/적설(cm)')
    assert.equal(labels.precipitationSummary, '예상 강수량/적설')
  }
  for (const month of ['05', '06', '07', '08', '09', '10']) {
    const labels = bulletinSeasonLabels(`2026-${month}-01 00:30:00.0`)
    assert.equal(labels.feelsLike, '예상 최고체감온도 (℃)')
    assert.equal(labels.precipitation, '예상 강수량(mm)')
  }
  assert.equal(bulletinSeasonLabels(null).feelsLike, '예상 체감온도 (℃)')
})

test('airport bulletin KST publication time follows the display timezone across midnight', () => {
  const source = '2026-09-27 06:00:00.0'
  assert.equal(fmtBulletinTime(source, 'KST'), '2026년 09월 27일 06시 KST')
  assert.equal(fmtBulletinTime(source, 'UTC'), '2026년 09월 26일 21시 UTC')
})
