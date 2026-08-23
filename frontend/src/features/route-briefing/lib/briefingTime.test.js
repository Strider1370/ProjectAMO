import { test } from 'node:test'
import assert from 'node:assert/strict'
import { briefingTimeFields, buildBriefingTimeIso, formatBriefingTime } from './briefingTime.js'

test('formatBriefingTime renders compact tz label', () => {
  assert.equal(formatBriefingTime('2026-06-27T11:50:00Z', 'UTC'), '11:50Z')
  assert.equal(formatBriefingTime('2026-06-27T02:50:00Z', 'KST'), '11:50 KST')
  assert.equal(formatBriefingTime('2026-06-27T11:50:00Z', 'UTC', { withDate: true }), '06-27 11:50Z')
})

test('formatBriefingTime returns dash on invalid input', () => {
  assert.equal(formatBriefingTime(null, 'UTC'), '\u2014')
  assert.equal(formatBriefingTime('nope', 'KST'), '\u2014')
})

test('manual ETA wall-clock fields round-trip in the selected timezone', () => {
  assert.deepEqual(briefingTimeFields('2026-08-23T02:35:00Z', 'KST'), { year: 2026, month: 8, day: 23, hour: 11, minute: 35 })
  assert.equal(buildBriefingTimeIso({ year: 2026, month: 8, day: 23, hour: 11, minute: 35 }, 'KST'), '2026-08-23T02:35:00.000Z')
  assert.equal(buildBriefingTimeIso({ year: 2026, month: 8, day: 23, hour: 11, minute: 35 }, 'UTC'), '2026-08-23T11:35:00.000Z')
})
