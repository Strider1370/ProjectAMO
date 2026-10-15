import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNwpTimeRail, rebaseNwpTimeSelection, setWaypointNwpOffset } from './nwpTimeSelection.js'

const initial = {
  baseTime: '2026-08-19T10:00:00.000Z',
  waypointOverrides: [{ waypointId: 'WP2', offsetHours: 1 }],
}

test('rebasing the global forecast time preserves relative waypoint offsets', () => {
  assert.deepEqual(rebaseNwpTimeSelection(initial, '2026-08-19T11:00:00.000Z'), {
    baseTime: '2026-08-19T11:00:00.000Z',
    waypointOverrides: [{ waypointId: 'WP2', offsetHours: 1 }],
  })
})

test('setting an offset replaces the waypoint rule and null removes it', () => {
  const changed = setWaypointNwpOffset(initial, 'WP2', 2, ['DEP', 'WP2', 'ARR'])
  assert.deepEqual(changed.waypointOverrides, [{ waypointId: 'WP2', offsetHours: 2 }])
  assert.deepEqual(setWaypointNwpOffset(changed, 'WP2', null, ['DEP', 'WP2', 'ARR']).waypointOverrides, [])
})

test('time rail labels only the base and actual change points', () => {
  const rail = buildNwpTimeRail([
    { id: 'DEP', distanceNm: 0 }, { id: 'WP2', distanceNm: 20 }, { id: 'ARR', distanceNm: 40 },
  ], initial)
  assert.deepEqual(rail.map((segment) => [segment.startWaypointId, segment.offsetHours, segment.showLabel]), [
    ['DEP', 0, true], ['WP2', 1, true],
  ])
})

test('missing availability metadata derives exact times without enabling absent forecasts', async () => {
  const { unavailableNwpOffsets } = await import('./nwpTimeSelection.js')
  const crossSection = { run: { validTime: '2026-09-10T15:00:00Z' }, availableTimes: [{ validTime: '2026-09-10T12:00:00Z' }, { validTime: '2026-09-10T15:00:00Z' }] }
  assert.deepEqual(unavailableNwpOffsets(crossSection), Array.from({ length: 12 }, (_, i) => i + 1))
  const earlier = unavailableNwpOffsets(crossSection, { baseTime: '2026-09-10T12:00:00Z' })
  assert.equal(earlier.includes(3), false)
  assert.equal(earlier.includes(1), true)
  assert.deepEqual(unavailableNwpOffsets({ ...crossSection, timeRules: { unavailableOffsets: [2] } }), [2])
})
