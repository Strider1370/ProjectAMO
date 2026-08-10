import { useEffect, useState } from 'react'

import { getTraffic, getTrends } from '../adminApi.js'
import { GroupedBarChart, HourHeatmap } from '../components/Chart.jsx'
import { trendGroups } from '../lib/adminFormat.js'

// 이용자.
//
// 시간대 격자는 배포 시점부터 쌓인다 — 방문 이력이 날짜까지만 남아 있어 과거를 채울 수 없다.
// 2주가 모이기 전에는 격자 대신 얼마나 모였는지 적는다. 없는 자료를 그럴듯하게 그리는 것보다
// "아직 모으는 중"이라고 말하는 편이 정직하다.
//
// 추이는 세 계열을 한 축에 놓는다. 따로 그리면 각자 제 최댓값에 맞춰 늘어나서, 위아래 막대를
// 비교하면 틀린 결론이 나온다.
const GRANULARITIES = [['day', '일별'], ['week', '주별'], ['month', '월별']]
const SERIES_COLORS = ['#1c1b1a', '#8b7355', '#2f7d5e']

export default function UsersScreen() {
  const [traffic, setTraffic] = useState(null)
  const [trends, setTrends] = useState(null)
  const [granularity, setGranularity] = useState('day')

  useEffect(() => {
    const load = () => { getTraffic().then(setTraffic).catch(() => {}) }
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { getTrends(granularity).then(setTrends).catch(() => {}) }, [granularity])

  const groups = trendGroups(trends)
  const max = Math.max(10, ...groups.flatMap((group) => group.values))
  const totals = groups.reduce(
    (sum, group) => [sum[0] + group.values[0], sum[1] + group.values[1], sum[2] + group.values[2]],
    [0, 0, 0],
  )
  const busiest = groups.reduce((best, group, i) => (group.values[0] > (groups[best]?.values[0] ?? -1) ? i : best), 0)

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-big n">{traffic?.total ?? '—'}</div>
          <div className="ac-cap">총 방문자 · 현재 접속 {traffic?.online ?? 0}명</div>
        </div>
        <div className="ac-side">
          <div>
            <div className="ac-v n">{traffic?.activeUsers?.last7d ?? '—'}</div>
            <div className="ac-l">최근 7일 활성 계정</div>
          </div>
          <div>
            <div className="ac-v n">{traffic?.activeUsers?.last30d ?? '—'}</div>
            <div className="ac-l">최근 30일 활성 계정</div>
          </div>
        </div>
      </div>

      <section className="ac-sec">
        <h2>이용 시간대<em>최근 4주 · 요일 × 시각(KST)</em></h2>
        {traffic?.hourly?.ready ? (
          <>
            <HourHeatmap cells={traffic.hourly.cells} />
            <div className="ac-clg">
              <span>적음</span>
              <span style={{ display: 'inline-flex', gap: 3 }}>
                {['#f2f0ec', '#e5e1da', '#cfc8bd', '#a8a096', '#6b6459', '#2a2621'].map((color) => (
                  <i key={color} style={{ width: 13, height: 13, borderRadius: 3, background: color }} />
                ))}
              </span>
              <span>많음</span>
            </div>
          </>
        ) : (
          <p className="ac-sub">
            쌓이는 중입니다 — 지금까지 {traffic?.hourly?.days ?? 0}일치.
            2주가 모이면 요일 × 시각 격자로 보여드립니다.
          </p>
        )}
      </section>

      <section className="ac-sec">
        <h2>
          이용자 추이
          <div className="ac-seg" style={{ marginLeft: 'auto' }}>
            {GRANULARITIES.map(([key, label]) => (
              <button type="button" key={key} className={granularity === key ? 'ac-on' : ''} onClick={() => setGranularity(key)}>{label}</button>
            ))}
          </div>
        </h2>

        <div className="ac-stats" style={{ marginBottom: 18 }}>
          <div><div className="ac-sv n">{totals[0]}</div><div className="ac-sl">총 접속(재방문 포함)</div></div>
          <div><div className="ac-sv n">{totals[1]}</div><div className="ac-sl">신규 방문자</div></div>
          <div><div className="ac-sv n">{totals[2]}</div><div className="ac-sl">신규 가입</div></div>
        </div>

        {groups.length > 0 ? (
          <>
            <GroupedBarChart
              groups={groups}
              colors={SERIES_COLORS}
              max={max}
              unit="건"
              xUnit={granularity === 'day' ? '날짜' : granularity === 'week' ? '주' : '월'}
              highlight={groups[busiest] ? { index: busiest, value: groups[busiest].values[0] } : null}
            />
            <div className="ac-clg">
              <span><i style={{ background: SERIES_COLORS[0], width: 12, height: 12, borderRadius: 3 }} />총 접속</span>
              <span><i style={{ background: SERIES_COLORS[1], width: 12, height: 12, borderRadius: 3 }} />신규 방문자</span>
              <span><i style={{ background: SERIES_COLORS[2], width: 12, height: 12, borderRadius: 3 }} />신규 가입</span>
            </div>
          </>
        ) : (
          <p className="ac-sub">아직 쌓인 기록이 없습니다.</p>
        )}
      </section>
    </>
  )
}
