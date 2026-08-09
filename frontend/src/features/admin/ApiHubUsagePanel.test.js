import assert from 'node:assert/strict'
import test from 'node:test'

import { sortEndpointUsage } from './ApiHubUsagePanel.js'

test('sorts API endpoint usage by received bytes without changing the source rows', () => {
  const endpoints = [{ label: 'GK2A IR', bytes: 50 }, { label: '레이더 QCD', bytes: 100 }]
  assert.deepEqual(sortEndpointUsage(endpoints).map((endpoint) => endpoint.label), ['레이더 QCD', 'GK2A IR'])
  assert.deepEqual(endpoints.map((endpoint) => endpoint.label), ['GK2A IR', '레이더 QCD'])
})
