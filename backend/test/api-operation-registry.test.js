import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  API_OPERATION_REGISTRY,
  assertApiOperationRegistry,
  describeExpectedApiCall,
  resolveApiOperation,
} from '../src/api-operation-registry.js'
import config from '../src/config.js'
import { activeCollectorRegistry } from '../src/collector-registry.js'

test('each canonical operation URL resolves to exactly its declared operation', () => {
  for (const operation of API_OPERATION_REGISTRY) {
    const resolved = resolveApiOperation({ url: operation.canonicalUrl })
    assert.equal(resolved.id, operation.id, operation.id)
    assert.equal(resolveApiOperation({ id: operation.id, url: operation.canonicalUrl }).id, operation.id)
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
    { id: 'one', label: 'One', provider: 'test', collectorType: null, dataHealthKeys: ['metar'], callContract: { kind: 'conditional', label: 'when needed' }, credentialCategory: null, apiHub: false, canonicalUrl: 'https://example.test/one', requestPolicy: { timeoutMs: 1000, maxRetries: 0, allowedOverrides: [] }, match: () => true },
    { id: 'two', label: 'Two', provider: 'test', collectorType: null, dataHealthKeys: ['taf'], callContract: { kind: 'conditional', label: 'when needed' }, credentialCategory: null, apiHub: false, canonicalUrl: 'https://example.test/two', requestPolicy: { timeoutMs: 1000, maxRetries: 0, allowedOverrides: [] }, match: () => true },
  ]), { code: 'ambiguous_api_operation_matcher' })
  assert.throws(() => assertApiOperationRegistry([
    { id: 'missing-health', label: 'Missing health', provider: 'test', collectorType: null, dataHealthKeys: [], callContract: { kind: 'conditional', label: 'when needed' }, credentialCategory: null, apiHub: false, canonicalUrl: 'https://example.test/missing', requestPolicy: { timeoutMs: 1000, maxRetries: 0, allowedOverrides: [] }, match: (url) => url.pathname === '/missing' },
  ]), { code: 'missing_api_operation_data_health_keys' })
})

test('rejects malformed contract shapes before a registry can be used', () => {
  const base = { id: 'invalid', label: 'Invalid', provider: 'test', collectorType: null, dataHealthKeys: ['metar'], credentialCategory: null, apiHub: false, canonicalUrl: 'https://example.test/a', match: () => false }
  assert.throws(() => assertApiOperationRegistry([{ ...base, callContract: { kind: 'cron', expression: 'bad cron', timezone: 'Mars/Olympus' }, requestPolicy: { timeoutMs: 1, maxRetries: 0, allowedOverrides: [] } }]), { code: 'invalid_api_operation_contract' })
  assert.throws(() => assertApiOperationRegistry([{ ...base, callContract: { kind: 'collector' }, collectorType: 'missing', requestPolicy: { timeoutMs: 1, maxRetries: 0, allowedOverrides: [] } }]), { code: 'unresolved_api_operation_collector' })
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

test('skips a midnight quiet window and formats fixed and nonuniform schedules without inventing an interval', () => {
  const quiet = { callContract: { kind: 'cron', expression: '0 0,4 * * *', timezone: 'Asia/Seoul', quiet: { fromHourKst: 0, toHourKst: 4 } } }
  const fixed = describeExpectedApiCall(quiet, null, Date.parse('2026-08-10T14:59:00.000Z'))
  assert.equal(fixed.nextExpectedAt, '2026-08-10T19:00:00.000Z')
  assert.equal(fixed.cadenceLabel, '00:00, 04:00')
  const nonuniform = describeExpectedApiCall({ callContract: { kind: 'cron', expression: '25 1,2,7,8,13,14,19,20 * * *', timezone: 'Etc/UTC' } }, null, Date.parse('2026-08-10T00:00:00.000Z'))
  assert.equal(nonuniform.cadenceLabel, '01:25, 02:25, 07:25, 08:25, 13:25, 14:25, 19:25, 20:25')
})

test('preserves current IIAC, NOAA, and collector request contracts', () => {
  const iiac = API_OPERATION_REGISTRY.find((operation) => operation.id === 'iiac_arrivals')
  const noaa = API_OPERATION_REGISTRY.find((operation) => operation.id === 'noaa_metar')
  assert.equal(iiac.callContract.expression, '*/10 6-19 * * *')
  assert.equal(iiac.requestPolicy.timeoutMs, config.api.timeout_ms)
  assert.equal(noaa.requestPolicy.timeoutMs, config.noaa.timeout_ms)
  const rainviewer = API_OPERATION_REGISTRY.find((operation) => operation.id === 'rainviewer')
  assert.equal(describeExpectedApiCall(rainviewer, activeCollectorRegistry(config).find((item) => item.type === 'rainviewer'), Date.now()).cronExpression, config.schedule.rainviewer_interval)
})

test('reports on-demand APIs without an expected timestamp', () => {
  assert.deepEqual(describeExpectedApiCall({ label: 'ADS-B', callContract: { kind: 'on_demand' } }, null, Date.now()), { kind: 'on_demand', label: '온디맨드' })
})
