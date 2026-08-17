import { BellRing, CheckCheck } from 'lucide-react'
import {
  Popover, PopoverTrigger, PopoverSurface, CounterBadge, makeStyles, tokens,
} from '@fluentui/react-components'
import { useState } from 'react'

import { useAuth } from '../auth/AuthContext.jsx'
import useNotifications from './useNotifications.js'
import { formatNotification, severityLevel, severityTag, relTime } from './notificationFormat.js'

const LEVEL_VAR = { red: 'var(--level-red)', amber: 'var(--level-amber)', gray: 'var(--level-gray)' }

const useStyles = makeStyles({
  badge: { position: 'absolute', top: '-4px', right: '-4px' },
  surface: { padding: 0, width: '340px', maxWidth: '92vw', maxHeight: '60vh', display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-s) var(--space-m)', borderBottom: '1px solid var(--stroke-2)',
    fontSize: 'var(--fs-300)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-1)',
  },
  readAll: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', border: 'none', background: 'none',
    cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--fs-200)', padding: 'var(--space-xxs) var(--space-xs)',
    borderRadius: 'var(--radius-md)', ':hover': { background: 'var(--bg-3)' },
  },
  list: { overflowY: 'auto', flex: 1 },
  empty: { padding: 'var(--space-xxl) var(--space-m)', textAlign: 'center', color: 'var(--text-3)', fontSize: 'var(--fs-200)' },
  item: {
    display: 'flex', gap: 'var(--space-s)', padding: 'var(--space-s) var(--space-m)', width: '100%',
    border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer',
    borderBottom: '1px solid var(--stroke-2)', ':hover': { background: 'var(--bg-3)' },
  },
  bar: { flex: '0 0 3px', borderRadius: 'var(--radius-sm)', alignSelf: 'stretch' },
  body: { flex: 1, minWidth: 0 },
  topline: { display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xxs)' },
  route: { fontSize: 'var(--fs-200)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  time: { marginLeft: 'auto', flex: '0 0 auto', fontSize: 'var(--fs-100)', color: 'var(--text-3)' },
  msg: { fontSize: 'var(--fs-200)', color: 'var(--text-2)', lineHeight: 'var(--lh-200)' },
  sevTag: { flex: '0 0 auto', fontSize: 'var(--fs-100)', fontWeight: 'var(--fw-semibold)', padding: '0 var(--space-xxs)', borderRadius: 'var(--radius-sm)' },
  unreadDot: { flex: '0 0 6px', width: '6px', height: '6px', borderRadius: 'var(--radius-circular)', background: 'var(--accent)', alignSelf: 'center' },
})

function NotificationItem({ n, onOpen }) {
  const s = useStyles()
  const level = severityLevel(n.severity)
  return (
    <button type="button" className={s.item} onClick={() => onOpen(n)}>
      <span className={s.bar} style={{ background: LEVEL_VAR[level] }} aria-hidden="true" />
      <span className={s.body}>
        <span className={s.topline}>
          <span className={s.sevTag} style={{ color: LEVEL_VAR[level], background: `var(--level-${level}-bg)` }}>{severityTag(n.severity)}</span>
          <span className={s.route}>{n.routeName || '비행'}</span>
          <span className={s.time}>{relTime(n.detectedAt)}</span>
        </span>
        <span className={s.msg}>{formatNotification(n)}</span>
      </span>
      {!n.readAt && <span className={s.unreadDot} aria-label="안 읽음" />}
    </button>
  )
}

// #13 인앱 알림센터 — 사이드바 벨(안읽음 배지) + Popover 패널. 로그인 사용자만 렌더.
export default function NotificationCenter({ isExpanded = false }) {
  const s = useStyles()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { notifications, unreadCount, refresh, markRead, markAllRead } = useNotifications()

  if (!user) return null

  function handleOpen(n) {
    markRead(n.id)
    setOpen(false)
    if (n.routeId != null) window.location.assign(`/?flight=${n.routeId}`) // 딥링크 → 그 비행의 브리핑으로 직행(App.jsx)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(_, d) => { setOpen(d.open); if (d.open) refresh() }}
      positioning="after-top"
      withArrow
    >
      <PopoverTrigger disableButtonEnhancement>
        <button
          type="button"
          className={`sidebar-icon-button ${isExpanded ? 'is-expanded' : ''}`}
          aria-label={`알림${unreadCount ? ` · 안 읽음 ${unreadCount}` : ''}`}
          title="알림"
        >
          <div className="sidebar-icon-wrapper">
            <BellRing size={20} strokeWidth={2} />
            {unreadCount > 0 && <CounterBadge className={s.badge} count={unreadCount} size="small" color="danger" />}
          </div>
          {isExpanded && <span className="sidebar-label">알림</span>}
          {isExpanded && unreadCount > 0 && <span className="sidebar-badge-count">{unreadCount}</span>}
        </button>
      </PopoverTrigger>

      <PopoverSurface className={s.surface} aria-label="알림센터">
        <div className={s.header}>
          <span>알림{unreadCount ? ` (${unreadCount})` : ''}</span>
          {unreadCount > 0 && (
            <button type="button" className={s.readAll} onClick={markAllRead}>
              <CheckCheck size={14} /> 모두 읽음
            </button>
          )}
        </div>
        <div className={s.list}>
          {notifications.length === 0
            ? <div className={s.empty}>새 알림이 없습니다</div>
            : notifications.map((n) => <NotificationItem key={n.id} n={n} onOpen={handleOpen} />)}
        </div>
      </PopoverSurface>
    </Popover>
  )
}
