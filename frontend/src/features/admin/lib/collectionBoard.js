// 자료 수집 시간표(수집 × 24시간) 계산. 화면 없이 시험할 수 있게 그리기와 분리한다.
// 시간표 응답(/api/admin/collection-timeline)의 분은 KST 하루 시작부터 센 값이다.

// 기록된 이유를 운영자가 읽는 말로 바꾼다. 모르는 이유는 원문을 그대로 보인다.
const REASON_TEXT = [
  [/^api_operation_timeout|응답 없음|timed out/i, '기상청 응답 없음'],
  [/^already_running$/, '이전 실행이 아직 진행 중'],
  [/^api_hub_key_blocked$/, '하루 사용량 초과로 건너뜀'],
  [/^nwp_complete_or_disabled$/, '이미 받은 회차라 건너뜀'],
  [/^collection_cancelled_for_data_transition$/, '자료 전환으로 취소'],
  [/^kim_(gktg|tropopause)_(base_waiting|incomplete)$/, 'KIM 입력 대기'],
  [/^api_hub_budget_blocked$/, '하루 사용량 초과'],
]
export function reasonText(reason) {
  if (!reason) return null
  for (const [pattern, text] of REASON_TEXT) if (pattern.test(reason)) return text
  return reason
}

// 이 시간 칸에 그릴 것. frequent(한 시간에 두 번 넘게 도는 수집)는 띠, 나머지는 점으로 그린다.
export function hourCell(entry, hour, nowMinute = null) {
  const from = hour * 60, to = from + 60
  const runs = (entry?.runs || []).filter((run) => run.at >= from && run.at < to)
  const scheduled = (entry?.scheduled || []).filter((minute) => minute >= from && minute < to)
  const frequent = (entry?.scheduled || []).length > 24
  const count = { succeeded: 0, failed: 0, skipped: 0 }
  for (const run of runs) count[run.outcome] = (count[run.outcome] || 0) + 1
  const pastScheduled = scheduled.filter((minute) => nowMinute == null || minute < nowMinute)
  const futureScheduled = scheduled.filter((minute) => nowMinute != null && minute >= nowMinute)
  let tone = null
  if (runs.length) {
    if (count.skipped === runs.length) tone = 'skip'
    else if (count.failed === 0) tone = 'ok'
    else if (count.succeeded === 0) tone = 'fail'
    else tone = 'part'
  } else if (pastScheduled.length) tone = 'none'
  else if (futureScheduled.length) tone = 'plan'
  // 점으로 그릴 때: 실제 실행은 결과 색으로, 실행이 없는 지난 예정은 '기록 없음', 앞으로의 예정은 빈 점.
  const dots = frequent ? [] : [
    ...runs.map((run) => ({ at: run.at, kind: run.outcome === 'succeeded' ? 'ok' : run.outcome === 'failed' ? 'fail' : 'skip' })),
    ...pastScheduled.filter((minute) => !runs.some((run) => Math.abs(run.at - minute) <= 10)).map((at) => ({ at, kind: 'none' })),
    ...futureScheduled.map((at) => ({ at, kind: 'plan' })),
  ]
  return { runs, scheduled, count, tone, frequent, dots, futureFrom: futureScheduled.length && runs.length ? nowMinute : null }
}

// 오늘·어제 실행 요약(상세 패널).
export function runSummary(entry) {
  const runs = entry?.runs || []
  const count = { succeeded: 0, failed: 0, skipped: 0 }
  for (const run of runs) count[run.outcome] = (count[run.outcome] || 0) + 1
  const durations = runs.filter((run) => run.outcome !== 'skipped' && Number.isFinite(run.durationMs)).map((run) => run.durationMs).sort((a, b) => a - b)
  return { total: runs.length, count, medianMs: durations.length ? durations[durations.length >> 1] : null, maxMs: durations.at(-1) ?? null }
}

export function nextScheduled(entry, nowMinute) {
  if (nowMinute == null) return null
  return (entry?.scheduled || []).find((minute) => minute > nowMinute) ?? null
}

export function minuteClock(minute) {
  const m = Math.floor(minute)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// 출처(API 키)별 묶음. 시간표 일정이 없는 행(수집기가 꺼진 자료 등)도 빼지 않고 빈 줄로 둔다.
export function boardGroups(health, { onlyProblems = false } = {}) {
  const groups = health?.groups?.source || []
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    rows: (health.rows || []).filter((row) => row.source === group.id)
      .filter((row) => !onlyProblems || (row.status !== 'ok' && row.status !== 'quiet')),
  })).filter((group) => group.rows.length)
}

// 앞으로 90분 안의 정시 수집(5~30분마다 도는 것은 뺀다).
export function upcomingRuns(health, timeline, limit = 4) {
  const now = timeline?.nowMinute
  if (now == null) return []
  const seen = new Set()
  const list = []
  for (const row of health?.rows || []) {
    const entry = timeline.collectors?.[row.statsKey]
    if (!entry || entry.scheduled.length > 48 || seen.has(row.statsKey)) continue
    seen.add(row.statsKey)
    for (const minute of entry.scheduled) if (minute > now && minute - now <= 90) list.push({ minute, label: row.label })
  }
  return list.sort((a, b) => a.minute - b.minute).slice(0, limit)
}

export default { reasonText, hourCell, runSummary, nextScheduled, minuteClock, boardGroups, upcomingRuns }
