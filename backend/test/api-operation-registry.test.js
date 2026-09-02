import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  API_OPERATION_REGISTRY,
  assertApiOperationRegistry,
  describeExpectedApiCall,
  resolveApiOperation,
} from '../src/api-operation-registry.js'

test('every API Hub operation has a registered id and label', () => {
  for (const operation of API_OPERATION_REGISTRY.filter((item) => item.apiHub)) {
    assert.ok(operation.id)
    assert.ok(operation.label)
  }
})

test('rejects an explicit id when it does not match the request URL', () => {
  assert.throws(() => resolveApiOperation({
    id: 'metar',
    url: new URL('https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getTaf'),
  }), { code: 'api_operation_id_url_mismatch' })
})

test('rejects ambiguous operations and non-on-demand operations without data health rows', () => {
  assert.throws(() => assertApiOperationRegistry([
    { id: 'one', label: 'One', provider: 'test', collectorType: null, dataHealthKeys: ['metar'], callContract: { kind: 'conditional', label: 'when needed' }, credentialCategory: null, apiHub: false, requestPolicy: { timeoutMs: 1000, maxRetries: 0, allowedOverrides: [] }, match: () => true },
    { id: 'two', label: 'Two', provider: 'test', collectorType: null, dataHealthKeys: ['taf'], callContract: { kind: 'conditional', label: 'when needed' }, credentialCategory: null, apiHub: false, requestPolicy: { timeoutMs: 1000, maxRetries: 0, allowedOverrides: [] }, match: () => true },
  ]), { code: 'ambiguous_api_operation_matcher' })
  assert.throws(() => assertApiOperationRegistry([
    { id: 'missing-health', label: 'Missing health', provider: 'test', collectorType: null, dataHealthKeys: [], callContract: { kind: 'conditional', label: 'when needed' }, credentialCategory: null, apiHub: false, requestPolicy: { timeoutMs: 1000, maxRetries: 0, allowedOverrides: [] }, match: () => false },
  ]), { code: 'missing_api_operation_data_health_keys' })
})

test('uses the next actual KST cron match after a quiet window', () => {
  const operation = {
    id: 'terminal_iiac',
    label: 'IIAC arrivals',
    callContract: { kind: 'cron', expression: '*/10 6-18 * * *', timezone: 'Asia/Seoul', quiet: { fromHourKst: 0, toHourKst: 4 } },
  }
  const actual = describeExpectedApiCall(operation, null, Date.parse('2026-08-10T08:55:00.000Z'))
  assert.deepEqual(actual, {
    kind: 'scheduled', cadenceLabel: '10분마다 (06:00–18:59)', timezone: 'Asia/Seoul', operatingHoursLabel: '06:00–18:59 KST', cronExpression: '*/10 6-18 * * *', nextExpectedAt: '2026-08-10T09:00:00.000Z',
  })
})

test('reports on-demand APIs without an expected timestamp', () => {
  assert.deepEqual(describeExpectedApiCall({ label: 'ADS-B', callContract: { kind: 'on_demand' } }, null, Date.now()), { kind: 'on_demand', label: '온디맨드' })
})
