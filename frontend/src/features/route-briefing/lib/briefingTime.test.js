import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBriefingTime } from './briefingTime.js'

test('formatBriefingTime renders compact tz label', () => {
  assert.equal(formatBriefingTime('2026-06-27T11:50:00Z', 'UTC'), '11:50Z')
  assert.equal(formatBriefingTime('2026-06-27T02:50:00Z', 'KST'), '11:50 KST')
  assert.equal(formatBriefingTime('2026-06-27T11:50:00Z', 'UTC', { withDate: true }), '06-27 11:50Z')
})

test('formatBriefingTime returns dash on invalid input', () => {
  assert.equal(formatBriefingTime(null, 'UTC'), '\u2014')
  assert.equal(formatBriefingTime('nope', 'KST'), '\u2014')
})

test('exports only the live briefing formatter', async () => {
  const module = await import('./briefingTime.js')
  assert.deepEqual(Object.keys(module), ['formatBriefingTime'])
})
