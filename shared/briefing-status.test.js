import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ALTITUDE_EXPOSURE,
  BRIEFING_EXCLUDED_FIELDS,
  BRIEFING_STATUS_COPY,
  HORIZONTAL_EXPOSURE,
  TIME_STATUS,
  isUnresolvedBriefingStatus,
} from './briefing-status.js'

test('three briefing-stage fixtures keep unresolved states out of clear', () => {
  const fixtures = [
    { horizontalExposure: HORIZONTAL_EXPOSURE.UNKNOWN },
    { altitudeExposure: ALTITUDE_EXPOSURE.UNAVAILABLE },
    { timeStatus: TIME_STATUS.NOT_PROVIDED },
  ]

  for (const fixture of fixtures) {
    const status = Object.values(fixture)[0]
    assert.ok(isUnresolvedBriefingStatus(status))
    assert.notEqual(status, HORIZONTAL_EXPOSURE.CLEAR)
    assert.notEqual(BRIEFING_STATUS_COPY[status], BRIEFING_STATUS_COPY.clear)
  }
})

test('briefing contract excludes performance, fuel, ETA calculation, and recommendations', () => {
  assert.deepEqual(BRIEFING_EXCLUDED_FIELDS, [
    'tasKt', 'groundSpeedKt', 'headingDeg', 'eta', 'fuel', 'recommended',
  ])
})
