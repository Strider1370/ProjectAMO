import { useCallback, useEffect, useState } from 'react'
import { getDemoMode, setDemoMode, revertDemoMode, listSnapshots, saveSnapshot, loadSnapshot } from './adminApi.js'
import './AdminPage.css'

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 시연 모드 on/off + 데이터 스냅샷 저장/복원/되돌리기. 관리자 콘솔(/admin)과 개발자 콘솔(/dev) 둘 다에서 씀 —
// 백엔드는 /api/admin/*(admin 전용, 배포 서버에서도 항상 마운트)라 두 화면 어디서 눌러도 동일하게 동작한다.
export default function DemoModePanel() {
  const [demoStatus, setDemoStatus] = useState({ on: false, now: null, hasLiveBackup: false })
  const [snapshots, setSnapshots] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([getDemoMode(), listSnapshots()])
      setDemoStatus(d); setSnapshots(s.snapshots ?? [])
    } catch { /* 권한 없음 등 — 접근 제어는 상위(페이지)에서 처리, 여기선 조용히 무시 */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  async function run(fn, okText) {
    setBusy(true); setMsg(null)
    try {
      const d = await fn()
      setMsg({ ok: true, text: typeof okText === 'function' ? okText(d) : okText })
      await refresh()
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h2>시연 모드 {demoStatus.on && <span className="admin-badge">ON</span>}</h2>
      </div>
      <p className="admin-empty">
        켜면 자동수집(METAR/TAF 등 주기 수집)이 즉시 멈춰서 지금 데이터가 시연 중 덮어써지지 않습니다.
        지도 좌측 상단에 "시연용 모드" 표시가 뜹니다. 서버 재시작 없이 바로 적용/해제됩니다.
      </p>
      {demoStatus.on && (
        <p className="admin-empty">
          현재 브리핑 기준 "지금" 시각: <b>{fmtDateTime(demoStatus.now)}</b>
          {' '}— 스냅샷을 복원하면 그 스냅샷 시점으로 자동 고정되어, 새 비행계획을 지금 만들어도 그 시점 기상과 어긋나지 않습니다.
        </p>
      )}
      <div className="admin-traffic-stats" style={{ marginBottom: 8 }}>
        <button type="button" className={demoStatus.on ? 'admin-btn-reject' : 'admin-btn-approve'} disabled={busy}
          onClick={() => run(() => setDemoMode(!demoStatus.on), (d) => `시연 모드 ${d.on ? 'ON' : 'OFF'}`)}>
          {demoStatus.on ? '시연 모드 끄기 (자동수집 재개)' : '시연 모드 켜기 (자동수집 정지)'}
        </button>
        <button type="button" className="admin-btn-reject" disabled={busy || !demoStatus.hasLiveBackup}
          onClick={() => run(revertDemoMode, (d) => d.note)}>
          ↺ 원래 모드로 되돌리기
        </button>
      </div>
      {!demoStatus.hasLiveBackup && <span className="admin-empty">되돌릴 백업 없음(스냅샷을 아직 복원한 적 없음).</span>}

      <button type="button" className="admin-btn-approve" disabled={busy} style={{ marginBottom: 12 }}
        onClick={() => run(() => saveSnapshot(), (d) => `저장됨: ${d.name} (${d.saved.length}개 항목)`)}>
        💾 지금 상태 저장 (자동으로 순번 이름 부여)
      </button>

      <div>
        <span className="admin-empty">시연 가능한 스냅샷</span>
        {snapshots.length === 0 && <p className="admin-empty">저장된 스냅샷 없음</p>}
        {snapshots.length > 0 && (
          <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {snapshots.map((snap, i) => (
              <li key={snap.name} style={{ marginBottom: 6 }}>
                <button type="button" className="admin-btn-approve" disabled={busy}
                  onClick={() => run(() => loadSnapshot(snap.name), (d) => `복원됨: ${d.name} (${d.restored.length}개 항목, 기준시각 ${fmtDateTime(d.now)})`)}>
                  {i + 1}. 복원 — 기준시각 {fmtDateTime(snap.referenceTime)}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {msg && <p className="admin-empty" style={{ color: msg.ok ? 'var(--level-green)' : 'var(--level-red)' }}>{msg.text}</p>}
    </section>
  )
}
