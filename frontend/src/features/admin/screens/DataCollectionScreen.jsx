import { useState } from 'react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'

import { EXECUTION_WORD, STATUS_TONE, STATUS_WORD, executionProblems, formatAge, formatInterval, formatMs, formatRate } from '../lib/adminFormat.js'

// 자료 수집 상세 — 34종을 한 표로. 개요에서 "뭐가 이상한가"를 봤다면 여기서 "왜"를 판다.
//
// 성공률은 두 가지를 나란히 둔다: 24시간 창(지금 건강한가)과 집계 시작 이후 누적(길게 보면).
// 열이 열 개라 좁은 화면에서 표가 넘친다 — ac-tw가 표만 가로로 굴린다(창 밖으로 잘리지 않게).
// 모델 행의 공항별 실행시각은 접어 둔다: 네 행이 각각 열다섯 줄을 펴면 표를 읽을 수 없다.
export default function DataCollectionScreen({ health, now = Date.now() }) {
  const [onlyProblems, setOnlyProblems] = useState(false)
  const { tz } = useTimeZone()
  if (!health) return null

  const broken = health.counts.stopped + health.counts.never
  const rows = onlyProblems
    ? health.rows.filter((row) => row.status !== 'ok' && row.status !== 'quiet')
    : health.rows
  const collectorProblems = executionProblems(health.collectorExecution)
  const since = health.rows.find((row) => row.stats?.since)?.stats?.since
  const formatDateTime = (value) => value
    ? new Date(value).toLocaleString('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    : '없음'

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-big n">{broken}<s>종 멈춤</s></div>
          <div className="ac-cap">지연 {health.counts.late}종 · 나머지 {health.counts.ok}종 정상</div>
        </div>
      </div>

      <section className="ac-sec">
        <h2>수집 실행 문제<em>{collectorProblems.length}건</em></h2>
        {collectorProblems.length ? (
          <table className="ac-t"><tbody>{collectorProblems.map((entry) => (
            <tr key={entry.type}>
              <td className="ac-nm">{entry.label}</td>
              <td>{EXECUTION_WORD[entry.outcome] || EXECUTION_WORD.unknown}</td>
              <td className="ac-muted">{entry.lastIssue?.message || entry.lastIssue?.code || '정기 수집 시작 시각을 확인하세요.'}</td>
            </tr>
          ))}</tbody></table>
        ) : <p className="ac-sub" style={{ padding: '0 22px 16px' }}>현재 실패 또는 미실행 수집기가 없습니다.</p>}
      </section>

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
          <div className="ac-tw"><table className="ac-t">
            <thead>
              <tr>
                <th>자료</th>
                <th>상태</th>
                <th className="ac-r">마지막 성공 · 주기</th>
                <th className="ac-r">성공률 24H · 누적</th>
                <th className="ac-r">평균 소요 · 밀림</th>
                <th>마지막 오류(24H)</th>
                <th className="ac-ops">API 실행 · 예정</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-health-key={row.key}>
                  <td className="ac-nm">
                    {row.label}
                    {row.eventDriven && row.activeCount != null && <div className="ac-sub">{row.activeCount}건 발효</div>}
                    {row.airportRuns && (
                      <details className="ac-sub ac-model-health">
                        <summary>
                          실행 {row.modelRunAt ? formatDateTime(row.modelRunAt) : row.airportRuns.length ? '공항별 상이' : '없음'}
                          {' · '}공항 {row.successAirports}/{row.successAirports + row.failedAirports}
                          {row.failedAirports > 0 && <b data-airport-failed> · 실패 {row.failedAirports}</b>}
                          {/* 다음 점검은 접어두지 않는다 — 계약이 요구하는, 접힌 채로도 보여야 할 운영 정보다. */}
                          <div>다음 점검 {row.status === 'disabled' ? '없음' : formatDateTime(row.nextCheckAt)}</div>
                        </summary>
                        {row.airportRuns.map((airport) => <div key={airport.airportIcao} data-airport-run={airport.airportIcao}>{airport.airportIcao} {formatDateTime(airport.modelRunAt)}</div>)}
                        <div><b>가용시각</b> {formatDateTime(row.availableAt)}</div>
                        <div><b>수집시각</b> {formatDateTime(row.collectedAt)}</div>
                        {row.lastFailure && <div data-last-failure><b>마지막 실패</b> {row.lastFailure.airportIcao || '전체'} · {row.lastFailure.message || row.lastFailure.code}</div>}
                      </details>
                    )}
                  </td>
                  <td><span className={`ac-chip ac-${STATUS_TONE[row.status]}`}>{STATUS_WORD[row.status]}</span></td>
                  {/* 짝을 이루는 값은 한 칸에 두 줄로 넣는다. 열이 열 개면 가로로 밀어야 읽히고,
                      옆으로 흩어진 숫자는 짝지어 보기도 어렵다. 윗줄이 지금, 아랫줄이 배경이다. */}
                  <td className="ac-r">
                    {row.lastSuccessAt ? `${formatAge(now - Date.parse(row.lastSuccessAt))} 전` : '—'}
                    <div className="ac-sub">주기 {formatInterval(row.normalMs)}</div>
                    {/* 자료 시각은 수집 시각과 다를 때만 적는다 — "받아오긴 했는데 내용이 낡았다"는 신호다. */}
                    {row.contentAt && formatAge(now - Date.parse(row.contentAt)) !== formatAge(now - Date.parse(row.lastSuccessAt))
                      && <div className="ac-sub" data-content-age>자료 {formatAge(now - Date.parse(row.contentAt))} 전</div>}
                  </td>
                  <td className="ac-r">
                    <span style={row.stats?.recentSuccessRate != null && row.stats.recentSuccessRate < 0.8 ? { color: 'var(--ac-bad)', fontWeight: 600 } : undefined}>
                      {row.stats?.recentRuns ? formatRate(row.stats.recentSuccessRate) : '—'}
                    </span>
                    {row.stats?.recentRuns > 0 && <span className="ac-sub"> {row.stats.recentRuns}회</span>}
                    <div className="ac-sub">누적 {formatRate(row.stats?.successRate)}</div>
                  </td>
                  <td className="ac-r ac-muted">
                    {formatMs(row.stats?.avgMs)}
                    <div className="ac-sub" style={row.stats?.skips > 0 ? { color: 'var(--ac-warn)', fontWeight: 600 } : undefined}>
                      밀림 {row.stats?.skips ?? 0}
                    </div>
                  </td>
                  <td className="ac-muted">
                    {row.stats?.recentLastError || '—'}
                    {row.stats?.recentLastErrorAt && <span className="ac-sub"> · {formatAge(now - Date.parse(row.stats.recentLastErrorAt))} 전</span>}
                  </td>
                  <td className="ac-muted ac-ops">
                    {(row.operations || []).map((operation) => {
                      const expected = operation.expected
                      const next = expected?.nextExpectedAt ? new Date(expected.nextExpectedAt).toLocaleTimeString('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : null
                      const nextLabel = row.airportRuns ? '새 실행 요청 가능' : '다음'
                      const schedule = expected?.kind === 'scheduled' ? `${expected.cadenceLabel}${expected.operatingHoursLabel ? ` · ${expected.operatingHoursLabel}` : ''}${next ? ` · ${nextLabel} ${next}` : ''}` : expected?.label || '—'
                      return <div className="ac-sub" key={operation.id}>{operation.label} · {operation.outcome === 'succeeded' ? '성공' : operation.outcome === 'failed' ? '실패' : '미실행'}{operation.durationMs != null ? ` · ${formatMs(operation.durationMs)}` : ''} · {schedule}{operation.outcome !== 'succeeded' && operation.lastIssue?.message ? ` · ${operation.lastIssue.message}` : ''}</div>
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        {since && (
          <p className="ac-sub" style={{ padding: '12px 22px 16px' }}>
            성공률은 윗줄이 최근 24시간(옆의 회차 수는 그동안 실제로 돈 횟수), 아랫줄이 누적입니다.
            마지막 오류도 최근 24시간 안에 실제로 난 것만 보여줍니다 — 고쳐서 사라진 오류는 하루가 지나면 없어집니다.
            성공률(누적)과 밀림은 집계 시작({new Date(since).toLocaleDateString('ko-KR')}) 이후 전체입니다.
          </p>
        )}
      </section>
    </>
  )
}
