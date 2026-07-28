import { test } from 'node:test'
import assert from 'node:assert/strict'

import { process } from '../src/processors/adsb-processor.js'

test('ADS-B does not fetch or publish while demo mode is frozen', async () => {
  let fetched = false
  const result = await process({
    demoMode: () => true,
    fetchPayload: async () => {
      fetched = true
      return { ac: [] }
    },
  })
  assert.deepEqual(result, { type: 'adsb', skipped: true, reason: 'demo_mode' })
  assert.equal(fetched, false)
})

test('ADS-B drops an in-flight response when demo mode starts before publication', async () => {
  let checks = 0
  const result = await process({
    demoMode: () => ++checks >= 2,
    fetchPayload: async () => ({ ac: [], now: Date.now() }),
  })
  assert.deepEqual(result, { type: 'adsb', skipped: true, reason: 'demo_mode' })
})
