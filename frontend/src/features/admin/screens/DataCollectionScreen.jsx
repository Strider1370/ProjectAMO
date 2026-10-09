import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'

import { getCollectionTimeline } from '../adminApi.js'
import { EXECUTION_WORD, STATUS_TONE, STATUS_WORD, eventMeasurementLabel, executionProblems, formatAge, formatInterval, formatMs, formatRate } from '../lib/adminFormat.js'
import { apiOperationSummary } from '../lib/apiOperationSummary.js'
import { expandedProgressView } from '../lib/expandedProgress.js'
import { boardGroups, hourCell, minuteClock, nextScheduled, reasonText, runSummary, upcomingRuns } from '../lib/collectionBoard.js'
import ApiExecutionDialog from './ApiExecutionDialog.jsx'

// 자료 수집 — 수집 × 24시간 시간표가 중심이다. 언제 무엇이 돌았고 잘 됐는지를 표 한 장에서 읽고,
// 칸에 마우스를 올리면 그 시간의 실행 결과가, 행을 누르면 오른쪽 패널에 그 자료의 상세가 나온다.
// 패널에는 예전 자료 표의 내용(마지막 성공·성공률·밀림·마지막 오류·모델 공항별 실행·API 실행 상세)을 그대로 옮겼다.
// 화면이 좁으면(시간표 + 패널이 안 들어가면) 패널을 대화상자로 띄운다.
const TIMELINE_POLL_MS = 60_000
const WIDE_MIN_PX = 1260
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

