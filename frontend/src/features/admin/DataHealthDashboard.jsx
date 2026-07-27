import { useCallback, useEffect, useState } from 'react'
import { getDataHealth } from './adminApi.js'
import './AdminPage.css'

function fmtClock(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "3분 전"/"2시간 전"/"5일 전" — 자료 종류마다 정상 주기가 달라 색으로 정상/경고를 판단하지 않는다
// (레이더는 5분마다, NOTAM은 6시간마다가 정상이라 공통 기준을 넣으면 오히려 오판을 부른다).
// 숫자를 그대로 보여주고 판단은 보는 사람이 한다.
function fmtAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

function DataHealthTile({ label, fetchedAt, failing, lastError }) {
  return (
    <div className={`data-health-tile${failing ? ' is-failing' : ''}`} title={lastError || undefined}>
      <div className="data-health-tile-label">{label}</div>
      {failing ? (
        <div className="data-health-tile-ago">실패(재시도중)</div>
      ) : (
        <div className="data-health-tile-ago">{fetchedAt ? fmtAgo(fetchedAt) : '자료 없음'}</div>
      )}
      <div className="data-health-tile-clock">{fetchedAt ? fmtClock(fetchedAt) : '—'}</div>
    </div>
  )
}

export default function DataHealthDashboard() {
  const [types, setTypes] = useState([])

  const refresh = useCallback(async () => {
    try {
      const { types: rows } = await getDataHealth()
      setTypes(rows ?? [])
    } catch { /* 권한 없음 등 — AdminPage가 상위에서 처리 */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  if (!types.length) return null

  return (
    <section className="admin-card">
      <div className="admin-card-head"><h2>데이터 현황</h2></div>
      <div className="data-health-grid">
        {types.map((t) => <DataHealthTile key={t.key} {...t} />)}
      </div>
    </section>
  )
}
