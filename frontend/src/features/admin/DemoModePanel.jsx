import { useCallback, useEffect, useRef, useState } from 'react'
import { getDemoMode, revertDemoMode, listSnapshots, saveSnapshot, deleteSnapshot, getDemoModeLog, getDemoInstance, startDemoInstance, stopDemoInstance, setDemoView } from './adminApi.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import './AdminPage.css'

function fmtDateTime(iso, tz) {
  if (!iso) return '—'
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

const fmtGb = (bytes) => (Number.isFinite(bytes) ? `${(bytes / 1e9).toFixed(1)} GB` : null)

// 스냅샷에 담긴 KIM 확대 영역 예보시각(기준시각 앞뒤 일부만 담는다). 없으면 지도는 한반도 회차로 보인다.
function snapshotSummary(snap) {
  const hours = snap.kimExpanded?.hours
  const kim = hours?.length ? `KIM 확대 +${hours[0]}~+${hours.at(-1)}h(${snap.kimExpanded.tmfc.slice(-2)} UTC)` : 'KIM 한반도만'
  return [fmtGb(snap.bytes), kim].filter(Boolean).join(' · ')
}

function failureText(body, fallback) {
  if (body?.error === 'snapshot_disk_budget') {
    return `디스크 부족 — 저장하면 ${fmtGb(body.free - body.bytes)}만 남아 다음 확대 KIM 수집에 필요한 ${fmtGb(body.minFreeAfterBytes)}보다 적습니다. 기존 스냅샷을 지우고 다시 저장하세요.`
  }
  if (body?.error === 'snapshot_in_use') return '시연 중인 스냅샷은 시연을 끝낸 뒤에 지울 수 있습니다.'
  if (body?.error === 'demo_instance_low_memory') return `서버 메모리 부족 — 남은 ${fmtGb(body.available)}, 필요 ${fmtGb(body.required)}. 잠시 뒤 다시 시도하세요.`
  if (body?.error === 'demo_instance_running') return '시연 서버가 이미 켜져 있습니다.'
  if (body?.error === 'demo_instance_not_running') return '먼저 시연 서버를 켜세요.'
  return fallback
}

function readinessText(inspection) {
  if (!inspection) return '점검 중'
  if (inspection.ready) return '준비 완료'
  const blockers = inspection.blockers ?? []
  const radar = blockers.find((item) => item.startsWith('radar:short_history:'))
  const satellite = blockers.find((item) => item.startsWith('satellite:short_history:'))
  const adsb = blockers.find((item) => item.startsWith('adsb:reference_skew:'))
  const missingCount = blockers.filter((item) => item.startsWith('missing_type:')).length
  const kim = blockers.find((item) => item.startsWith('kim_nwp_ea:'))
  if (radar) return `레이더 이력 부족 (${radar.split(':').at(-1)})`
  if (satellite) return `위성 이력 부족 (${satellite.split(':').at(-1)})`
  if (adsb) return '항공기 위치 시각 불일치'
  if (missingCount) return `핵심 자료 ${missingCount}종 누락`
  if (kim) return `KIM 확대 영역 불완전 (${kim.split(':').slice(1).join(':')})`
  return `점검 실패 (${blockers.length}건)`
}

// 시연 모드: 시연 서버(시연 전용 백엔드)를 스냅샷으로 켜고, 시연할 브라우저에서만 "이 브라우저에서 시연 보기"를 누른다.
// 다른 방문자는 계속 실황을 본다. 시연 쿠키가 붙은 브라우저의 요청은 웹서버가 시연 서버로 보내므로, 그 브라우저에서
// 이 화면은 시연 서버가 그린다(role: 'demo') — 거기서는 "이 브라우저 시연 끄기"만 보인다.
// 시연 서버가 켜져 있는 동안 확대 KIM 수집은 멈춘다(서버 메모리). 이전의 "모든 방문자에게 시연"이 켜져 있으면 끄는 버튼만 남긴다.
// 관리자 콘솔(/admin)과 개발자 콘솔(/dev) 둘 다에서 씀 — 백엔드는 /api/admin/*(admin 전용, 배포 서버에서도 항상 마운트).
export default function DemoModePanel() {
  const { tz } = useTimeZone()
  const [demoStatus, setDemoStatus] = useState({ on: false, now: null, name: null })
  const [instance, setInstance] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [events, setEvents] = useState([])
  const [busyLabel, setBusyLabel] = useState(null) // null이면 안 바쁨, 문자열이면 그 설명으로 로딩 표시
  const [elapsedSec, setElapsedSec] = useState(0)
  const [msg, setMsg] = useState(null)
  const busy = busyLabel != null
  const elapsedTimerRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const [d, i, s, l] = await Promise.all([getDemoMode(), getDemoInstance(), listSnapshots(), getDemoModeLog()])
      setDemoStatus(d); setInstance(i); setSnapshots(s.snapshots ?? []); setEvents(l.events ?? [])
    } catch { /* 권한 없음 등 — 접근 제어는 상위(페이지)에서 처리, 여기선 조용히 무시 */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  async function run(label, fn, okText, { reload = false } = {}) {
    setBusyLabel(label); setMsg(null); setElapsedSec(0)
    elapsedTimerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000)
    try {
      const d = await fn()
      // 이 브라우저의 시연 쿠키가 바뀌면 지도·자료가 모두 다른 서버에서 오므로 새로 연다.
      if (reload) { window.location.reload(); return }
      window.dispatchEvent(new Event('projectamo:data-view-changed'))
      setMsg({ ok: true, text: typeof okText === 'function' ? okText(d) : okText })
      await refresh()
    } catch (err) {
      const reason = err.body?.error ?? err.message
      const inspection = err.body?.inspection
      setMsg({ ok: false, text: failureText(err.body, inspection ? `${reason}: ${readinessText(inspection)}` : reason) })
    } finally {
      clearInterval(elapsedTimerRef.current)
      setBusyLabel(null)
    }
  }

  const viewingDemo = instance?.role === 'demo'
  const serverOn = instance?.role === 'main' && instance.running

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h2>시연 모드 {(viewingDemo || demoStatus.on) && <span className="admin-badge">{viewingDemo ? '이 브라우저 시연 중' : '진행 중'}</span>}</h2>
      </div>

      {busy && (
        <p className="admin-empty" style={{ color: 'var(--level-amber, #b45309)', fontWeight: 700 }}>
          ⏳ {busyLabel}… ({elapsedSec}초 경과 — 시연 서버 켜기는 30초 안팎, 새 스냅샷 저장은 자료량에 따라 오래 걸릴 수 있습니다.)
        </p>
      )}

      {viewingDemo ? (
        <>
          <p className="admin-empty">
            이 브라우저만 시연 자료(<b>{demoStatus.name}</b>)를 보고 있습니다. 다른 방문자는 실황을 봅니다.
            "지금" 시각은 <b>{fmtDateTime(demoStatus.now, tz)} {tz}</b>로 고정됩니다.
          </p>
          <button type="button" className="admin-btn-reject" disabled={busy}
            onClick={() => run('이 브라우저 시연 끄는 중', () => setDemoView(false), null, { reload: true })}>
            {busy ? '⏳ 처리 중…' : '■ 이 브라우저 시연 끄기'}
          </button>
          <p className="admin-empty" style={{ fontSize: 12 }}>시연을 끈 뒤 이 화면에서 시연 서버를 끄세요(확대 KIM 수집이 다시 돕니다).</p>
        </>
      ) : demoStatus.on ? (
        <>
          <p className="admin-empty">
            이전 방식의 "모든 방문자에게 시연"이 켜져 있습니다 — 모든 방문자가 시연 자료(<b>{demoStatus.name}</b>)를 보고 있습니다.
          </p>
          <button type="button" className="admin-btn-reject" disabled={busy} style={{ marginBottom: 12 }}
            onClick={() => run('전체 시연 종료 중', revertDemoMode, (d) => d.note)}>
            {busy ? '⏳ 처리 중…' : '■ 전체 시연 종료 (최신 실황으로 즉시 전환)'}
          </button>
        </>
      ) : serverOn ? (
        <>
          <p className="admin-empty">
            시연 서버가 켜져 있습니다 — <b>{instance.name}</b>, 기준시각 <b>{fmtDateTime(instance.referenceTime, tz)} {tz}</b>.
            확대 KIM 수집은 멈춰 있습니다. 시연할 브라우저에서 아래 버튼을 누르세요(그 브라우저만 시연 자료를 봅니다).
          </p>
          <button type="button" className="admin-btn-approve" disabled={busy} style={{ marginRight: 6 }}
            onClick={() => run('이 브라우저를 시연으로 전환 중', () => setDemoView(true), null, { reload: true })}>
            {busy ? '⏳ 처리 중…' : '▶ 이 브라우저에서 시연 보기'}
          </button>
          <button type="button" className="admin-btn-reject" disabled={busy}
            onClick={() => run('시연 서버 끄는 중', stopDemoInstance, '시연 서버를 껐습니다. 확대 KIM 수집이 다시 돕니다.')}>
            {busy ? '⏳ 처리 중…' : '■ 시연 서버 끄기'}
          </button>
        </>
      ) : (
        <>
          <p className="admin-empty">
            스냅샷을 골라 시연 서버를 켠 다음, 시연할 브라우저에서 "이 브라우저에서 시연 보기"를 누릅니다. 다른 방문자는 계속 실황을 봅니다.
            시연 서버가 켜져 있는 동안 확대 KIM 수집은 멈추고, 돌던 회차는 중단됩니다.
          </p>
          <div style={{ marginBottom: 12 }}>
            <span className="admin-empty">스냅샷</span>
            {snapshots.length === 0 && <p className="admin-empty">저장된 스냅샷 없음 — 먼저 아래에서 저장하세요.</p>}
            {snapshots.length > 0 && (
              <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {snapshots.map((snap, i) => (
                  <li key={snap.name} style={{ marginBottom: 6 }}>
                    <button type="button" className="admin-btn-approve" disabled={busy || !snap.inspection?.ready}
                      onClick={() => run(`${snap.name}로 시연 서버 켜는 중`, () => startDemoInstance(snap.name), (d) => `시연 서버 켜짐: ${d.name}${d.abortedExpanded?.length ? ' (돌던 확대 KIM 회차 중단)' : ''}`)}>
                      {busy ? '⏳ 처리 중…' : `${i + 1}. ▶ 시연 서버 켜기 — 기준시각 ${fmtDateTime(snap.referenceTime, tz)} ${tz} · ${readinessText(snap.inspection)}`}
                    </button>
                    <button type="button" className="admin-btn-reject" disabled={busy} style={{ marginLeft: 6 }}
                      onClick={() => { if (window.confirm(`${snap.name} 스냅샷을 지울까요? 되돌릴 수 없습니다.`)) run(`${snap.name} 삭제 중`, () => deleteSnapshot(snap.name), `삭제됨: ${snap.name}`) }}>
                      삭제
                    </button>
                    <div className="admin-empty" style={{ fontSize: 12 }}>{snapshotSummary(snap)}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <button type="button" className="admin-btn-approve" disabled={busy}
            onClick={() => run('지금 상태 저장 중', () => saveSnapshot(), (d) => `저장됨: ${d.name} (${d.saved.length}개 항목 · ${snapshotSummary(d)})`)}>
            {busy ? '⏳ 처리 중…' : '💾 지금 상태를 새 스냅샷으로 저장'}
          </button>
          <p className="admin-empty" style={{ fontSize: 12 }}>
            KIM 확대 영역은 기준시각 1시간 전부터 6시간 뒤까지만 담습니다(약 1.3 GB). 다음 확대 수집에 필요한 디스크 여유가 모자라면 저장하지 않습니다.
            {instance?.lastExit && ` 시연 서버 마지막 종료: ${fmtDateTime(instance.lastExit.at, tz)} ${tz} (코드 ${instance.lastExit.code ?? instance.lastExit.signal}).`}
          </p>
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
                  [{fmtDateTime(e.at, tz)} {tz}] {e.action}: {e.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
