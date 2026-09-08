import test from 'node:test'
import assert from 'node:assert/strict'
import { apiOperationSummary } from './apiOperationSummary.js'

test('API summary distinguishes outcomes and chooses the earliest scheduled call', () => {
  const ops = [
    { outcome: 'succeeded', expected: { kind: 'scheduled', nextExpectedAt: '2026-09-08T12:00:00Z' } },
    { outcome: 'failed', expected: { kind: 'scheduled', nextExpectedAt: '2026-09-08T11:00:00Z' } },
    { outcome: 'unknown', expected: { kind: 'disabled', nextExpectedAt: '2026-09-08T09:00:00Z' } },
  ]
  assert.deepEqual(apiOperationSummary(ops), { result: 'API 3종 · 성공 1 / 실패 1 / 기록 없음 1', nextAt: '2026-09-08T11:00:00Z', fallback: '예정 없음' })
  assert.equal(apiOperationSummary(ops.slice(0,1)).result, 'API 1종 · 모두 성공')
  assert.equal(apiOperationSummary([{expected:{kind:'conditional',label:'수집 시'}}]).fallback, '수집 시')
  assert.equal(apiOperationSummary([]).result, '연결된 API 없음')
  assert.equal(apiOperationSummary([{outcome:'skipped'},{outcome:'missed'},{outcome:'unknown'}]).result, 'API 3종 · 건너뜀 1 / 미실행 1 / 기록 없음 1')
})
