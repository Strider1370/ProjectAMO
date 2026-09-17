import assert from 'node:assert/strict'
import test from 'node:test'

import { createPollingRequestGate } from './useWeatherPolling.js'

test('a new view epoch aborts and rejects an earlier initial request', () => {
  const gate = createPollingRequestGate()
  gate.invalidateView()
  const initialA = gate.begin(['initial'])

  gate.invalidateView()
  const initialB = gate.begin(['initial'])

  assert.equal(initialA.controller.signal.aborted, true)
  assert.equal(gate.isCurrent(initialA), false)
  assert.equal(gate.isCurrent(initialB), true)
})

test('the latest generation owns a shared deferred or polling key without cancelling other keys', () => {
  const gate = createPollingRequestGate()
  const airportInfoA = gate.begin(['airportInfo'])
  const sigwxHistory = gate.begin(['sigwxLowHistory'])
  const airportInfoB = gate.begin(['airportInfo'])

  assert.equal(airportInfoA.controller.signal.aborted, true)
  assert.equal(gate.isCurrent(airportInfoA), false)
  assert.equal(gate.isCurrent(airportInfoB), true)
  assert.equal(gate.isCurrent(sigwxHistory), true)
})
