// D) 시간표를 비행 구간(ETD~ETA)에 대해 묻는다.
// shared/notam-schedule.js는 한 시점만 답하므로 구간을 훑는 얇은 껍데기다. 문법 해석은 그쪽 소관.
// ponytail: 5분 간격 표본이라 그보다 짧은 발효 창은 놓친다. 현재 자료의 D)는 모두 시간 단위
// 덩어리라 문제되지 않는다. 더 정밀해져야 하면 notam-schedule.js에 구간 질의를 추가한다.
import { isScheduleActiveAt } from '../../../shared/notam-schedule.js'

const STEP_MS = 5 * 60 * 1000

export function scheduleStateOverWindow({ scheduleText, validFrom, validTo, etd, eta }) {
  if (!scheduleText) return 'active' // D)가 없으면 유효기간 내내 발효
  const from = Date.parse(etd), to = Date.parse(eta)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 'unknown'

  let sawUnknown = false
  for (let t = from; t <= to; t += STEP_MS) {
    const hit = isScheduleActiveAt(scheduleText, validFrom, validTo, t)
    if (hit === true) return 'active'
    if (hit === null) sawUnknown = true
  }
  // 마지막 순간은 반드시 본다(구간 길이가 5분의 배수가 아닐 때 끝점이 빠진다)
  const last = isScheduleActiveAt(scheduleText, validFrom, validTo, to)
  if (last === true) return 'active'
  if (last === null) sawUnknown = true

  return sawUnknown ? 'unknown' : 'outside'
}

export default { scheduleStateOverWindow }
