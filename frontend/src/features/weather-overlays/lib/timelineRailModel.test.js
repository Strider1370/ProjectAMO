import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_PAST_WINDOW_MS,
  VISIBLE_SPAN_MS,
  buildHourTicks,
  buildTapeTicks,
  buildTimelineDomain,
  clampMs,
  dragToTimeDelta,
  normalizeNwpTimes,
  percentToMs,
  pickNearestNwp,
  pickNearestPastIndex,
  tapePercent,
  toPercent,
} from './timelineRailModel.js'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 5, 30, 10, 0) // 2026-06-30 10:00Z

test('buildTimelineDomain falls back to a default window around now when no data', () => {
  const domain = buildTimelineDomain({ pastTicksMs: [], nwpTimesMs: [], nowMs: NOW })
  assert.equal(domain.nowMs, NOW)
  assert.equal(domain.startMs, NOW - DEFAULT_PAST_WINDOW_MS)
  assert.ok(domain.endMs > NOW)
})

test('buildTimelineDomain extends to oldest past frame and latest forecast', () => {
  const domain = buildTimelineDomain({
    pastTicksMs: [NOW - 5 * HOUR, NOW - HOUR],
    nwpTimesMs: [NOW + 6 * HOUR],
    nowMs: NOW,
  })
  assert.equal(domain.startMs, NOW - 5 * HOUR)
  assert.equal(domain.endMs, NOW + 6 * HOUR)
})

test('buildTimelineDomain includes QPF future ticks without treating them as NWP entries', () => {
  const domain = buildTimelineDomain({
    pastTicksMs: [NOW - HOUR],
    nwpTimesMs: [NOW + HOUR],
    qpfTimesMs: [NOW + 20 * 60 * 1000, NOW + 40 * 60 * 1000],
    nowMs: NOW,
  })
  assert.equal(domain.endMs, NOW + HOUR)
  assert.deepEqual(domain.forecastTicksMs, [NOW + 20 * 60 * 1000, NOW + 40 * 60 * 1000, NOW + HOUR])
})

test('toPercent / percentToMs round-trip now to the midpoint', () => {
  const domain = { startMs: NOW - 2 * HOUR, endMs: NOW + 2 * HOUR, nowMs: NOW }
  assert.ok(Math.abs(toPercent(domain, NOW) - 50) < 1e-6)
  assert.equal(percentToMs(domain, 50), NOW)
})

test('toPercent / clampMs clamp out-of-range values', () => {
  const domain = { startMs: NOW, endMs: NOW + HOUR, nowMs: NOW }
  assert.equal(toPercent(domain, NOW - HOUR), 0)
  assert.equal(toPercent(domain, NOW + 5 * HOUR), 100)
  assert.equal(clampMs(domain, NOW + 5 * HOUR), NOW + HOUR)
})

test('normalizeNwpTimes parses validTime to ms and sorts ascending', () => {
  const out = normalizeNwpTimes([
    { hf: 6, validTime: '2026-06-30T16:00:00Z' },
    { hf: 1, validTime: '2026-06-30T11:00:00Z' },
    { hf: 3, validTime: 'bad' },
  ])
  assert.deepEqual(out.map((t) => t.hf), [1, 6])
  assert.equal(out[0].ms, Date.UTC(2026, 5, 30, 11, 0))
})

test('pickNearestPastIndex returns the closest frame index', () => {
  const ticks = [NOW - 3 * HOUR, NOW - 2 * HOUR, NOW - HOUR]
  assert.equal(pickNearestPastIndex(ticks, NOW - 2 * HOUR - 5 * 60 * 1000), 1)
  assert.equal(pickNearestPastIndex(ticks, NOW), 2)
  assert.equal(pickNearestPastIndex([], NOW), -1)
})

test('pickNearestNwp returns the closest forecast entry', () => {
  const times = [
    { hf: 1, ms: NOW + HOUR },
    { hf: 3, ms: NOW + 3 * HOUR },
  ]
  assert.equal(pickNearestNwp(times, NOW + 2.4 * HOUR).hf, 3)
  assert.equal(pickNearestNwp(times, NOW).hf, 1)
  assert.equal(pickNearestNwp([], NOW), null)
})

test('tapePercent puts the selected time at the playhead and scrolls others', () => {
  const sel = NOW
  assert.equal(tapePercent({ ms: sel, selectedMs: sel }), 50) // playhead center
  // one full visible span ahead sits one playhead-ratio (0.5 span) to the right
  assert.equal(tapePercent({ ms: sel + VISIBLE_SPAN_MS, selectedMs: sel }), 150)
  assert.equal(tapePercent({ ms: sel - VISIBLE_SPAN_MS / 2, selectedMs: sel }), 0) // half span back -> left edge
})

test('dragToTimeDelta maps a rightward drag to earlier time', () => {
  assert.equal(dragToTimeDelta(0.5), -VISIBLE_SPAN_MS / 2) // drag right half width -> back half a span
  assert.equal(dragToTimeDelta(-0.25), VISIBLE_SPAN_MS / 4) // drag left -> forward
})

test('buildTapeTicks classifies hour/half-hour/quarter ticks', () => {
  const ticks = buildTapeTicks({ startMs: NOW, endMs: NOW + HOUR })
  // 10:00, 10:15, 10:30, 10:45, 11:00
  assert.deepEqual(ticks.map((t) => t.tier), ['major', 'minor', 'mid', 'minor', 'major'])
  assert.equal(ticks[0].ms, NOW)
})

test('buildHourTicks produces hour-aligned ticks within the domain', () => {
  const domain = { startMs: NOW - 90 * 60 * 1000, endMs: NOW + 60 * 60 * 1000, nowMs: NOW }
  const ticks = buildHourTicks(domain)
  assert.ok(ticks.length >= 2)
  ticks.forEach((ms) => assert.equal(ms % HOUR, 0))
  assert.ok(ticks[0] >= domain.startMs)
  assert.ok(ticks[ticks.length - 1] <= domain.endMs)
})
