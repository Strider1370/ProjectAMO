import AttentionList from '../components/AttentionList.jsx'
import DataGrid from '../components/DataGrid.jsx'
import { LineChart } from '../components/Chart.jsx'
import { attentionItems, formatAge, percent } from '../lib/adminFormat.js'

// 매일 여는 화면. 큰 숫자 하나로 시작하고, 확인이 필요한 것만 문장으로 말한다.
// 이상이 없는 날은 초록 한 줄이 뜨고 5초 만에 점검이 끝나는 것이 이 화면의 목표다.
const CPU_COLOR = '#3d5a80'
const MEM_COLOR = '#a9701d'
const DISK_COLOR = '#6d28d9'

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export default function OverviewScreen({ health, server, metrics, onGo }) {
  if (!health) return null

  const items = attentionItems(health.rows)
  const current = metrics?.current
  const series = metrics?.series ?? []
  const forecast = server?.diskForecast
  const broken = health.counts.stopped + health.counts.never

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
            <div className="ac-v n">{current ? percent(current.diskUsed, current.diskTotal) : '—'}<s>%</s></div>
            <div className="ac-l">디스크{forecast ? ` · 약 ${forecast.daysLeft}일 남음` : ''}</div>
          </div>
          <div>
            <div className="ac-v n">{current ? percent(current.memUsed, current.memTotal) : '—'}<s>%</s></div>
            <div className="ac-l">메모리</div>
          </div>
          <div>
            <div className="ac-v n">{server?.process?.bootCount ?? '—'}</div>
            <div className="ac-l">재시작 횟수</div>
          </div>
        </div>
      </div>

      <AttentionList items={items} onGo={onGo} />

      <DataGrid health={health} />

      <div className="ac-two">
        <section className="ac-sec">
          <h2>
            시스템
            <em className="n">
              CPU {Math.round(current?.cpuPct ?? 0)}% · 메모리 {current ? percent(current.memUsed, current.memTotal) : 0}% · 디스크 {current ? percent(current.diskUsed, current.diskTotal) : 0}%
            </em>
          </h2>
          {series.length > 1 ? (
            <>
              <LineChart
                height={190}
                max={100}
                unit="%"
                xUnit="24시간"
                xLabels={[timeLabel(series[0].ts), timeLabel(series[series.length - 1].ts)]}
                hoverLabels={series.map((row) => timeLabel(row.ts))}
                peak={{ index: peakIndex, value: cpuPoints[peakIndex], color: CPU_COLOR, text: `피크 ${Math.round(cpuPoints[peakIndex])}% · ${timeLabel(series[peakIndex].ts)}` }}
                series={[
                  { label: 'CPU', color: CPU_COLOR, points: cpuPoints },
                  { label: '메모리', color: MEM_COLOR, points: series.map((row) => percent(row.mem_used, row.mem_total)) },
                  { label: '디스크', color: DISK_COLOR, dashed: true, points: series.map((row) => percent(row.disk_used, row.disk_total)) },
                ]}
              />
              <div className="ac-clg">
                <span><i style={{ background: CPU_COLOR }} />CPU</span>
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
