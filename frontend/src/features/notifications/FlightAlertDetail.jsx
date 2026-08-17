import { useEffect, useMemo, useRef } from 'react'
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Button, makeStyles,
} from '../../shared/ui/fluent.js'

import { useAuth } from '../auth/AuthContext.jsx'
import useNotifications from './useNotifications.js'
import { formatNotification, severityLevel, severityTag } from './notificationFormat.js'
import { formatZAndKst } from '../personal/lib/timeFormat.js'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'

const LEVEL_VAR = { red: 'var(--level-red)', amber: 'var(--level-amber)', gray: 'var(--level-gray)' }

const useStyles = makeStyles({
  surface: { width: '480px', maxWidth: '94vw' },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-s)', marginTop: 'var(--space-s)' },
  card: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-xxs)', padding: 'var(--space-s)',
    border: '1px solid var(--stroke-2)', borderRadius: 'var(--radius-md)',
  },
  topline: { display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' },
  sevTag: { flex: '0 0 auto', fontSize: 'var(--fs-100)', fontWeight: 'var(--fw-semibold)', padding: '0 var(--space-xxs)', borderRadius: 'var(--radius-sm)' },
  time: { marginLeft: 'auto', fontSize: 'var(--fs-100)', color: 'var(--text-3)' },
  msg: { fontSize: 'var(--fs-200)', color: 'var(--text-1)', lineHeight: 'var(--lh-200)' },
  empty: { padding: 'var(--space-l)', textAlign: 'center', color: 'var(--text-3)', fontSize: 'var(--fs-200)' },
  notice: { fontSize: 'var(--fs-100)', color: 'var(--text-3)', marginTop: 'var(--space-s)' },
  loginHint: { padding: 'var(--space-m) 0', color: 'var(--text-2)', fontSize: 'var(--fs-300)' },
})

// 현재 어디서도 렌더하지 않는다. 딥링크(?flight=)는 브리핑으로 직행하도록 바뀌었다(App.jsx).
// 3단계에서 변경점을 브리핑 상단 한 줄 띠로 옮길 때 이 표시 방식을 참고하고, 그때 지운다.
// 원래 용도: ?flight=<routeId> 탭 시 해당 비행의 변경점 에스컬레이션 화면.
export default function FlightAlertDetail({ flightId, onClose, onOpenRoute }) {
  useCloseOnBackButton(true, onClose)
  const s = useStyles()
  const { user } = useAuth()
  const { notifications, markRead } = useNotifications()
  const markedRef = useRef(new Set())

  const flightNotifications = useMemo(
    () => notifications.filter((n) => n.routeId === flightId),
    [notifications, flightId],
  )

  // 열람 시 읽음 처리(미읽음만, 1회).
  useEffect(() => {
    for (const n of flightNotifications) {
      if (!n.readAt && !markedRef.current.has(n.id)) {
        markedRef.current.add(n.id)
        markRead(n.id)
      }
    }
  }, [flightNotifications, markRead])

  const routeName = flightNotifications[0]?.routeName || `비행 #${flightId}`

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose() }}>
      <DialogSurface className={s.surface}>
        <DialogBody>
          <DialogTitle>{routeName}</DialogTitle>
          <DialogContent>
            {!user ? (
              <div className={s.loginHint}>이 비행 알림을 보려면 로그인하세요.</div>
            ) : flightNotifications.length === 0 ? (
              <div className={s.empty}>이 비행의 변경 알림이 없습니다.</div>
            ) : (
              <div className={s.list}>
                {flightNotifications.map((n) => {
                  const level = severityLevel(n.severity)
                  return (
                    <div key={n.id} className={s.card}>
                      <div className={s.topline}>
                        <span className={s.sevTag} style={{ color: LEVEL_VAR[level], background: `var(--level-${level}-bg)` }}>
                          {severityTag(n.severity)}
                        </span>
                        <span className={s.time}>{formatZAndKst(n.detectedAt)}</span>
                      </div>
                      <div className={s.msg}>{formatNotification(n)}</div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className={s.notice}>실제 운항 결정 전 공식 KMA 브리핑으로 재확인하세요.</div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>닫기</Button>
            {user && <Button appearance="primary" onClick={onOpenRoute}>전체 브리핑 보기</Button>}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
