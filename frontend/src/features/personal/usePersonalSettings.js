import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthContext.jsx'
import { urlBase64ToUint8Array } from '../notifications/pushKey.js'
import { PUSH_WANTED_KEY } from '../notifications/pushDevice.js'

const MINIMA = '/api/me/minima'
const PUSH_SUB = '/api/me/push/subscribe'
const VAPID_KEY = '/api/me/push/vapid-public-key'

const PUSH_WANTED = PUSH_WANTED_KEY
const SUBSCRIBE_ATTEMPTS = 3

export const PUSH_FAILURE_TEXT = {
  denied: '알림 권한이 꺼져 있습니다. 휴대폰 설정에서 이 앱의 알림을 허용해 주세요.',
  not_configured: '서버에 푸시 설정이 없어 켤 수 없습니다.',
  worker_not_ready: '앱이 아직 준비 중입니다. 잠시 후 다시 눌러 주세요.',
  subscribe_failed: '휴대폰 푸시 서비스에 등록하지 못했습니다. 잠시 후 다시 눌러 주세요.',
  registration_failed: '서버에 이 휴대폰을 등록하지 못했습니다. 잠시 후 다시 눌러 주세요.',
}

function pushWanted() {
  try { return localStorage.getItem(PUSH_WANTED) === '1' } catch { return false }
}
function setPushWanted(on) {
  try { if (on) localStorage.setItem(PUSH_WANTED, '1'); else localStorage.removeItem(PUSH_WANTED) } catch { /* 저장 불가 브라우저 */ }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 서비스 워커는 페이지 load 뒤에 등록되고, 첫 방문에는 활성화까지 몇 초 걸린다. 무한정 기다리지 않는다.
function workerReady(timeoutMs = 10000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    wait(timeoutMs).then(() => { throw new Error('worker_not_ready') }),
  ])
}

// 휴대폰 푸시 서비스 등록은 첫 시도에 가끔 실패한다(특히 처음 등록할 때). 잠깐 쉬었다가 다시 시도한다.
async function completeSubscription(reg) {
  // VAPID 키가 서버에 없으면 구독 자체가 불가능하다 — 이유를 화면에 말한다.
  const res = await fetch(VAPID_KEY, { credentials: 'include' })
  if (!res.ok) return { ok: false, reason: 'not_configured' }
  const { key } = await res.json()
  let sub = await reg.pushManager.getSubscription()
  const existing = Boolean(sub)
  for (let attempt = 1; !sub; attempt += 1) {
    try {
      // 문자열을 그대로 넘기면 브라우저가 TypeError를 던진다 — Push API는 BufferSource를 받는다.
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
    } catch {
      if (attempt >= SUBSCRIBE_ATTEMPTS) return { ok: false, reason: 'subscribe_failed' }
      await wait(1500 * attempt)
    }
  }
  const saved = await fetch(PUSH_SUB, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })
  if (!saved.ok) {
    if (!existing) await sub.unsubscribe()
    return { ok: false, reason: 'registration_failed' }
  }
  return { ok: true }
}

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
      const reg = await workerReady()
      let sub = await reg.pushManager.getSubscription()
      // 켜려고 했고 권한도 허용됐는데 등록이 안 끝난 경우(등록 실패, 휴대폰 설정에서 직접 허용 후 복귀)는 여기서 마저 등록한다.
      if (!sub && user && pushWanted() && Notification.permission === 'granted') {
        const result = await completeSubscription(reg)
        setPushEnabled(result.ok)
        return
      }
      if (!sub) { setPushEnabled(false); return }
      const response = await fetch(`${PUSH_SUB}?endpoint=${encodeURIComponent(sub.endpoint)}`, { credentials: 'include' })
      setPushEnabled(response.ok && Boolean((await response.json()).registered))
    } catch { setPushEnabled(false) }
  }, [pushSupported, user])

  // 오류를 던지지 않고 { ok, reason }으로 돌려준다 — 실패 이유를 화면이 말할 수 있게.
  const togglePush = useCallback(async (on) => {
    try {
      const reg = await workerReady()
      if (!on) {
        setPushWanted(false)
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
      setPushWanted(true)
      const result = await completeSubscription(reg)
      setPushEnabled(result.ok)
      return result
    } catch (error) {
      return { ok: false, reason: error?.message === 'worker_not_ready' ? 'worker_not_ready' : 'subscribe_failed' }
    }
  }, [])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshPush() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshPush])
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
