import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { getMetrics, getTraffic, getUsers, getPending, approve, reject } from './adminApi.js'
import ResourceTimeline from './ResourceTimeline.jsx'
import CreateForecasterDialog from './CreateForecasterDialog.jsx'
import DemoModePanel from './DemoModePanel.jsx'
import './AdminPage.css'

const ROLE_KO = { pilot: '조종사', forecaster: '예보관', admin: '관리자' }
const STATUS_KO = { pending: '대기', active: '활성', rejected: '거절' }
const RANGES = [['1h', '1시간'], ['24h', '24시간'], ['7d', '7일']]

// 임계 색상(리서치: <70 초록·70~89 주황·90+ 빨강).
function levelColor(p) {
  return p < 70 ? 'var(--level-green)' : p < 90 ? 'var(--level-amber)' : 'var(--level-red)'
}
function gb(bytes) {
  return (bytes / 1024 ** 3).toFixed(1)
}
function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
function ResourceGauge({ label, pct, sub }) {
  return (
    <div className="admin-gauge">
      <div className="admin-gauge-label">{label}</div>
      <div className="admin-gauge-value" style={{ color: levelColor(pct) }}>{Math.round(pct)}%</div>
      <div className="admin-gauge-bar"><span style={{ width: `${Math.min(100, pct)}%`, background: levelColor(pct) }} /></div>
      {sub && <div className="admin-gauge-sub">{sub}</div>}
    </div>
  )
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const [range, setRange] = useState('24h')
  const [metrics, setMetrics] = useState(null)
  const [traffic, setTraffic] = useState(null)
  const [users, setUsers] = useState([])
  const [pending, setPending] = useState([])
  const [denied, setDenied] = useState(false)
  const [showDialog, setShowDialog] = useState(false)

  const isAdmin = user?.role === 'admin' // 실제 차단은 서버(requireRole). 여기선 UI 노출만 관리자로 제한.

  const load = useCallback(async () => {
    try {
      const [m, t, u, p] = await Promise.all([getMetrics(range), getTraffic(), getUsers(), getPending()])
      setMetrics(m); setTraffic(t); setUsers(u); setPending(p); setDenied(false)
    } catch (err) {
      if (err.status === 401 || err.status === 403) setDenied(true)
    }
  }, [range])

  useEffect(() => {
    if (!isAdmin) return undefined // 관리자 아니면 데이터 요청·폴링 자체를 하지 않음
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load, isAdmin])

  if (loading) return null
  // 로그인 안 함·비관리자·세션만료(서버 401/403) 모두 즉시 차단 — 서버 응답 종류와 무관.
  if (!isAdmin || denied) {
    return (
      <div className="admin-denied">
        <p>관리자 전용 페이지입니다.</p>
        <a href="/">← 메인으로</a>
      </div>
    )
  }

  const cur = metrics?.current
  const memPct = cur && cur.memTotal ? (cur.memUsed / cur.memTotal) * 100 : 0
  const diskPct = cur && cur.diskTotal ? (cur.diskUsed / cur.diskTotal) * 100 : 0

  return (
    <div className="admin-page">
      <header className="admin-header">
        <a className="admin-back" href="/" aria-label="메인으로"><ArrowLeft size={18} /></a>
        <h1>관리자 콘솔</h1>
      </header>

      {/* 0) 시연 모드 — 자동수집(cron) 정지/재개 + 데이터 스냅샷 + "지금" 시각 오버라이드. 개발자 콘솔(/dev)에도 같은 패널이 있음. */}
      <DemoModePanel />

      {/* 1) 시스템 리소스 */}
      <section className="admin-card admin-resources">
        <div className="admin-card-head">
          <h2>시스템 리소스</h2>
          <div className="admin-range-toggle" role="tablist">
            {RANGES.map(([key, label]) => (
              <button key={key} type="button" className={`admin-range-btn${range === key ? ' is-active' : ''}`} onClick={() => setRange(key)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="admin-gauges">
          <ResourceGauge label="CPU" pct={cur?.cpuPct ?? 0} />
          <ResourceGauge label="메모리" pct={memPct} sub={cur ? `${gb(cur.memUsed)} / ${gb(cur.memTotal)} GB` : ''} />
          <ResourceGauge label="디스크" pct={diskPct} sub={cur && cur.diskTotal ? `${gb(cur.diskUsed)} / ${gb(cur.diskTotal)} GB` : '—'} />
        </div>
        <ResourceTimeline series={metrics?.series || []} peakCpu={metrics?.peakCpu || null} />
      </section>

      <div className="admin-two-col">
        {/* 2a) 트래픽 */}
        <section className="admin-card">
          <div className="admin-card-head"><h2>트래픽</h2></div>
          <div className="admin-traffic-stats">
            <div><span className="admin-stat-num">{traffic?.online ?? '—'}</span><span className="admin-stat-label">현재 접속</span></div>
            <div><span className="admin-stat-num">{traffic?.total ?? '—'}</span><span className="admin-stat-label">총 방문자</span></div>
          </div>
        </section>

        {/* 2b) 가입 승인 대기 */}
        <section className="admin-card">
          <div className="admin-card-head"><h2>가입 승인 대기 {pending.length > 0 && <span className="admin-badge">{pending.length}</span>}</h2></div>
          {pending.length === 0 ? (
            <p className="admin-empty">대기 중인 가입 요청이 없습니다.</p>
          ) : (
            <ul className="admin-pending-list">
              {pending.map((u) => (
                <li key={u.id}>
                  <span className="admin-pending-name">{u.username}</span>
                  <span className="admin-pending-date">{fmtDate(u.created_at)}</span>
                  <span className="admin-pending-actions">
                    <button type="button" className="admin-btn-approve" onClick={async () => { await approve(u.id); load() }}>승인</button>
                    <button type="button" className="admin-btn-reject" onClick={async () => { await reject(u.id); load() }}>거절</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 3) 전체 사용자 */}
      <section className="admin-card">
        <div className="admin-card-head">
          <h2>전체 사용자 <span className="admin-count">{users.length}</span></h2>
          <button type="button" className="admin-add-btn" onClick={() => setShowDialog(true)}>예보관 추가</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>아이디</th><th>역할</th><th>상태</th><th>가입일</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td><span className="admin-role-badge" data-role={u.role}>{ROLE_KO[u.role] || u.role}</span></td>
                  <td><span className="admin-status-badge" data-status={u.status}>{STATUS_KO[u.status] || u.status}</span></td>
                  <td>{fmtDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showDialog && <CreateForecasterDialog onClose={() => setShowDialog(false)} onCreated={load} />}
    </div>
  )
}
