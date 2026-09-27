import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtBulletinTime } from './airportInfoTime.js'

test('airport bulletin KST publication time follows the display timezone across midnight', () => {
  const source = '2026-09-27 06:00:00.0'
  assert.equal(fmtBulletinTime(source, 'KST'), '2026년 09월 27일 06시 KST')
  assert.equal(fmtBulletinTime(source, 'UTC'), '2026년 09월 26일 21시 UTC')
})
