import { useEffect, useState } from 'react'

import { getApiHubUsage } from '../adminApi.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'

// API 사용량.
//
// 기상청 API Hub의 한도는 호출 횟수가 아니라 하루 전송량(5 GB)이다. 한도가 계량되는 열쇠는
// 항공·레이더위성·수치예보 셋뿐이라 NOAA와 공항공사는 이 화면에 나오지 않는다 —
// 공항공사는 별도 호출 한도를 쓰지만 지금 아무도 세고 있지 않다(2단계).
const gb = (bytes) => (bytes / 1024 ** 3).toFixed(2)
const STATUS_WORD = { active: '정상', blocked: '차단됨', unconfigured: '열쇠 없음' }

export default function ApiUsageScreen() {
  const [usage, setUsage] = useState(null)
  const { tz } = useTimeZone()

  useEffect(() => {
    const load = () => { getApiHubUsage().then(setUsage).catch(() => {}) }
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  if (!usage?.keys?.length) return null

  const busiest = usage.keys.reduce((best, key) => (key.bytes > (best?.bytes ?? -1) ? key : best), null)
  const share = busiest?.limitBytes ? Math.round((busiest.bytes / busiest.limitBytes) * 100) : 0

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-big n">{share}<s>%</s></div>
          <div className="ac-cap">
            가장 많이 쓴 열쇠({busiest?.label}) · 하루 {gb(busiest?.limitBytes ?? 0)} GB 중
            {busiest?.resetsAt ? ` · ${new Date(busiest.resetsAt).toLocaleTimeString('ko-KR')} 초기화` : ''}
          </div>
        </div>
      </div>

      <section className="ac-sec">
        <h2>열쇠별 전송량<em>오늘 · 기상청 API Hub</em></h2>
        {usage.keys.map((key) => {
          const pct = key.limitBytes ? Math.round((key.bytes / key.limitBytes) * 100) : 0
          const tone = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : null
          return (
            <div className="ac-bar-row" style={{ gridTemplateColumns: '186px 1fr 156px' }} key={key.category}>
              <span className="ac-bn">
                <b style={{ color: 'var(--ac-tx)' }}>{key.label}</b>
                <div className="ac-sub">{STATUS_WORD[key.status] || key.status}</div>
              </span>
              <span className="ac-bar">
                <span style={{ width: `${Math.min(100, pct)}%`, background: tone ? `var(--ac-${tone})` : 'var(--ac-tx)' }} />
              </span>
              <span className="ac-bv n">
                {gb(key.bytes)} / {gb(key.limitBytes)} GB
                <div className="ac-sub">{pct}%</div>
              </span>
            </div>
          )
        })}
        <p className="ac-sub" style={{ marginTop: 14 }}>
          NOAA는 열쇠가 없고, 한국공항공사는 별도 호출 한도를 쓰지만 아직 계량하지 않습니다.
        </p>
      </section>

      {usage.keys.filter((key) => key.endpoints?.length).map((key) => (
        <section className="ac-sec ac-flush" key={key.category}>
          <h2>{key.label} — 엔드포인트별<em>오늘</em></h2>
          <table className="ac-t">
            <thead>
              <tr>
                <th>엔드포인트</th>
                <th className="ac-r">전송량</th>
                <th className="ac-r">호출</th>
                <th className="ac-r">실패</th>
                <th className="ac-r">마지막</th>
              </tr>
            </thead>
            <tbody>
              {key.endpoints.map((endpoint) => (
                <tr key={endpoint.label}>
                  <td className="ac-nm">{endpoint.label}</td>
                  <td className="ac-r n">{gb(endpoint.bytes)} GB</td>
                  <td className="ac-r n">{endpoint.requests}</td>
                  <td className="ac-r n" style={endpoint.failures > 0 ? { color: 'var(--ac-bad)' } : undefined}>{endpoint.failures}</td>
                  <td className="ac-r ac-muted n">
                    {endpoint.lastCalledAt ? new Date(endpoint.lastCalledAt).toLocaleTimeString('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {usage.onDemandOperations?.length > 0 && (
        <section className="ac-sec ac-flush">
          <h2>온디맨드 API<em>호출 시에만 실행</em></h2>
          <table className="ac-t">
            <thead><tr><th>API</th><th>상태</th><th className="ac-r">마지막 완료</th><th>최근 원인</th></tr></thead>
            <tbody>{usage.onDemandOperations.map((operation) => (
              <tr key={operation.id}>
                <td className="ac-nm">{operation.label}<div className="ac-sub">{operation.provider}</div></td>
                <td>{operation.outcome === 'succeeded' ? '성공' : operation.outcome === 'failed' ? '실패' : '미실행'}</td>
                <td className="ac-r ac-muted">{operation.lastFinishedAt ? new Date(operation.lastFinishedAt).toLocaleTimeString('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="ac-muted">{operation.lastIssue?.message || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </>
  )
}
