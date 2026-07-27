import { useCallback, useEffect, useState } from 'react'
import { getTraffic, getTrends } from './adminApi.js'
import './AdminPage.css'

const GRANULARITIES = [['day', '일별'], ['week', '주별'], ['month', '월별']]

// 24시간 막대 하나만 있으면 되는 아주 작은 그래프라 ResourceTimeline 같은 범용 차트를 새로
// 만들지 않고 SVG로 직접 그린다.
function HourlyBars({ byHour = [] }) {
  const counts = new Array(24).fill(0)
  for (const row of byHour) {
    const h = Number(row.hh)
    if (Number.isInteger(h) && h >= 0 && h < 24) counts[h] = row.n
  }
  const max = Math.max(1, ...counts)
  const W = 720; const H = 120; const barW = W / 24

  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="admin-chart-svg" role="img" aria-label="오늘 시간대별 접속">
      {counts.map((n, h) => {
        const barH = (n / max) * H
        return (
          <g key={h}>
            <rect x={h * barW + 1} y={H - barH} width={barW - 2} height={barH} fill="var(--accent)" rx="2" />
            {h % 3 === 0 && <text x={h * barW + barW / 2} y={H + 12} textAnchor="middle" className="admin-chart-xtick">{h}시</text>}
          </g>
        )
      })}
    </svg>
  )
}

function fmtPeriod(period, granularity) {
  if (granularity === 'month') return period.slice(5) + '월' // 'YYYY-MM' → 'MM월'
  const d = new Date(`${period}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

// 일/주/월 추이 카드 하나(기간별 개수 막대). data가 비어 있으면 "쌓이는 중" 안내.
function TrendCard({ title, data, granularity, color }) {
  const max = Math.max(1, ...data.map((d) => d.n))
  const W = 720; const H = 100; const barW = data.length ? W / data.length : W
  return (
    <div className="admin-trend-card">
      <div className="admin-gauge-label">{title}</div>
      {data.length === 0 ? (
        <p className="admin-empty">아직 쌓인 기록이 없습니다.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H + 16}`} className="admin-chart-svg" role="img" aria-label={title}>
          {data.map((row, i) => {
            const barH = (row.n / max) * H
            return (
              <g key={row.period}>
                <rect x={i * barW + 1} y={H - barH} width={Math.max(1, barW - 2)} height={barH} fill={color} rx="2" />
                <title>{fmtPeriod(row.period, granularity)}: {row.n}</title>
                {(i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0) && (
                  <text x={i * barW + barW / 2} y={H + 12} textAnchor="middle" className="admin-chart-xtick">
                    {fmtPeriod(row.period, granularity)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

export default function UserActivityPanel() {
  const [traffic, setTraffic] = useState(null)
  const [granularity, setGranularity] = useState('day')
  const [trends, setTrends] = useState(null)

  const refreshTraffic = useCallback(async () => {
    try { setTraffic(await getTraffic()) } catch { /* AdminPage가 401/403 처리 */ }
  }, [])
  const refreshTrends = useCallback(async () => {
    try { setTrends(await getTrends(granularity)) } catch { /* AdminPage가 401/403 처리 */ }
  }, [granularity])

  useEffect(() => {
    refreshTraffic()
    const t = setInterval(refreshTraffic, 5000)
    return () => clearInterval(t)
  }, [refreshTraffic])

  useEffect(() => {
    refreshTrends()
    const t = setInterval(refreshTrends, 5000)
    return () => clearInterval(t)
  }, [refreshTrends])

  return (
    <>
      <section className="admin-card">
        <div className="admin-card-head"><h2>이용 현황</h2></div>
        <div className="admin-traffic-stats">
          <div><span className="admin-stat-num">{traffic?.online ?? '—'}</span><span className="admin-stat-label">현재 접속</span></div>
          <div><span className="admin-stat-num">{traffic?.total ?? '—'}</span><span className="admin-stat-label">총 방문자</span></div>
          <div><span className="admin-stat-num">{traffic?.activeUsers?.last7d ?? '—'}</span><span className="admin-stat-label">최근 7일 활성 계정</span></div>
          <div><span className="admin-stat-num">{traffic?.activeUsers?.last30d ?? '—'}</span><span className="admin-stat-label">최근 30일 활성 계정</span></div>
        </div>
        <div className="admin-chart">
          <div className="admin-gauge-label">오늘 시간대별 접속</div>
          <HourlyBars byHour={traffic?.byHour} />
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <h2>이용자 추이</h2>
          <div className="admin-range-toggle" role="tablist">
            {GRANULARITIES.map(([key, label]) => (
              <button key={key} type="button" className={`admin-range-btn${granularity === key ? ' is-active' : ''}`} onClick={() => setGranularity(key)}>{label}</button>
            ))}
          </div>
        </div>
        <TrendCard title="총 접속(재방문 포함)" data={trends?.visits ?? []} granularity={granularity} color="#2563eb" />
        <TrendCard title="신규 방문자" data={trends?.newVisitors ?? []} granularity={granularity} color="#7c3aed" />
        <TrendCard title="신규 가입" data={trends?.signups ?? []} granularity={granularity} color="#16a34a" />
      </section>
    </>
  )
}
