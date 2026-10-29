import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { getNotificationStore } from './notificationStore.js'

export default function useNotifications({ pollMs = 60000 } = {}) {
  const { user } = useAuth()
  const store = getNotificationStore(user?.id)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  useEffect(() => {
    if (!user) return undefined
    store.refresh()
    const timer = setInterval(store.refresh, pollMs)
    const onFocus = () => { if (document.visibilityState === 'visible') store.refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [user?.id, store, pollMs])

  return { ...state, refresh: store.refresh, markRead: store.markRead, markAllRead: store.markAllRead }
}