export default function DataCollectionScreen({ health, now = Date.now(), adminQuery }) {
  const { tz } = useTimeZone()
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [day, setDay] = useState(0)
  const [timeline, setTimeline] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  const [apiKey, setApiKey] = useState(null)
  const [tip, setTip] = useState(null)
  const [wide, setWide] = useState(true)
  const wrapRef = useRef(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    let alive = true
    const load = () => getCollectionTimeline(day, adminQuery)
      .then((result) => { if (alive && result?.query?.current !== false) setTimeline(result.data) })
      .catch(() => {})
    load()
    const timer = setInterval(load, TIMELINE_POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [day, adminQuery])

  useLayoutEffect(() => {
    const element = wrapRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE_MIN_PX))
    observer.observe(element)
    return () => observer.disconnect()
  }, [health])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!wide && selectedKey && !dialog.open) dialog.showModal()
    if ((wide || !selectedKey) && dialog.open) dialog.close()
  }, [wide, selectedKey])

  if (!health) return null

  const formatDateTime = (value) => value
    ? new Date(value).toLocaleString('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    : '없음'
  const broken = health.counts.stopped + health.counts.never
  const collectorProblems = executionProblems(health.collectorExecution)
  const groups = boardGroups(health, { onlyProblems })
  const nowMinute = timeline?.nowMinute ?? null
  const currentHour = nowMinute == null ? -1 : Math.floor(nowMinute / 60)
  const upcoming = upcomingRuns(health, timeline)
  const selectedRow = health.rows.find((row) => row.key === selectedKey) || null
  const entryFor = (row) => timeline?.collectors?.[row.statsKey] || null

  const showTip = (event, row, hour) => {
    const bounds = wrapRef.current.getBoundingClientRect()
    setTip({ row, hour, x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  }

  const detail = selectedRow
    ? <CollectionRowDetail row={selectedRow} entry={entryFor(selectedRow)} timeline={timeline} now={now} tz={tz}
      formatDateTime={formatDateTime} onOpenApi={() => setApiKey(selectedRow.key)} onClose={wide ? null : () => setSelectedKey(null)} />
    : <p className="ac-cb-hint">자료를 누르면 실행 기록과 상세가 여기에 나옵니다.</p>

  return (
    <>
      <div className="ac-cb-status">
        <div className="ac-cb-count ac-bad"><b className="n">{broken}</b><span>멈춤</span></div>
        <div className="ac-cb-count ac-warn"><b className="n">{health.counts.late}</b><span>지연</span></div>
        <div className="ac-cb-count ac-ok"><b className="n">{health.counts.ok}</b><span>정상</span></div>
        <div className="ac-cb-next">
          {day === 0
            ? upcoming.length ? <>다음 · {upcoming.map((item, index) => <span key={`${item.minute}-${item.label}`}>{index > 0 && ', '}<b className="n">{minuteClock(item.minute)}</b> {item.label}</span>)}</> : '90분 안에 예정된 정시 수집 없음'
            : '어제 하루 기록'}
        </div>
      </div>

      {collectorProblems.length > 0 && (
        <section className="ac-sec ac-flush">
          <h2>수집 실행 문제<em>{collectorProblems.length}건</em></h2>
          <table className="ac-t"><tbody>{collectorProblems.map((entry) => (
            <tr key={entry.type}>
              <td className="ac-nm">{entry.label}</td>
              <td>{EXECUTION_WORD[entry.outcome] || EXECUTION_WORD.unknown}</td>
              <td className="ac-muted">{entry.lastIssue?.message || entry.lastIssue?.code || '정기 수집 시작 시각을 확인하세요.'}</td>
            </tr>
          ))}</tbody></table>
        </section>
      )}

      <div className="ac-cb-tools">
        <div className="ac-seg" role="group" aria-label="날짜">
          <button type="button" className={day === 0 ? 'ac-on' : ''} aria-pressed={day === 0} onClick={() => setDay(0)}>오늘</button>
          <button type="button" className={day === 1 ? 'ac-on' : ''} aria-pressed={day === 1} onClick={() => setDay(1)}>어제</button>
        </div>
        <label className="ac-cb-check"><input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} /> 이상한 자료만</label>
        <div className="ac-cb-legend" aria-hidden="true">
          <span><i className="ac-cb-sw ok" />성공</span>
          <span><i className="ac-cb-sw part" />일부 실패</span>
          <span><i className="ac-cb-sw fail" />실패</span>
          <span><i className="ac-cb-sw skip" />건너뜀</span>
          <span><i className="ac-cb-sw none" />기록 없음</span>
          <span><i className="ac-cb-sw plan" />예정</span>
        </div>
      </div>

      <div ref={wrapRef} className={`ac-cb-board${wide ? ' ac-cb-wide' : ''}`}>
        <section className="ac-sec ac-flush ac-cb-card">
          <div className="ac-cb-scroll" role="region" aria-label="자료 수집 목록" tabIndex={0} onMouseLeave={() => setTip(null)}>
            <table className="ac-t ac-cb-table">
              <colgroup><col className="ac-cb-col-name" /><col className="ac-cb-col-state" />{HOURS.map((hour) => <col key={hour} />)}</colgroup>
              <thead><tr>
                <th className="ac-cb-name">자료</th><th className="ac-cb-state">상태</th>
                {HOURS.map((hour) => <th key={hour} className={`ac-cb-h${hour % 6 === 0 ? ' major' : ''}${hour === currentHour ? ' cur' : ''}`}>{hour}</th>)}
              </tr></thead>
              <tbody>
                {groups.map((group) => [
                  <tr key={`g-${group.id}`} className="ac-cb-group"><td colSpan={2}>{group.label}</td><td colSpan={24} /></tr>,
                  ...group.rows.map((row) => {
                    const entry = entryFor(row)
                    return (
                      <tr key={row.key} data-health-key={row.key} tabIndex={0}
                        className={`ac-cb-row${selectedKey === row.key ? ' sel' : ''}`}
                        aria-selected={selectedKey === row.key}
                        onClick={() => setSelectedKey(row.key)}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedKey(row.key) } }}>
                        <td className="ac-cb-name" title={entry ? `${row.label} · ${entry.cadence}` : row.label}>{row.label}{row.expandedProgress?.state === 'running' && <span className="ac-cb-progress-brief" data-expanded-brief>{expandedProgressView(row.expandedProgress).brief}</span>}</td>
                        <td className="ac-cb-state"><span className={`ac-chip ac-${STATUS_TONE[row.status]}`}>{STATUS_WORD[row.status]}</span></td>
                        {HOURS.map((hour) => <HourCell key={hour} entry={entry} hour={hour} nowMinute={nowMinute} current={hour === currentHour}
                          onHover={(event) => showTip(event, row, hour)} />)}
                      </tr>
                    )
                  }),
                ])}
              </tbody>
            </table>
          </div>
          {timeline?.recordsSince && <p className="ac-sub ac-cb-foot">실행 기록은 {formatDateTime(timeline.recordsSince)} {tz}부터 남아 있습니다(3일 보관). 그 전 칸은 기록 없음으로 보입니다.</p>}
        </section>
        {wide && <aside className="ac-sec ac-cb-panel" aria-live="polite">{detail}</aside>}
        {tip && <HourTip tip={tip} entry={entryFor(tip.row)} nowMinute={nowMinute} />}
      </div>

      <dialog ref={dialogRef} className="ac-cb-dialog" aria-label={selectedRow ? `${selectedRow.label} 상세` : '자료 상세'} onClose={() => setSelectedKey(null)}>
        {!wide && detail}
      </dialog>
      <ApiExecutionDialog row={health.rows.find((row) => row.key === apiKey) || null} onClose={() => setApiKey(null)} formatDateTime={formatDateTime} tz={tz} />
    </>
  )
}

