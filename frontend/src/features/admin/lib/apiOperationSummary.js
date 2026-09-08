import { EXECUTION_WORD } from './adminFormat.js'

export function apiOperationSummary(operations = []) {
  const success = operations.filter(op => op.outcome === 'succeeded').length
  const counts = Object.keys(EXECUTION_WORD).map(outcome => {
    const count = operations.filter(op => (Object.hasOwn(EXECUTION_WORD, op.outcome) ? op.outcome : 'unknown') === outcome).length
    return count ? `${EXECUTION_WORD[outcome]} ${count}` : null
  }).filter(Boolean).join(' / ')
  const scheduled = operations.filter(op => op.expected?.kind === 'scheduled' && Number.isFinite(Date.parse(op.expected.nextExpectedAt)))
  const nextAt = scheduled.sort((a,b) => Date.parse(a.expected.nextExpectedAt) - Date.parse(b.expected.nextExpectedAt))[0]?.expected.nextExpectedAt || null
  const labels = [...new Set(operations.filter(op => op.expected?.kind !== 'scheduled').map(op => op.expected?.label).filter(Boolean))]
  return {
    result: operations.length ? `API ${operations.length}종 · ${success === operations.length ? '모두 성공' : counts}` : '연결된 API 없음',
    nextAt,
    fallback: labels.length === 1 ? labels[0] : '예정 없음',
  }
}
