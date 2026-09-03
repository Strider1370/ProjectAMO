import { useState } from 'react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'

import { STATUS_TONE, STATUS_WORD, formatAge, formatInterval, formatMs, formatRate } from '../lib/adminFormat.js'

// 자료 수집 상세 — 34종을 한 표로. 개요에서 "뭐가 이상한가"를 봤다면 여기서 "왜"를 판다.
//
// 성공률은 24시간 창이 아니라 집계 시작 이후 누적이다. stats가 보관하는 최근 실행 50건은
// 34종이 함께 쓰는 목록이라 METAR 한 종만으로도 십여 분이면 밀려나서, 시간 창을 계산할
// 근거가 저장돼 있지 않다. 그래서 "언제부터"를 화면에 함께 적는다.
export default function DataCollectionScreen({ health, now = Date.now() }) {
  const [onlyProblems, setOnlyProblems] = useState(false)
  const { tz } = useTimeZone()
  if (!health) return null

  const broken = health.counts.stopped + health.counts.never
  const rows = onlyProblems
    ? health.rows.filter((row) => row.status !== 'ok' && row.status !== 'quiet')
    : health.rows
  const since = health.rows.find((row) => row.stats?.since)?.stats?.since

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-big n">{broken}<s>종 멈춤</s></div>
          <div className="ac-cap">지연 {health.counts.late}종 · 나머지 {health.counts.ok}종 정상</div>
        </div>
      </div>

      <section className="ac-sec ac-flush">
        <h2>
          자료 {health.counts.total}종
          <div className="ac-seg" style={{ marginLeft: 'auto' }}>
            <button type="button" className={onlyProblems ? '' : 'ac-on'} onClick={() => setOnlyProblems(false)}>전체</button>
            <button type="button" className={onlyProblems ? 'ac-on' : ''} onClick={() => setOnlyProblems(true)}>이상만</button>
          </div>
        </h2>

        {rows.length === 0 ? (
          <p className="ac-sub" style={{ padding: '0 22px 16px' }}>이상한 자료가 없습니다.</p>
        ) : (
          <table className="ac-t">
            <thead>
              <tr>
                <th>자료</th>
                <th>상태</th>
                <th className="ac-r">마지막 성공</th>
                <th className="ac-r">정상 주기</th>
                <th className="ac-r">성공률(누적)</th>
                <th className="ac-r">평균 소요</th>
                <th className="ac-r">밀림</th>
                <th>마지막 오류</th>
                <th>API 실행 · 예정</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="ac-nm">
                    {row.label}
                    {row.eventDriven && row.activeCount != null && <div className="ac-sub">{row.activeCount}건 발효</div>}
                  </td>
                  <td><span className={`ac-chip ac-${STATUS_TONE[row.status]}`}>{STATUS_WORD[row.status]}</span></td>
                  <td className="ac-r">
                    {row.lastSuccessAt ? `${formatAge(now - Date.parse(row.lastSuccessAt))} 전` : '—'}
                    {row.contentAt && <div className="ac-sub">자료 {formatAge(now - Date.parse(row.contentAt))} 전</div>}
                  </td>
                  <td className="ac-r ac-muted">{formatInterval(row.normalMs)}</td>
                  <td className="ac-r" style={row.stats?.successRate != null && row.stats.successRate < 0.8 ? { color: 'var(--ac-bad)', fontWeight: 600 } : undefined}>
                    {formatRate(row.stats?.successRate)}
                  </td>
                  <td className="ac-r ac-muted">{formatMs(row.stats?.avgMs)}</td>
                  <td className="ac-r" style={row.stats?.skips > 0 ? { color: 'var(--ac-warn)', fontWeight: 600 } : undefined}>
                    {row.stats?.skips ?? 0}
                  </td>
                  <td className="ac-muted">{row.lastError || '—'}</td>
                  <td className="ac-muted">
                    {(row.operations || []).map((operation) => {
                      const expected = operation.expected
                      const next = expected?.nextExpectedAt ? new Date(expected.nextExpectedAt).toLocaleTimeString('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : null
                      const schedule = expected?.kind === 'scheduled' ? `${expected.cadenceLabel}${expected.operatingHoursLabel ? ` · ${expected.operatingHoursLabel}` : ''}${next ? ` · 다음 ${next}` : ''}` : expected?.label || '—'
                      return <div className="ac-sub" key={operation.id}>{operation.label} · {operation.outcome === 'succeeded' ? '성공' : operation.outcome === 'failed' ? '실패' : '미실행'} · {schedule}{operation.lastIssue?.message ? ` · ${operation.lastIssue.message}` : ''}</div>
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {since && (
          <p className="ac-sub" style={{ padding: '12px 22px 16px' }}>
            성공률과 밀림은 집계 시작({new Date(since).toLocaleDateString('ko-KR')}) 이후 누적입니다.
            시간 창 기준은 다음 단계에서 따로 쌓습니다.
          </p>
        )}
      </section>
    </>
  )
}
