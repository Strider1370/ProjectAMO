import { test } from 'node:test'
import assert from 'node:assert/strict'

import apiClient from '../src/api-client.js'
import metarProcessor from '../src/processors/metar-processor.js'
import tafProcessor from '../src/processors/taf-processor.js'
import takeoffForecastProcessor from '../src/processors/takeoff-forecast-processor.js'

test('long-running airport collectors propagate transition cancellation', async () => {
  const originalFetch = apiClient.fetch
  const originalFetchTakeoffFcst = apiClient.fetchTakeoffFcst
  const pending = (_type, _icao, { signal } = {}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  apiClient.fetch = pending
  apiClient.fetchTakeoffFcst = (_icao, _fctm, options) => pending(null, null, options)

  const controllers = [new AbortController(), new AbortController(), new AbortController()]
  try {
    const requests = [
      metarProcessor.processAll({ signal: controllers[0].signal }),
      tafProcessor.processAll({ signal: controllers[1].signal }),
      takeoffForecastProcessor.process({ signal: controllers[2].signal }),
    ]
    await new Promise((resolve) => setImmediate(resolve))
    for (const controller of controllers) {
      controller.abort(new Error('demo transition'))
    }

    const results = await Promise.allSettled(requests)
    assert.deepEqual(results.map(({ status }) => status), ['rejected', 'rejected', 'rejected'])
    assert.deepEqual(results.map(({ reason }) => reason.message), [
      'demo transition',
      'demo transition',
      'demo transition',
    ])
  } finally {
    apiClient.fetch = originalFetch
    apiClient.fetchTakeoffFcst = originalFetchTakeoffFcst
  }
})