function HourCell({ entry, hour, nowMinute, current, onHover }) {
  const cell = entry ? hourCell(entry, hour, nowMinute) : null
  const nowLeft = current && nowMinute != null ? `${((nowMinute % 60) / 60) * 100}%` : null
  return (
    <td className={`ac-cb-c${hour % 6 === 0 ? ' major' : ''}${current ? ' cur' : ''}`} onMouseMove={onHover}>
      {cell?.frequent && cell.tone && (
        cell.futureFrom != null
          ? <><span className={`ac-cb-bar ${cell.tone}`} style={{ right: 'auto', width: nowLeft }} /><span className="ac-cb-bar plan" style={{ left: nowLeft }} /></>
          : <span className={`ac-cb-bar ${cell.tone}`} />
      )}
      {cell?.dots.map((dot, index) => <span key={index} className={`ac-cb-dot ${dot.kind}`} style={{ left: `${Math.min(85, Math.max(15, ((dot.at % 60) / 60) * 100))}%` }} />)}
      {nowLeft && <span className="ac-cb-now" style={{ left: nowLeft }} />}
    </td>
  )
}

function HourTip({ tip, entry, nowMinute }) {
  const cell = entry ? hourCell(entry, tip.hour, nowMinute) : null
  const range = `${String(tip.hour).padStart(2, '0')}:00–${String((tip.hour + 1) % 24).padStart(2, '0')}:00`
  const durations = (cell?.runs || []).filter((run) => run.outcome !== 'skipped' && Number.isFinite(run.durationMs)).map((run) => run.durationMs)
  const failures = (cell?.runs || []).filter((run) => run.outcome === 'failed')
  const skips = (cell?.runs || []).filter((run) => run.outcome === 'skipped')
  const future = (cell?.scheduled || []).filter((minute) => nowMinute != null && minute >= nowMinute)
  return (
    <div className="ac-cb-tip" style={{ left: tip.x + 16, top: tip.y + 16 }} role="tooltip">
      <div className="ac-cb-tip-h">{tip.row.label}<span>{range}</span></div>
      {!entry && <div className="ac-cb-tip-m">수집 일정이 없는 자료입니다.</div>}
      {entry && <div className="ac-cb-tip-m">{entry.cadence}{entry.childProcess ? ' · 계산 프로세스' : ''}</div>}
      {entry && !cell.runs.length && !cell.scheduled.length && <div className="ac-cb-tip-m">이 시간에는 실행 일정이 없습니다.</div>}
      {cell?.runs.length > 0 && <div>{cell.runs.length}번 실행 · 성공 {cell.count.succeeded}{cell.count.failed ? ` · 실패 ${cell.count.failed}` : ''}{cell.count.skipped ? ` · 건너뜀 ${cell.count.skipped}` : ''}</div>}
      {durations.length > 0 && <div className="ac-cb-tip-m">평균 {formatMs(durations.reduce((a, b) => a + b, 0) / durations.length)} 걸림</div>}
      {failures.slice(0, 3).map((run, index) => <div key={index} className="ac-cb-tip-bad">{minuteClock(run.at)} {reasonText(run.reason) || '실패'}</div>)}
      {skips[0] && <div className="ac-cb-tip-m">{reasonText(skips[0].reason)}</div>}
      {cell && !cell.runs.length && cell.tone === 'none' && <div className="ac-cb-tip-m">예정은 있었지만 실행 기록이 없습니다.</div>}
      {future.length > 0 && <div className="ac-cb-tip-m">남은 예정 {future.length}번 · {future.slice(0, 3).map(minuteClock).join(', ')}{future.length > 3 ? ' 외' : ''}</div>}
    </div>
  )
}

