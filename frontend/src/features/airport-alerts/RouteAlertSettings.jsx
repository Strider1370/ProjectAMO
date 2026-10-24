import { useEffect, useState } from 'react'
import { ArrowLeft, BellRing, X } from 'lucide-react'
import usePersonalSettings from '../personal/usePersonalSettings.js'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import AlertIcon from './AlertIcon.jsx'
import { clock } from './AlertCard.jsx'
import { Switch } from './AlertWatchesPage.jsx'
import { alertView } from './alertModel.js'
import './airportAlerts.css'

const API = '/api/me/route-alert-watches'
const R_NM = 3440.065
// 경로선 길이(NM) — 겹치는 구간 막대의 가로축.
function lengthNm(geometry) {
  const c = geometry?.coordinates ?? []
  let total = 0
  for (let i = 1; i < c.length; i++) {
    const [lon1, lat1] = c[i - 1].map((v) => (v * Math.PI) / 180)
    const [lon2, lat2] = c[i].map((v) => (v * Math.PI) / 180)
    const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
    total += 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)))
  }
  return total
}
const fl = (ft) => `FL${String(Math.round(ft / 100)).padStart(3, '0')}`

// 저장 경로 하나의 SIGMET 감시. 비행 정보, 경로 막대 위 겹치는 구간, 지금 겹치는 SIGMET, 감시 기간.
export default function RouteAlertSettings({ routeId, watches, notifications = [], onBack, onClose }) {
  const { tz } = useTimeZone()
  const { pushEnabled, togglePush } = usePersonalSettings()
  const isMobile = useIsMobile()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [lastTest, setLastTest] = useState(null)
  const watch = watches.route.watches.find((item) => item.routeId === routeId) ?? null
  const route = watches.route.routes.find((item) => item.id === routeId) ?? null
  const snapshot = watch?.snapshot ?? route?.snapshot ?? null
  const name = watch?.routeName ?? route?.name ?? '저장 경로'
  const tzLabel = tz === 'UTC' ? 'UTC' : 'KST'
  const totalNm = lengthNm(snapshot?.routeGeometry)
  const active = notifications.filter((n) => n.source === 'route' && n.routeId === routeId && n.active)

  useEffect(() => {
    if (!routeId) return undefined
    let cancelled = false
    fetch(`/api/me/alert-tests/latest?routeId=${routeId}`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : { test: null })
      .then((data) => { if (!cancelled) setLastTest(data.test) }).catch(() => {})
    return () => { cancelled = true }
  }, [routeId])

  async function call(run, success) {
    setBusy(true); setMessage('')
    try { await run(); await watches.changed(); setMessage(success) } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const start = () => call(async () => {
    const response = await fetch(`${API}/${routeId}`, { method: 'PUT', credentials: 'include' })
    if (!response.ok) throw new Error('경로선과 출발·도착 시각을 확인하세요. 지난 비행은 감시할 수 없습니다.')
  }, watch ? '감시 경로를 지금 저장된 경로로 바꿨습니다.' : '이 경로의 SIGMET 감시를 시작했습니다.')
  const pause = () => call(async () => {
    const response = await fetch(`${API}/${watch.id}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) })
    if (!response.ok) throw new Error('감시를 일시정지하지 못했습니다.')
  }, 'SIGMET 감시를 일시정지했습니다. 발생 이력은 유지됩니다.')
  const remove = () => call(async () => {
    const response = await fetch(`${API}/${watch.id}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok) throw new Error('경로 감시를 삭제하지 못했습니다.')
  }, '경로 감시를 삭제했습니다. 발생 이력은 유지됩니다.')
  async function runTest() {
    if (!watch?.enabled) return
    setBusy(true); setMessage('')
    try {
      let endpoint
      if (pushEnabled) endpoint = (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint
      const response = await fetch('/api/me/alert-tests', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ routeWatchId: watch.id, scenario: 'sigmet', ...(endpoint ? { endpoint } : {}) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error === 'device_not_subscribed' ? '이 기기의 푸시 구독이 만료됐습니다. 다시 켜 주세요.' : 'SIGMET 시험을 실행하지 못했습니다.')
      setLastTest(data.test)
      if (window.innerWidth > 719) window.dispatchEvent(new CustomEvent('airport-alert-preview', { detail: {
        id: `test:${data.test.id}`, testId: data.test.id, source: 'route', test: true, routeId, routeName: name,
        type: 'sigmet', payload: data.test.payload, detectedAt: data.test.createdAt } }))
      setMessage(data.test.pushStatus === 'sent' ? '이 기기로 SIGMET 시험 푸시를 보냈습니다.' : '모의 SIGMET이 발동했습니다. 휴대폰 푸시로 받아 보려면 휴대폰에서 푸시를 켠 뒤 그 휴대폰에서 시험하세요.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }

  if (!snapshot) return <main className="aa-page"><div className="aa-shell">
    <header className="aa-head"><button type="button" className="aa-back" aria-label="감시 대상으로" onClick={onBack}><ArrowLeft size={18} /></button><h1>{name}</h1>
      <button type="button" className="aa-close" aria-label="알림 패널 닫기" onClick={onClose}><X size={18} /></button></header>
    <p className="aa-empty">이 경로는 경로선이나 ETD·ETA가 없어 감시할 수 없습니다. 경로 생성에서 다시 저장하세요.</p></div></main>

  return <main className="aa-page"><div className="aa-shell">
    <header className="aa-head">
      <button type="button" className="aa-back" aria-label="감시 대상으로" onClick={onBack}><ArrowLeft size={18} /></button>
      <h1>{name}</h1>
      <span className={`aa-pill${watch?.enabled ? ' is-on' : ''}`}>{watch ? (watch.enabled ? 'SIGMET 감시 중' : '일시정지') : '미설정'}</span>
      {watch && <Switch checked={watch.enabled} label="이 경로 SIGMET 감시" disabled={busy} onChange={(next) => (next ? start() : pause())} />}
      <button type="button" className="aa-close" aria-label="알림 패널 닫기" onClick={onClose}><X size={18} /></button>
    </header>
    {message && <p className="aa-message" role="status">{message}</p>}

    <section className="aa-box" aria-label="감시하는 비행">
      <div className="aa-cells is-three">
        <div className="aa-cell is-center"><span className="aa-cell-label">ETD</span><b className="is-big">{clock(snapshot.etd, tz)}</b><small>{tzLabel}</small></div>
        <div className="aa-cell is-center"><span className="aa-cell-label">ETA</span><b className="is-big">{clock(snapshot.eta, tz)}</b><small>{Math.round((Date.parse(snapshot.eta) - Date.parse(snapshot.etd)) / 60000)}분</small></div>
        <div className="aa-cell is-center"><span className="aa-cell-label">순항고도</span><b className="is-big">{snapshot.cruiseAltitudeFt ? fl(snapshot.cruiseAltitudeFt) : '미설정'}</b><small>{Math.round(totalNm)}NM</small></div>
      </div>
      <div className="aa-route-bar" role="img" aria-label={`경로 ${Math.round(totalNm)}NM 중 SIGMET이 겹치는 구간`}>
        <span className="aa-route-line" />
        {active.map((n) => {
          const p = n.payload ?? {}
          if (!(totalNm > 0) || !Number.isFinite(p.intersectFromNm)) return null
          const left = Math.min(100, (p.intersectFromNm / totalNm) * 100)
          const width = Math.max(1.5, ((p.intersectToNm - p.intersectFromNm) / totalNm) * 100)
          return <span key={n.id} className="aa-route-hit" style={{ left: `${left}%`, width: `${width}%` }} />
        })}
        <span className="aa-route-end is-start">0NM</span><span className="aa-route-end is-end">{Math.round(totalNm)}NM</span>
      </div>
      <p className="aa-box-note">경로선과 비행 시각에 실제로 겹치는 SIGMET만 알립니다. 계획 고도와 겹치지 않는 발표는 "다른 고도"로 표시합니다.</p>
    </section>

    <section className="aa-box" aria-labelledby="aa-now-sigmet">
      <h2 id="aa-now-sigmet" className="aa-box-title">지금 겹치는 SIGMET {active.length}</h2>
      {!watch?.enabled && <p className="aa-box-note">감시를 켜면 서버가 이 경로와 겹치는 SIGMET을 확인합니다.</p>}
      {watch?.enabled && !active.length && <p className="aa-box-note">지금 겹치는 SIGMET이 없습니다.</p>}
      {active.map((n) => {
        const v = alertView(n)
        return <div key={n.id} className="aa-sigmet">
          <div className="aa-card-head"><AlertIcon kind="sigmet" code={v.code} size={26} framed />
            <div className="aa-card-title"><strong>{v.title}{v.abbr && <span className="aa-abbr">{v.abbr}</span>}</strong><span>SIGMET</span></div></div>
          <div className="aa-cells is-three">
            <div className="aa-cell"><span className="aa-cell-label">고도{v.mine ? <b> · 내 고도 포함</b> : ' · 다른 고도'}</span><b>{v.band}</b></div>
            <div className="aa-cell"><span className="aa-cell-label">겹치는 구간</span><b>{v.segment ?? '확인 중'}</b></div>
            <div className="aa-cell"><span className="aa-cell-label">유효 ({tzLabel})</span><b>{clock(v.validFrom, tz)}–{clock(v.validTo, tz)}</b></div>
          </div>
          <a className="aa-link" href={`/?alert=${encodeURIComponent(n.id)}`}>브리핑에서 보기</a>
        </div>
      })}
    </section>

    <section className="aa-box" aria-labelledby="aa-period">
      <h2 id="aa-period" className="aa-box-title">감시 기간</h2>
      <p className="aa-box-text">지금부터 도착 시각({clock(snapshot.eta, tz)} {tzLabel})까지 · 이후 자동 종료</p>
      <p className="aa-box-note">경로를 고쳤다면 경로 생성에서 다시 저장한 뒤 아래 "감시 경로 업데이트"를 누르세요.</p>
    </section>

    <div className="aa-actions">
      <button type="button" className="aa-primary" disabled={busy} onClick={start}>{watch ? '감시 경로 업데이트' : '이 경로 감시 시작'}</button>
      {isMobile && watch?.enabled && !pushEnabled && <button type="button" disabled={busy} onClick={async () => {
        const result = await togglePush(true)
        setMessage(result.ok ? '이 기기의 푸시를 켰습니다.' : '푸시를 켜지 못했습니다. 브라우저 권한을 확인하세요.')
      }}>이 휴대폰 푸시 켜기</button>}
      {watch?.enabled && <button type="button" disabled={busy} onClick={runTest}><BellRing size={16} aria-hidden="true" />내 기기로 시험 받기</button>}
      {lastTest && <a className="aa-link" href={`/?alertTest=${encodeURIComponent(lastTest.id)}`}>마지막 시험 보기</a>}
      {watch && <button type="button" className="aa-delete" disabled={busy} onClick={remove}>감시 삭제</button>}
    </div>
  </div></main>
}
