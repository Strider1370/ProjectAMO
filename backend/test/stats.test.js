import assert from 'node:assert/strict'
import test from 'node:test'

const statsModule = await import(`../src/stats.js?stats-test=${Date.now()}`)

test('stats tracks overseas weather job types', () => {
  statsModule.recordSuccess('metar_overseas', { failedAirports: ['RJTT'] })
  statsModule.recordFailure('sigmet_overseas', 'NOAA unavailable')

  const stats = statsModule.getStats()
  assert.equal(stats.types.metar_overseas.total_runs, 1)
  assert.equal(stats.types.metar_overseas.airport_failures.RJTT, 1)
  assert.equal(stats.types.sigmet_overseas.failure, 1)
  assert.equal(stats.recent_runs[0].type, 'sigmet_overseas')
})

test('stats records an API Hub budget skip as a non-failure recent run', () => {
  statsModule.recordSkip('wissdom', 'api_hub_key_blocked')
  const recent = statsModule.getStats().recent_runs[0]
  assert.deepEqual(
    { type: recent.type, success: recent.success, skipped: recent.skipped, reason: recent.reason },
    { type: 'wissdom', success: true, skipped: true, reason: 'api_hub_key_blocked' },
  )
})
