import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNwpTimeSegments, normalizeNwpTimeSelection } from './nwp-time-selection.js'

test('normalizes duplicate and unknown waypoint overrides in route order', () => {
  const result = normalizeNwpTimeSelection({
    baseTime: '2026-08-19T10:00:00.000Z',
    waypointOverrides: [
      { waypointId: 'WP4', offsetHours: 2 },
      { waypointId: 'WP2', offsetHours: 1 },
      { waypointId: 'WP2', offsetHours: 9 },
      { waypointId: 'gone', offsetHours: 3 },
      { waypointId: 'WP4', offsetHours: 13 },
    ],
  }, ['DEP', 'WP2', 'WP4', 'ARR'])

  assert.deepEqual(result, {
    baseTime: '2026-08-19T10:00:00.000Z',
    waypointOverrides: [
      { waypointId: 'WP2', offsetHours: 9 },
      { waypointId: 'WP4', offsetHours: 2 },
    ],
    missingWaypointIds: ['gone'],
  })
})

test('makes a changed waypoint govern every following leg until the next change', () => {
  const result = buildNwpTimeSegments({
    markers: [
      { id: 'DEP', distanceNm: 0 },
      { id: 'WP2', distanceNm: 40 },
      { id: 'WP4', distanceNm: 90 },
      { id: 'ARR', distanceNm: 120 },
    ],
    selection: {
      baseTime: '2026-08-19T10:00:00.000Z',
      waypointOverrides: [
        { waypointId: 'WP2', offsetHours: 1 },
        { waypointId: 'WP4', offsetHours: 2 },
      ],
    },
  })

  assert.deepEqual(result, [
    { startWaypointId: 'DEP', startDistanceNm: 0, endDistanceNm: 40, offsetHours: 0 },
    { startWaypointId: 'WP2', startDistanceNm: 40, endDistanceNm: 90, offsetHours: 1 },
    { startWaypointId: 'WP4', startDistanceNm: 90, endDistanceNm: 120, offsetHours: 2 },
  ])
})
