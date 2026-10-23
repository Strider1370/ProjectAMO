import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthContext.jsx'
import { urlBase64ToUint8Array } from '../notifications/pushKey.js'

const MINIMA = '/api/me/minima'
const PUSH_SUB = '/api/me/push/subscribe'
const VAPID_KEY = '/api/me/push/vapid-public-key'

// 개인 미니마와 현 기기의 Web Push 구독. 알림 watch는 통합 패널이 관리한다.
export default function usePersonalSettings() {
  const { user } = useAuth()
  const [minima, setMinima] = useState(null)

  const refreshMinima = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch(MINIMA, { credentials: 'include' })
      if (res.ok) setMinima((await res.json()).minima)
    } catch { /* 오프라인/401 → 유지 */ }
  }, [user])

  // Web Push 구독 — 브라우저 권한과 서버 등록이 둘 다 있어야 켜진 것이다.
  const [pushEnabled, setPushEnabled] = useState(false)
  const pushSupported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  const refreshPush = useCallback(async () => {
    if (!pushSupported) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setPushEnabled(false); return }
      const response = await fetch(`${PUSH_SUB}?endpoint=${encodeURIComponent(sub.endpoint)}`, { credentials: 'include' })
      setPushEnabled(response.ok && Boolean((await response.json()).registered))
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
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
    const saved = await fetch(PUSH_SUB, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    if (!saved.ok) {
      if (!existing) await sub.unsubscribe()
      return { ok: false, reason: 'registration_failed' }
    }
    setPushEnabled(true)
    return { ok: true }
  }, [])

  useEffect(() => { refreshPush() }, [refreshPush])

  useEffect(() => {
    if (!user) { setMinima(null); return }
    refreshMinima()
  }, [user, refreshMinima])

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

  return {
    minima, saveMinima,
    pushEnabled, pushSupported, togglePush,
  }
}
