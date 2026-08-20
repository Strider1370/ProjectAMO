import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthContext.jsx'
import { listSavedRoutes } from '../route-briefing/lib/routeStore.js'
import { urlBase64ToUint8Array } from '../notifications/pushKey.js'

const MINIMA = '/api/me/minima'
const ALERTS = '/api/me/alerts'
const PUSH_SUB = '/api/me/push/subscribe'
const VAPID_KEY = '/api/me/push/vapid-public-key'

const ERROR_KO = {
  etd_must_be_future: 'ETD는 미래 시각이어야 합니다.',
  eta_after_etd: 'ETA는 ETD 이후여야 합니다.',
  too_many_routes: '저장된 경로가 너무 많습니다.',
  template_not_found: '선택한 브리핑을 찾을 수 없습니다.',
  too_many_briefings: '저장한 브리핑이 5개입니다. 계정에서 하나를 지우고 다시 시도하세요.',
  invalid_input: '입력값을 확인하세요.',
}

// #13 개인설정 패널 데이터 훅 — 미니마(탭A) + 경로 템플릿·예정 비행 알림(탭B). 로그인 사용자만.
export default function usePersonalSettings() {
  const { user } = useAuth()
  const [minima, setMinima] = useState(null)
  const [templates, setTemplates] = useState([])
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(false)

  const refreshMinima = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(MINIMA, { credentials: 'include' })
      if (res.ok) setMinima((await res.json()).minima)
    } catch { /* 오프라인/401 → 유지 */ }
  }, [user])

  // 감시 대상은 저장된 브리핑이다 — 순항고도가 확정돼 있어야 착빙·난류 판정이 맞는다.
  // 경로만으로는 고도를 몰라 스케줄러가 9000ft로 가정한다(scheduler.js DEFAULT_CRUISE_ALT_FT).
  const refreshTemplates = useCallback(async () => {
    if (!user) return
    try { setTemplates(await listSavedRoutes({ kind: 'briefing' })) }
    catch { /* best-effort */ }
  }, [user])

  const refreshFlights = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(ALERTS, { credentials: 'include' })
      if (res.ok) setFlights((await res.json()).flights || [])
    } catch { /* best-effort */ }
  }, [user])

  // Web Push 구독 — 브라우저 권한과 서버 등록이 둘 다 있어야 켜진 것이다.
  const [pushEnabled, setPushEnabled] = useState(false)
  const pushSupported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  const refreshPush = useCallback(async () => {
    if (!pushSupported) return
    try {
      const reg = await navigator.serviceWorker.ready
      setPushEnabled(Boolean(await reg.pushManager.getSubscription()))
    } catch { setPushEnabled(false) }
  }, [pushSupported])

  const togglePush = useCallback(async (on) => {
    const reg = await navigator.serviceWorker.ready
    if (!on) {
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch(PUSH_SUB, {
          method: 'DELETE', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setPushEnabled(false)
      return { ok: true }
    }
    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' }
    if ((await Notification.requestPermission()) !== 'granted') return { ok: false, reason: 'denied' }
    // VAPID 키가 서버에 없으면 구독 자체가 불가능하다 — 이유를 화면에 말한다.
    const res = await fetch(VAPID_KEY, { credentials: 'include' })
    if (!res.ok) return { ok: false, reason: 'not_configured' }
    const { key } = await res.json()
    // 문자열을 그대로 넘기면 브라우저가 TypeError를 던진다 — Push API는 BufferSource를 받는다.
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
    await fetch(PUSH_SUB, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    setPushEnabled(true)
    return { ok: true }
  }, [])

  useEffect(() => { refreshPush() }, [refreshPush])

  useEffect(() => {
    if (!user) { setMinima(null); setTemplates([]); setFlights([]); return }
    setLoading(true)
    Promise.all([refreshMinima(), refreshTemplates(), refreshFlights()]).finally(() => setLoading(false))
  }, [user, refreshMinima, refreshTemplates, refreshFlights])

  async function saveMinima(ceilingFt, visibilityM) {
    const res = await fetch(MINIMA, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ceilingFt, visibilityM }),
    })
    if (!res.ok) return { ok: false, error: '저장에 실패했습니다.' }
    setMinima({ ceilingFt, visibilityM })
    return { ok: true }
  }

  async function registerAlert(body) {
    try {
      const res = await fetch(ALERTS, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: ERROR_KO[data.error] || '등록에 실패했습니다.' }
      await refreshFlights()
      return { ok: true, id: data.id }
    } catch {
      return { ok: false, error: '네트워크 오류로 등록하지 못했습니다.' }
    }
  }

  async function deleteAlert(id) {
    setFlights((fs) => fs.filter((f) => f.id !== id))
    try { await fetch(`${ALERTS}/${id}`, { method: 'DELETE', credentials: 'include' }) } catch { /* best-effort */ }
    refreshFlights()
  }

  return {
    minima, templates, flights, loading,
    saveMinima, registerAlert, deleteAlert, refreshFlights,
    pushEnabled, pushSupported, togglePush,
  }
}
