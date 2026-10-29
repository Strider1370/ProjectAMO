import { BellRing } from 'lucide-react'
import { CounterBadge, makeStyles } from '@fluentui/react-components'
import { useAuth } from '../auth/AuthContext.jsx'
import useNotifications from './useNotifications.js'

const useStyles = makeStyles({ badge: { position: 'absolute', top: '-4px', right: '-4px' } })

// 모든 사용자 알림은 같은 작업 패널에서 확인한다.
export default function NotificationCenter({ isExpanded = false, onOpenAlerts }) {
  const s = useStyles()
  const { user } = useAuth()
  const { unreadCount } = useNotifications()
  if (!user) return null
  return <button type="button" className={`sidebar-icon-button ${isExpanded ? 'is-expanded' : ''}`}
    aria-label={`알림 · 진행 중 미확인 ${unreadCount}`} title={`진행 중 미확인 알림 ${unreadCount}건`}
    onClick={() => onOpenAlerts ? onOpenAlerts() : window.location.assign('/alerts')}>
    <span className="sidebar-icon-wrapper"><BellRing size={20} strokeWidth={2} />
      {unreadCount > 0 && <CounterBadge className={s.badge} count={unreadCount} size="small" color="danger" />}</span>
    {isExpanded && <span className="sidebar-label">알림</span>}
  </button>
}
