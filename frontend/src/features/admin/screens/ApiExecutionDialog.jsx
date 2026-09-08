import { useEffect, useRef } from 'react'
import { EXECUTION_WORD, formatMs } from '../lib/adminFormat.js'

export default function ApiExecutionDialog({ row, onClose, formatDateTime, tz }) {
  const ref = useRef(null)
  useEffect(() => {
    if (row && !ref.current.open) ref.current.showModal()
    if (!row && ref.current.open) ref.current.close()
  }, [row])
  const schedules = [...new Set((row?.operations || []).map(op => {
    const expected = op.expected
    return expected?.kind === 'scheduled'
      ? [expected.cadenceLabel, expected.operatingHoursLabel].filter(Boolean).join(' · ')
      : expected?.label || '예정 없음'
  }))]
  return <dialog ref={ref} className="ac-api-dialog" aria-labelledby="ac-api-dialog-title" onClose={onClose}>
    {row && <>
      <header><h2 id="ac-api-dialog-title">{row.label} 실행 상세</h2><button type="button" onClick={onClose} aria-label="실행 상세 닫기">닫기</button></header>
      <div className="ac-api-detail-scroll" role="region" aria-label="API 실행 상세 목록" tabIndex={0}>
        {row.stats?.recentLastError && <section className="ac-api-error"><h3>마지막 오류 (24H)</h3><p>{row.stats.recentLastError}</p>{row.stats.recentLastErrorAt && <small>{formatDateTime(row.stats.recentLastErrorAt)} {tz}</small>}</section>}
        {schedules.length === 1 && <p className="ac-api-schedule"><b>호출 일정</b> <span>{schedules[0]}</span></p>}
        <table className="ac-api-detail-table"><caption>API별 실행 결과와 예정시각</caption><thead><tr><th>API</th><th>결과 · 소요</th><th>{row.airportRuns ? '새 실행 요청 가능' : '다음 예정'} · {tz}</th></tr></thead>
          <tbody>{(row.operations || []).map(op => <tr key={op.id}>
            <td>{op.label}{schedules.length > 1 && <small>{op.expected?.kind === 'scheduled' ? [op.expected.cadenceLabel,op.expected.operatingHoursLabel].filter(Boolean).join(' · ') : op.expected?.label || '예정 없음'}</small>}</td>
            <td><strong>{EXECUTION_WORD[op.outcome] || '기록 없음'}</strong>{op.durationMs != null && <small>{formatMs(op.durationMs)}</small>}{op.outcome !== 'succeeded' && (op.lastIssue?.message || op.lastIssue?.code) && <p className="ac-api-issue">{op.lastIssue.message || op.lastIssue.code}</p>}</td>
            <td>{op.expected?.kind === 'scheduled' && op.expected.nextExpectedAt ? formatDateTime(op.expected.nextExpectedAt) : op.expected?.label || '예정 없음'}</td>
          </tr>)}</tbody>
        </table>
        {!row.operations?.length && <p>연결된 API가 없습니다.</p>}
      </div>
    </>}
  </dialog>
}
