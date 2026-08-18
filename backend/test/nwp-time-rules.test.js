import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveNwpTimeAvailability, resolveNwpTimeRules } from '../src/briefing/enroute-cross-section.js'

const markers = [
  { id: 'DEP', distanceNm: 0 },
  { id: 'WP2', distanceNm: 40 },
  { id: 'ARR', distanceNm: 80 },
]
const candidateTimes = [
  { hf: 0, validTime: '2026-08-19T10:00:00.000Z' },
  { hf: 1, validTime: '2026-08-19T11:00:00.000Z' },
  { hf: 3, validTime: '2026-08-19T13:00:00.000Z' },
]

test('uses only an exact KIM valid time for each waypoint time segment', () => {
  const result = resolveNwpTimeRules({
    markers,
    selection: {
      baseTime: '2026-08-19T10:00:00.000Z',
      waypointOverrides: [{ waypointId: 'WP2', offsetHours: 1 }],
    },
    candidateTimes,
  })

  assert.deepEqual(result.segments.map((segment) => [segment.startWaypointId, segment.offsetHours, segment.kim?.hf]), [
    ['DEP', 0, 0],
    ['WP2', 1, 1],
  ])
  assert.equal(result.unavailableOffsets.includes(2), true)
})

test('keeps an unavailable KIM offset unavailable instead of choosing the nearest time', () => {
  const result = resolveNwpTimeRules({
    markers,
    selection: {
      baseTime: '2026-08-19T10:00:00.000Z',
      waypointOverrides: [{ waypointId: 'WP2', offsetHours: 2 }],
    },
    candidateTimes,
  })

  assert.equal(result.segments[1].kim, null)
  assert.equal(result.unavailableOffsets.includes(2), true)
})

test('exposes unavailable offsets before the user creates a waypoint override', () => {
  const result = resolveNwpTimeAvailability({
    baseTime: '2026-08-19T10:00:00.000Z',
    candidateTimes,
  })

  assert.deepEqual(result.unavailableOffsets, [2, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})
