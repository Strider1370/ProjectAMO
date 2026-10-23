import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthContext.jsx'

const FEED = '/api/me/notifications'

// #13 알림센터 피드 훅 — 로그인 사용자만. 폴링(기본 60s) + 낙관적 읽음 처리.
export default function useNotifications({ pollMs = 60000 } = {}) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) { setNotifications([]); setUnreadCount(0); setInitialized(false); return }
    setLoading(true)
    try {
      const res = await fetch(FEED, { credentials: 'include' })
      if (res.ok) {
        const d = await res.json()
        setNotifications(d.notifications || [])
        setUnreadCount(d.unreadCount || 0)
        setInitialized(true)
      }
    } catch { /* 오프라인/401 → 유지 */ } finally { setLoading(false) }
  }, [user])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!user) return undefined
    const t = setInterval(refresh, pollMs)
    return () => clearInterval(t)
  }, [user, refresh, pollMs])
  useEffect(() => {
    if (!user) return undefined
    const onFocus = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [user, refresh])

  const markRead = useCallback(async (id) => {
    if (!notifications.some((n) => n.id === id && !n.readAt)) return
    setNotifications((ns) => ns.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    try { await fetch(`${FEED}/${id}/read`, { method: 'PATCH', credentials: 'include' }) } catch { /* best-effort */ }
  }, [notifications])

  const markAllRead = useCallback(async () => {
    setNotifications((ns) => ns.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })))
    setUnreadCount(0)
    try { await fetch(`${FEED}/read-all`, { method: 'POST', credentials: 'include' }) } catch { /* best-effort */ }
  }, [])

  return { notifications, unreadCount, loading, initialized, refresh, markRead, markAllRead }
}
