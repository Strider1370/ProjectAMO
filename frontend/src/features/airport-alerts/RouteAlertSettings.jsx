import { useEffect, useState } from 'react'
import { BellRing, Trash2 } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import './airportAlerts.css'

const API = '/api/me/route-alert-watches'
const time = (iso, tz) => new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul',
}).format(new Date(iso))

export default function RouteAlertSettings({ user, initialRouteId, pushEnabled, togglePush }) {
  const { tz } = useTimeZone()
  const [routes, setRoutes] = useState([])
  const [watches, setWatches] = useState([])
  const [routeId, setRouteId] = useState(() => initialRouteId ?? (Number(new URLSearchParams(window.location.search).get('routeId')) || null))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [lastTest, setLastTest] = useState(null)

  async function refresh() {
    const response = await fetch(API, { credentials: 'include' })
    if (!response.ok) throw new Error('경로 감시 정보를 불러오지 못했습니다.')
    const data = await response.json()
    setRoutes(data.routes ?? [])
    setWatches(data.watches ?? [])
    setRouteId((previous) => previous && data.routes.some((route) => route.id === previous)
      ? previous : data.routes[0]?.id ?? null)
  }
  useEffect(() => {
    if (!user) return
    refresh().catch((error) => setMessage(error.message))
  }, [user])

  const route = routes.find((item) => item.id === routeId)
  const watch = watches.find((item) => item.routeId === routeId)
  useEffect(() => {
    if (!user || !routeId) return undefined
    let cancelled = false
    fetch(`/api/me/alert-tests/latest?routeId=${routeId}`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : { test: null })
      .then((data) => { if (!cancelled) setLastTest(data.test) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user, routeId])
  async function start() {
    if (!route) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`${API}/${route.id}`, { method: 'PUT', credentials: 'include' })
      if (!response.ok) throw new Error('경로선과 출발·도착 시각을 확인하세요. 지난 비행은 감시할 수 없습니다.')
      await refresh()
      setMessage('이 경로의 SIGMET 감시를 시작했습니다.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  async function pause() {
    if (!watch) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`${API}/${watch.id}`, { method: 'PATCH', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) })
      if (!response.ok) throw new Error('감시를 일시정지하지 못했습니다.')
      await refresh()
      setMessage('SIGMET 감시를 일시정지했습니다. 발생 이력은 유지됩니다.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!watch) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`${API}/${watch.id}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) throw new Error('경로 감시를 삭제하지 못했습니다.')
      await refresh()
      setMessage('경로 감시를 삭제했습니다. 발생 이력은 유지됩니다.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  async function runTest() {
    if (!watch?.enabled) return
    setBusy(true); setMessage('')
    try {
      let endpoint
      if (pushEnabled) endpoint = (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint
      const response = await fetch('/api/me/alert-tests', { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ routeWatchId: watch.id, scenario: 'sigmet', ...(endpoint ? { endpoint } : {}) }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error === 'device_not_subscribed' ? '이 기기의 푸시 구독이 만료됐습니다. 다시 켜 주세요.' : 'SIGMET 시험을 실행하지 못했습니다.')
      setLastTest(data.test)
      if (window.innerWidth > 719) window.dispatchEvent(new CustomEvent('airport-alert-preview', { detail: {
        id: `test:${data.test.id}`, testId: data.test.id, source: 'route', test: true,
        routeName: watch.routeName, type: 'sigmet', payload: data.test.payload, detectedAt: data.test.createdAt,
      } }))
      setMessage(data.test.pushStatus === 'sent' ? '이 기기로 SIGMET 시험 푸시를 보냈습니다. 수신과 탭 이동을 확인하세요.'
        : '모의 SIGMET이 발동했습니다. 휴대폰 푸시를 확인하려면 이 기기에서 푸시 수신을 켜 주세요.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <section className="aa-route-settings" aria-label="경로 SIGMET 알림 설정">
    <div className="aa-route-heading"><div><h2>감시 경로</h2><p>저장된 경로선과 비행 시각에 실제로 겹치는 SIGMET만 알립니다.</p></div><BellRing size={19} /></div>
    {message && <p className="aa-message" role="status">{message}</p>}
    {!routes.length ? <p>경로선과 ETD·ETA가 포함된 저장 경로가 없습니다. 경로 생성 패널에서 먼저 저장하세요.</p> : <>
      <label>감시할 경로 <select aria-label="SIGMET 감시 경로" value={routeId ?? ''} disabled={busy} onChange={(event) => { setRouteId(Number(event.target.value)); setLastTest(null); setMessage('') }}>
        {routes.map((item) => <option key={item.id} value={item.id}>{item.name} · {time(item.snapshot.etd, tz)} {tz}</option>)}
      </select></label>
      {route && <div className="aa-route-facts"><span>출발 {time(route.snapshot.etd, tz)} {tz}</span><span>도착 {time(route.snapshot.eta, tz)} {tz}</span><span>계획 고도 {route.snapshot.cruiseAltitudeFt ? `${route.snapshot.cruiseAltitudeFt}ft` : '미설정'}</span></div>}
      <div className="aa-route-actions"><span className={watch?.enabled ? 'aa-status is-on' : 'aa-status'}>{watch?.enabled ? 'SIGMET 감시 중' : watch ? '일시정지' : '미설정'}</span>
        <button type="button" disabled={busy} onClick={start}>{watch?.enabled ? '현재 저장 경로로 감시 업데이트' : '이 경로 감시 시작'}</button>
        {watch?.enabled && <button type="button" disabled={busy} onClick={pause}>일시정지</button>}
        {watch && <button type="button" disabled={busy} className="aa-delete" onClick={remove}><Trash2 size={16} /> 삭제</button>}
      </div>
      {watch?.enabled && <div className="aa-test-alert"><div><strong>경로 SIGMET 실제 수신 테스트</strong><span>모의 SIGMET을 경로 교차 판정기에 넣고 본인 기기로만 발송합니다.</span></div>
        {!pushEnabled && <button type="button" disabled={busy} onClick={async () => {
          const result = await togglePush(true)
          setMessage(result.ok ? '이 기기의 푸시 수신을 켰습니다.' : '푸시를 켜지 못했습니다. 브라우저 권한을 확인하세요.')
        }}>이 기기 푸시 켜기</button>}
        <button type="button" disabled={busy} onClick={runTest}><BellRing size={16} /> SIGMET 테스트 알림 보내기</button>
        {lastTest && <a href={`/?alertTest=${encodeURIComponent(lastTest.id)}`}>마지막 시험 내용 보기</a>}
      </div>}
    </>}
  </section>
}
