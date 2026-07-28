import { useCallback, useEffect, useRef, useState } from 'react'
import { getDemoMode, revertDemoMode, listSnapshots, saveSnapshot, loadSnapshot, getDemoModeLog } from './adminApi.js'
import './AdminPage.css'

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function readinessText(inspection) {
  if (!inspection) return '점검 중'
  if (inspection.ready) return '준비 완료'
  const blockers = inspection.blockers ?? []
  const radar = blockers.find((item) => item.startsWith('radar:short_history:'))
  const satellite = blockers.find((item) => item.startsWith('satellite:short_history:'))
  const adsb = blockers.find((item) => item.startsWith('adsb:reference_skew:'))
  const missingCount = blockers.filter((item) => item.startsWith('missing_type:')).length
  if (radar) return `레이더 이력 부족 (${radar.split(':').at(-1)})`
  if (satellite) return `위성 이력 부족 (${satellite.split(':').at(-1)})`
  if (adsb) return '항공기 위치 시각 불일치'
  if (missingCount) return `핵심 자료 ${missingCount}종 누락`
  return `점검 실패 (${blockers.length}건)`
}

// 시연 모드 = 딱 두 가지 동작만 있다: ① 스냅샷 하나를 골라 "시연 시작"(활성 읽기 경로 + 시각 전환)
// ② "시연 종료"(계속 수집 중인 실황 경로로 즉시 복귀). 켜기/끄기/복원/되돌리기가
// 따로 노는 버튼이었던 이전 버전이 헷갈린다는 피드백으로 단순화함.
// 관리자 콘솔(/admin)과 개발자 콘솔(/dev) 둘 다에서 씀 — 백엔드는 /api/admin/*(admin 전용, 배포 서버에서도 항상 마운트).
export default function DemoModePanel() {
  const [demoStatus, setDemoStatus] = useState({ on: false, now: null, hasLiveBackup: false })
  const [snapshots, setSnapshots] = useState([])
  const [events, setEvents] = useState([])
  const [busyLabel, setBusyLabel] = useState(null) // null이면 안 바쁨, 문자열이면 그 설명으로 로딩 표시
  const [elapsedSec, setElapsedSec] = useState(0)
  const [msg, setMsg] = useState(null)
  const busy = busyLabel != null
  const elapsedTimerRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const [d, s, l] = await Promise.all([getDemoMode(), listSnapshots(), getDemoModeLog()])
      setDemoStatus(d); setSnapshots(s.snapshots ?? []); setEvents(l.events ?? [])
    } catch { /* 권한 없음 등 — 접근 제어는 상위(페이지)에서 처리, 여기선 조용히 무시 */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  async function run(label, fn, okText) {
    setBusyLabel(label); setMsg(null); setElapsedSec(0)
    elapsedTimerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000)
    try {
      const d = await fn()
      window.dispatchEvent(new Event('projectamo:data-view-changed'))
      setMsg({ ok: true, text: typeof okText === 'function' ? okText(d) : okText })
      await refresh()
    } catch (err) {
      const reason = err.body?.error ?? err.message
      const inspection = err.body?.inspection
      setMsg({ ok: false, text: inspection ? `${reason}: ${readinessText(inspection)}` : reason })
    } finally {
      clearInterval(elapsedTimerRef.current)
      setBusyLabel(null)
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h2>시연 모드 {demoStatus.on && <span className="admin-badge">진행 중</span>}</h2>
      </div>

      {busy && (
        <p className="admin-empty" style={{ color: 'var(--level-amber, #b45309)', fontWeight: 700 }}>
          ⏳ {busyLabel}… ({elapsedSec}초 경과 — 경로 전환은 즉시 끝나며, 새 스냅샷 저장만 자료량에 따라 오래 걸릴 수 있습니다.)
        </p>
      )}

      {demoStatus.on ? (
        <>
          <p className="admin-empty">
            지금 시연 데이터 뷰를 읽는 상태입니다 — 실황 수집은 별도 경로에서 계속되고, 지도에 "시연용 모드" 배지 표시,
            브리핑 기준 "지금" 시각은 <b>{fmtDateTime(demoStatus.now)}</b>로 고정.
          </p>
          <button type="button" className="admin-btn-reject" disabled={busy} style={{ marginBottom: 12 }}
            onClick={() => run('시연 종료 처리 중', revertDemoMode, (d) => d.note)}>
            {busy ? '⏳ 처리 중…' : '■ 시연 종료 (최신 실황 경로로 즉시 전환)'}
          </button>
          {snapshots.length > 1 && (
            <div>
              <span className="admin-empty">다른 스냅샷으로 전환</span>
              <div style={{ marginTop: 6 }}>
                {snapshots.map((snap) => (
                  <button key={snap.name} type="button" className="admin-btn-approve" disabled={busy || !snap.inspection?.ready}
                    style={{ marginRight: 6, marginBottom: 6 }}
                    onClick={() => run(`${snap.name}로 전환 중`, () => loadSnapshot(snap.name), (d) => `전환됨: ${d.name} (기준시각 ${fmtDateTime(d.now)})`)}>
                    {snap.name} — {fmtDateTime(snap.referenceTime)} · {readinessText(snap.inspection)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="admin-empty">
            아래 스냅샷 중 하나를 골라 "시연 시작"을 누르면 복사 없이 그 시점 데이터 경로로 즉시 바뀌고,
            지도에 "시연용 모드" 배지가 뜨고, 새 비행계획도 그 시점 "지금"으로 맞춰집니다 — 한 번에 다 됩니다.
          </p>
          <div style={{ marginBottom: 12 }}>
            <span className="admin-empty">시연 가능한 스냅샷</span>
            {snapshots.length === 0 && <p className="admin-empty">저장된 스냅샷 없음 — 먼저 아래에서 저장하세요.</p>}
            {snapshots.length > 0 && (
              <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {snapshots.map((snap, i) => (
                  <li key={snap.name} style={{ marginBottom: 6 }}>
                    <button type="button" className="admin-btn-approve" disabled={busy || !snap.inspection?.ready}
                      onClick={() => run(`${snap.name} 시연 시작 중`, () => loadSnapshot(snap.name), (d) => `시연 시작: ${d.name} (기준시각 ${fmtDateTime(d.now)})`)}>
                      {busy ? '⏳ 처리 중…' : `${i + 1}. ▶ 시연 시작 — 기준시각 ${fmtDateTime(snap.referenceTime)} · ${readinessText(snap.inspection)}`}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <button type="button" className="admin-btn-approve" disabled={busy}
            onClick={() => run('지금 상태 저장 중', () => saveSnapshot(), (d) => `저장됨: ${d.name} (${d.saved.length}개 항목)`)}>
            {busy ? '⏳ 처리 중…' : '💾 지금 상태를 새 스냅샷으로 저장'}
          </button>
        </>
      )}

      {msg && <p className="admin-empty" style={{ color: msg.ok ? 'var(--level-green)' : 'var(--level-red)' }}>{msg.text}</p>}

      {/* 디버깅용 로그 — 버튼 눌렀을 때 서버에서 실제로 뭐가 됐는지(저장/시작/종료/실패) 그대로 보여준다. */}
      <div style={{ marginTop: 12, borderTop: '1px solid var(--stroke-2, #e5e7eb)', paddingTop: 8 }}>
        <span className="admin-empty">최근 동작 로그</span>
        {events.length === 0 && <p className="admin-empty">아직 기록 없음</p>}
        {events.length > 0 && (
          <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', maxHeight: 200, overflowY: 'auto' }}>
            {events.map((e, i) => (
              <li key={i} className="admin-empty" style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: e.action.includes('failed') ? 'var(--level-red)' : 'inherit' }}>
                  [{fmtDateTime(e.at)}] {e.action}: {e.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
