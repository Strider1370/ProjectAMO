import { useCallback, useEffect, useState } from 'react'
import { getServerHealth } from './adminApi.js'
import './AdminPage.css'

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function fmtUptime(sec) {
  if (!Number.isFinite(sec)) return '—'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}일 ${h}시간`
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}

function fmtClock(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ServerHealthPanel() {
  const [health, setHealth] = useState(null)

  const refresh = useCallback(async () => {
    try { setHealth(await getServerHealth()) } catch { /* AdminPage가 401/403 처리 */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  if (!health) return null
  const { process: proc, disk, recentErrors } = health
  const diskTotal = disk.reduce((sum, d) => sum + d.bytes, 0)

  return (
    <>
      <section className="admin-card">
        <div className="admin-card-head"><h2>프로세스</h2></div>
        <div className="admin-gauges admin-process-stats">
          <div><span className="admin-stat-num">{proc.bootCount}</span><span className="admin-stat-label">재시작 횟수(집계 시작 이후)</span></div>
          <div><span className="admin-stat-num">{fmtUptime(proc.uptimeSec)}</span><span className="admin-stat-label">이번 가동시간</span></div>
          <div><span className="admin-stat-num">{fmtBytes(proc.heapUsed)}</span><span className="admin-stat-label">Node 힙 사용량 (전체 {fmtBytes(proc.heapTotal)})</span></div>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head"><h2>디스크 사용량 <span className="admin-count">{fmtBytes(diskTotal)}</span></h2></div>
        {disk.length === 0 ? (
          <p className="admin-empty">폴더 없음.</p>
        ) : (
          <ul className="admin-disk-list">
            {disk.map((d) => (
              <li key={d.name} className="admin-disk-row">
                <span className="admin-disk-name">{d.name}</span>
                <span className="admin-disk-bar"><span style={{ width: `${diskTotal ? (d.bytes / diskTotal) * 100 : 0}%` }} /></span>
                <span className="admin-disk-bytes">{fmtBytes(d.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-card">
        <div className="admin-card-head"><h2>최근 수집 실패</h2></div>
        {recentErrors.length === 0 ? (
          <p className="admin-empty">최근 실패 없음.</p>
        ) : (
          <ul className="admin-error-list">
            {recentErrors.map((e, i) => (
              <li key={i} className="admin-error-row">
                <span className="admin-error-type">{e.type}</span>
                <span className="admin-error-msg">{e.error}</span>
                <span className="admin-error-time">{fmtClock(e.time)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
