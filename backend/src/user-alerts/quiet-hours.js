// 밤 시간 푸시 끄기. 계정마다 한 번 정하고 모든 공항·경로 감시에 같이 적용한다.
// 시각은 한국 시간(KST) 분 단위(0–1439)로 저장한다. 시작이 끝보다 크면 자정을 넘는 구간이다(23:00–06:00).
// 이 시간에 생긴 알림은 알림 목록에는 남기고 휴대폰 푸시만 보내지 않는다.
const KST_OFFSET_MIN = 9 * 60
export const DEFAULT_QUIET_HOURS = { enabled: false, start: 23 * 60, end: 6 * 60 }

export function kstMinuteOfDay(nowMs) {
  return Math.floor((nowMs / 60_000 + KST_OFFSET_MIN) % 1440)
}

export function inQuietHours({ enabled, start, end } = {}, nowMs = Date.now()) {
  if (!enabled || start === end) return false
  const minute = kstMinuteOfDay(nowMs)
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

export function readQuietHours(db, userId) {
  const row = db.prepare('SELECT quiet_push_enabled, quiet_push_start, quiet_push_end FROM users WHERE id=?').get(userId)
  if (!row) return { ...DEFAULT_QUIET_HOURS }
  return {
    enabled: row.quiet_push_enabled === 1,
    start: row.quiet_push_start ?? DEFAULT_QUIET_HOURS.start,
    end: row.quiet_push_end ?? DEFAULT_QUIET_HOURS.end,
  }
}

export function writeQuietHours(db, userId, { enabled, start, end }) {
  db.prepare('UPDATE users SET quiet_push_enabled=?, quiet_push_start=?, quiet_push_end=? WHERE id=?')
    .run(enabled ? 1 : 0, start, end, userId)
}