function CollectionRowDetail({ row, entry, timeline, now, tz, formatDateTime, onOpenApi, onClose }) {
  const summary = runSummary(entry)
  const next = nextScheduled(entry, timeline?.nowMinute ?? null)
  const recent = [...(entry?.runs || [])].reverse().slice(0, 40)
  const api = apiOperationSummary(row.operations)
  const dayWord = timeline?.dayOffset === 1 ? '어제' : '오늘'
  return (
    <div className="ac-cb-detail" data-collection-detail={row.key}>
      {onClose && <button type="button" className="ac-cb-close" onClick={onClose}>닫기</button>}
      <div>
        <h2>{row.label} <span className={`ac-chip ac-${STATUS_TONE[row.status]}`}>{STATUS_WORD[row.status]}</span></h2>
        <div className="ac-sub">{entry ? `${entry.cadence} · ${entry.timezone} 기준 일정 · ${entry.childProcess ? '계산 프로세스에서 실행' : '백엔드에서 실행'}` : `주기 ${formatInterval(row.normalMs)}`}</div>
      </div>

      <dl className="ac-cb-facts">
        <dt>{dayWord}</dt><dd>{summary.total}번 실행 · 성공 {summary.count.succeeded}{summary.count.failed ? <> · <b className="ac-cb-bad">실패 {summary.count.failed}</b></> : ''}{summary.count.skipped ? ` · 건너뜀 ${summary.count.skipped}` : ''}</dd>
        <dt>걸린 시간</dt><dd>{summary.medianMs != null ? `보통 ${formatMs(summary.medianMs)}, 가장 길게 ${formatMs(summary.maxMs)}` : '기록 없음'}</dd>
        <dt>다음 실행</dt><dd>{next != null ? minuteClock(next) : '없음'}</dd>
        <dt>마지막 성공</dt><dd>{row.lastSuccessAt ? `${formatAge(now - Date.parse(row.lastSuccessAt))} 전` : '없음'}{row.contentAt && formatAge(now - Date.parse(row.contentAt)) !== formatAge(now - Date.parse(row.lastSuccessAt)) && <span className="ac-sub" data-content-age> · 자료 {formatAge(now - Date.parse(row.contentAt))} 전</span>}</dd>
        <dt>성공률</dt><dd>24시간 {row.stats?.recentRuns ? formatRate(row.stats.recentSuccessRate) : '—'} · 누적 {formatRate(row.stats?.successRate)}</dd>
        <dt>밀림</dt><dd>{row.stats?.skips ?? 0}번</dd>
        {row.stats?.recentLastError && <><dt>마지막 오류</dt><dd className="ac-cb-err">{row.stats.recentLastError}{row.stats.recentLastErrorAt && <span className="ac-sub"> · {formatAge(now - Date.parse(row.stats.recentLastErrorAt))} 전</span>}</dd></>}
      </dl>

      {row.derivedCalculation && <div className="ac-sub" data-derived-calculation>
        계산 {row.derivedCalculation.outcome === 'complete' ? '완료' : row.derivedCalculation.outcome === 'running' ? '진행 중' : '입력 대기 또는 일부 실패'} · {row.derivedCalculation.fields ?? 0}/{(row.derivedCalculation.expectedHours?.length || 13) * 21}층
        {row.derivedCalculation.failures?.length > 0 && <details><summary>미완료 {row.derivedCalculation.failures.length}개 시각</summary>{row.derivedCalculation.failures.map((failure) => <div key={failure.hf}>F{String(failure.hf).padStart(3, '0')}: {failure.reason}</div>)}</details>}
      </div>}
      {row.expandedProgress && <ExpandedProgress progress={row.expandedProgress} formatDateTime={formatDateTime} />}
      {row.eventDriven && <div className="ac-sub">{eventMeasurementLabel(row.eventMeasurement)}</div>}
      {row.airportRuns && (
        <details className="ac-sub ac-model-health">
          <summary>
            실행 {row.modelRunAt ? formatDateTime(row.modelRunAt) : row.airportRuns.length ? '공항별 상이' : '없음'}
            {' · '}공항 {row.successAirports}/{row.successAirports + row.failedAirports}
            {row.failedAirports > 0 && <b data-airport-failed> · 실패 {row.failedAirports}</b>}
            <div>다음 점검 {row.status === 'disabled' ? '없음' : formatDateTime(row.nextCheckAt)}</div>
          </summary>
          {row.airportRuns.map((airport) => <div key={airport.airportIcao} data-airport-run={airport.airportIcao}>{airport.airportIcao} {formatDateTime(airport.modelRunAt)}</div>)}
          <div><b>가용시각</b> {formatDateTime(row.availableAt)}</div>
          <div><b>수집시각</b> {formatDateTime(row.collectedAt)}</div>
          {row.lastFailure && <div data-last-failure><b>마지막 실패</b> {row.lastFailure.airportIcao || '전체'} · {row.lastFailure.message || row.lastFailure.code}</div>}
        </details>
      )}

      <div className="ac-cb-api">
        <div className="ac-api-result">{api.result}</div>
        <div className="ac-sub">{api.nextAt ? `다음 예정 ${formatDateTime(api.nextAt)} ${tz}` : api.fallback}</div>
        {row.operations?.length > 0 && <button type="button" className="ac-api-open" onClick={onOpenApi}>실행 상세 보기</button>}
      </div>

      <div>
        <h3 className="ac-cb-h3">최근 실행</h3>
        {recent.length ? (
          <ul className="ac-cb-runs">{recent.map((run, index) => (
            <li key={index}>
              <span className="n">{minuteClock(run.at)}</span>
              <span className="n ac-cb-dur">{run.outcome === 'skipped' ? '' : formatMs(run.durationMs)}</span>
              <span className={`ac-cb-out ${run.outcome}`}>{run.outcome === 'succeeded' ? (run.reason || '성공') : reasonText(run.reason) || (run.outcome === 'failed' ? '실패' : '건너뜀')}</span>
            </li>
          ))}</ul>
        ) : <p className="ac-cb-hint">{dayWord} 실행 기록이 없습니다.</p>}
      </div>
    </div>
  )
}

