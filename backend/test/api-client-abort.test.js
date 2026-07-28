import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fetchApi } from '../src/api-client.js'

test('fetchApi aborts immediately while waiting between retries', async () => {
  const originalFetch = globalThis.fetch
  const controller = new AbortController()
  let attempts = 0
  globalThis.fetch = async () => {
    attempts += 1
    throw new Error('upstream unavailable')
  }

  try {
    const startedAt = Date.now()
    const request = fetchApi('metar', 'RKSI', {
      signal: controller.signal,
      maxRetries: 3,
      retryDelayMs: 60_000,
    })
    setTimeout(() => controller.abort(new Error('demo transition')), 10)

    await assert.rejects(request, /demo transition/)
    assert.equal(attempts, 1)
    assert.ok(Date.now() - startedAt < 1_000)
  } finally {
    globalThis.fetch = originalFetch
  }
})
