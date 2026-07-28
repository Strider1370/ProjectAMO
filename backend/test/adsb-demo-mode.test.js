import { test } from 'node:test'
import assert from 'node:assert/strict'

import { process } from '../src/processors/adsb-processor.js'

test('ADS-B keeps publishing to the isolated live root while demo is active', async () => {
  let fetched = false
  const result = await process({
    demoMode: () => true,
    fetchPayload: async () => {
      fetched = true
      return { ac: [] }
    },
  })
  assert.equal(result.saved, true)
  assert.equal(fetched, true)
})

test('ADS-B publication does not depend on a demo-mode transition during fetch', async () => {
  let checks = 0
  const result = await process({
    demoMode: () => ++checks >= 2,
    fetchPayload: async () => ({ ac: [], now: Date.now() }),
  })
  assert.equal(result.saved, true)
})