// KIM 확대 영역 최근 회차: 받기·계산 막대, 예상 끝 시각, 한반도 06 UTC 잘라내기, 서버 메모리.
function ExpandedProgress({ progress, formatDateTime }) {
  const view = expandedProgressView(progress)
  return (
    <div className="ac-cb-expanded" data-expanded-progress={progress.state}>
      <h3 className="ac-cb-h3">{view.cycle} 회차 <span className={`ac-chip ac-${view.tone}`}>{view.stateWord}</span></h3>
      {[['받기', progress.collectedPct, view.collected], ['계산', progress.computedPct, view.computed]].map(([label, pct, text]) => (
        <div key={label} className="ac-bar-row">
          <span className="ac-bn">{label}</span>
          <div className="ac-bar" role="progressbar" aria-label={`${label} 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
          <span className="ac-bv">{text}</span>
        </div>
      ))}
      <dl className="ac-cb-facts">
        <dt>시작</dt><dd>{formatDateTime(progress.startedAt)}</dd>
        {progress.state === 'running'
          ? <><dt>예상 끝</dt><dd>{progress.etaAt ? formatDateTime(progress.etaAt) : '첫 시각 계산 뒤 표시'}</dd></>
          : <><dt>끝</dt><dd>{progress.endedAt ? formatDateTime(progress.endedAt) : '기록 없음(재시작 등으로 끊김)'}{progress.publishedHours ? ` · ${progress.publishedHours}시각 게시` : ''}</dd></>}
        {view.stop && <><dt>중단</dt><dd className="ac-cb-err">{view.stop}</dd></>}
        {view.korea && <><dt>한반도 06 UTC</dt><dd>{view.korea}{progress.korea?.saved ? ` · ${formatDateTime(progress.korea.at)}` : ''}</dd></>}
        {view.memory && <><dt>서버 메모리</dt><dd>{view.memory}</dd></>}
      </dl>
    </div>
  )
}
