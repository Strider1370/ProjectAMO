import test from 'node:test'
import assert from 'node:assert/strict'

import { inQuietHours, kstMinuteOfDay } from '../src/user-alerts/quiet-hours.js'

test('quiet hours use KST and wrap past midnight', () => {
  const at = (kst) => Date.parse(`2026-10-27T${kst}:00+09:00`)
  assert.equal(kstMinuteOfDay(at('23:30')), 23 * 60 + 30)
  const night = { enabled: true, start: 23 * 60, end: 6 * 60 }
  assert.equal(inQuietHours(night, at('23:00')), true)
  assert.equal(inQuietHours(night, at('02:15')), true)
  assert.equal(inQuietHours(night, at('06:00')), false)
  assert.equal(inQuietHours(night, at('12:00')), false)
  const day = { enabled: true, start: 9 * 60, end: 18 * 60 } // 야간 근무자: 낮에 끈다
  assert.equal(inQuietHours(day, at('13:00')), true)
  assert.equal(inQuietHours(day, at('20:00')), false)
  assert.equal(inQuietHours({ ...night, enabled: false }, at('02:00')), false)
})
