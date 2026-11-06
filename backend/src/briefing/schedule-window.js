// Compare exact D) activity intervals with the flight window in UTC.
import { notamScheduleWindows } from '../../../shared/notam-schedule.js'

export function scheduleStateOverWindow({ scheduleText, validFrom, validTo, etd, eta }) {
  const from = Date.parse(etd), to = Date.parse(eta)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 'unknown'
  const windows = notamScheduleWindows(scheduleText, validFrom, validTo, from, to === from ? to + 1 : to)
  return windows === null ? 'unknown' : windows.length ? 'active' : 'outside'
}

export default { scheduleStateOverWindow }
