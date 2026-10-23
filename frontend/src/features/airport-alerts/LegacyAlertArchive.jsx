import { useEffect, useState } from 'react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

const TYPES = { MINIMA: '최저치 예보', TS: '뇌전 예보', FG: '안개 예보', SN: '눈 예보', SIGMET: 'SIGMET' }
const format = (value, tz) => {
  if (!value || !Number.isFinite(Date.parse(value))) return '시각 미상'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short',
    timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul' }).format(new Date(value)) + ` ${tz}`
}

export default function LegacyAlertArchive() {
  const { tz } = useTimeZone()
  const [archive, setArchive] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    fetch('/api/me/legacy-alerts', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('이전 기록을 불러오지 못했습니다.')))
      .then((result) => { if (active) setArchive(result) })
      .catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [])
  if (!archive?.flights?.length && !archive?.events?.length && !error) return null
  return <details className="aa-legacy-archive"><summary>이전 비행 알림 기록{archive && ` · ${archive.events.length}건`}</summary>
    <p>이전 예보변화 감시는 종료됐습니다. 기존 설정은 새 SIGMET 감시로 자동 전환되지 않으며, 필요한 경로는 위에서 다시 설정하세요.</p>
    {error && <p role="alert">{error}</p>}
    {archive?.flights?.length > 0 && <div><strong>이전 감시 설정</strong><ul>{archive.flights.map((flight) =>
      <li key={flight.id}>{flight.name} · 출발 {format(flight.etd, tz)} · 감시 종료</li>)}</ul></div>}
    {archive?.events?.length > 0 && <div><strong>발생 이력</strong><ul>{archive.events.map((event) =>
      <li key={event.id}>{format(event.detectedAt, tz)} · {event.routeName ?? '이전 비행'} · {TYPES[event.type] ?? event.type}{event.target && ` (${event.target})`}</li>)}</ul></div>}
  </details>
}
