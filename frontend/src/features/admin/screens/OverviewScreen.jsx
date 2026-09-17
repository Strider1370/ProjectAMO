import AttentionList from '../components/AttentionList.jsx'
import DataGrid from '../components/DataGrid.jsx'
import { LineChart } from '../components/Chart.jsx'
import { EXECUTION_WORD, attentionItems, executionProblems, formatAge, percent } from '../lib/adminFormat.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'

// 매일 여는 화면. 큰 숫자 하나로 시작하고, 확인이 필요한 것만 문장으로 말한다.
// 이상이 없는 날은 초록 한 줄이 뜨고 5초 만에 점검이 끝나는 것이 이 화면의 목표다.
const CPU_COLOR = '#3d5a80'
const MEM_COLOR = '#a9701d'
const DISK_COLOR = '#6d28d9'

function timeLabel(iso, tz) {
  return new Date(iso).toLocaleTimeString('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
}

export default function OverviewScreen({ health, server, metrics, onGo }) {
  const { tz } = useTimeZone()
  if (!health) return null

  const items = attentionItems(health.rows)
  const current = metrics?.current
  const series = metrics?.series ?? []
  const forecast = server?.diskForecast
  const rootFs = current?.metricContract?.filesystems?.root
  const rootDiskPct = percent(rootFs?.usedBytes, rootFs?.totalBytes)
  const memoryPct = percent(current?.memUsed, current?.memTotal)
  const broken = health.counts.stopped + health.counts.never
  const executionProblemsNow = [
    ...executionProblems(health.collectorExecution),
    ...(health.apiProblems ?? []).map((entry) => ({ ...entry, type: entry.id, outcome: 'failed', isProblem: true })),
  ]

  const cpuPoints = series.map((row) => row.cpu_pct)
  const peakIndex = cpuPoints.reduce((best, value, i) => (value > (cpuPoints[best] ?? -1) ? i : best), 0)

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-big n">
            {health.counts.ok}
            <s> / {health.counts.total}종 정상</s>
          </div>
          <div className="ac-cap">
            {broken > 0 || health.counts.late > 0
              ? `${broken}종이 멈춰 있습니다 · 지연 ${health.counts.late}종`
              : '모두 정상 주기 안에서 들어오고 있습니다'}
          </div>
        </div>
        <div className="ac-side">
          <div>
            <div className="ac-v n">{rootDiskPct ?? '—'}<s>%</s></div>
            <div className="ac-l">루트 파일시스템{rootFs?.validity === 'unknown' ? ' · 측정 불가' : forecast ? ` · 약 ${forecast.daysLeft}일 남음` : ''}</div>
          </div>
          <div>
            <div className="ac-v n">{memoryPct ?? '—'}<s>%</s></div>
            <div className="ac-l">메모리</div>
          </div>
          <div>
            <div className="ac-v n">{server?.process?.bootCount ?? '—'}</div>
            <div className="ac-l">재시작 횟수</div>
          </div>
        </div>
      </div>

      <AttentionList items={items} onGo={onGo} />

      <section className="ac-sec ac-flush">
        <h2>실행 문제<em>{executionProblemsNow.length}건</em></h2>
        {executionProblemsNow.length ? (
          <table className="ac-t"><tbody>{executionProblemsNow.slice(0, 5).map((entry) => (
            <tr key={entry.type}>
              <td className="ac-nm">{entry.label || entry.type}</td>
              <td>{EXECUTION_WORD[entry.outcome] || EXECUTION_WORD.unknown}</td>
              <td className="ac-muted">{entry.lastIssue?.message || entry.lastIssue?.code || '실행 상태를 확인하세요.'}</td>
            </tr>
          ))}</tbody></table>
        ) : <p className="ac-sub" style={{ padding: '0 22px 16px' }}>현재 실행 문제는 없습니다.</p>}
      </section>

      <DataGrid health={health} />

      <div className="ac-two">
        <section className="ac-sec">
          <h2>
            시스템
            <em className="n">
              1분 부하 {current?.metricContract?.cpu?.validity === 'available' ? `${Math.round(current.metricContract.cpu.value)}%` : '측정 불가'} · 메모리 {memoryPct ?? '측정 불가'}{memoryPct != null ? '%' : ''} · 루트 {rootDiskPct ?? '측정 불가'}{rootDiskPct != null ? '%' : ''}
            </em>
          </h2>
          {series.length > 1 ? (
            <>
              <LineChart
                height={190}
                max={100}
                unit="%"
                xUnit={metrics?.time?.requestedRange?.id === '7d' ? '7일' : metrics?.time?.requestedRange?.id === '1h' ? '1시간' : '24시간'}
                xLabels={[timeLabel(series[0].ts, tz), timeLabel(series[series.length - 1].ts, tz)]}
                hoverLabels={series.map((row) => timeLabel(row.ts, tz))}
                peak={{ index: peakIndex, value: cpuPoints[peakIndex], color: CPU_COLOR, text: `피크 ${Math.round(cpuPoints[peakIndex])}% · ${timeLabel(series[peakIndex].ts, tz)} ${tz}` }}
                series={[
                { label: '1분 부하/논리 CPU', color: CPU_COLOR, points: cpuPoints },
                  { label: '메모리', color: MEM_COLOR, points: series.map((row) => percent(row.mem_used, row.mem_total)) },
                  { label: '디스크', color: DISK_COLOR, dashed: true, points: series.map((row) => percent(row.disk_used, row.disk_total)) },
                ]}
              />
              <div className="ac-clg">
                <span><i style={{ background: CPU_COLOR }} />1분 부하/논리 CPU</span>
                <span><i style={{ background: MEM_COLOR }} />메모리</span>
                <span><i style={{ background: DISK_COLOR }} />디스크</span>
              </div>
            </>
          ) : (
            <p className="ac-sub">아직 표본이 부족합니다 — 1분마다 쌓입니다.</p>
          )}
        </section>

        <section className="ac-sec ac-flush">
          <h2>최근 수집 실패<em>최근 실행 50건 중</em></h2>
          {server?.recentErrors?.length ? (
            <table className="ac-t">
              <tbody>
                {server.recentErrors.slice(0, 5).map((error, i) => (
                  <tr key={`${error.type}-${error.time}-${i}`}>
                    <td className="ac-nm">{error.type}</td>
                    <td className="ac-muted">{error.error}</td>
                    <td className="ac-r ac-muted n">{formatAge(Date.now() - Date.parse(error.time))} 전</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ac-sub" style={{ padding: '0 22px 16px' }}>최근 실패가 없습니다.</p>
          )}
        </section>
      </div>
    </>
  )
}
