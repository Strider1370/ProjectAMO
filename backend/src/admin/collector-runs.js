// 수집 실행 기록과 하루 수집 시간표. 관리자 콘솔 "자료 수집" 화면이 수집 × 24시간 표로 그린다.
//
// stats.js의 시간별 칸(성공·실패 횟수)과 최근 50건 공용 목록으로는 "몇 시 몇 분 실행이 왜 실패했는지"를
// 수집마다 보여 줄 수 없다. 통계 파일은 수집이 끝날 때마다 통째로 다시 쓰므로 거기에 더 넣지 않고,
// 실행 한 번을 SQLite 한 줄로 남긴다(하루 약 6천 줄, 3일 보관).
import { activeCollectorRegistry } from '../collector-registry.js'

const RETAIN_MS = 3 * 86_400_000
const PRUNE_EVERY_MS = 3_600_000
const KST_OFFSET_MS = 9 * 3_600_000
const DAY_MS = 86_400_000
// 계산 자식 프로세스에서 도는 수집(satellite/worker-runner.js, processors/kim-derived-worker.js)
const CHILD_PROCESS_TYPES = new Set(['satellite', 'satellite_visible', 'kim_gktg', 'kim_tropopause'])
const OUTCOMES = new Set(['succeeded', 'failed', 'skipped'])

let lastPruneMs = 0

export function recordCollectorRun(db, { type, startedAt, finishedAt, outcome, durationMs = null, reason = null }, nowMs = Date.now()) {
  if (!type || !OUTCOMES.has(outcome) || !startedAt || !finishedAt) return
  db.prepare('INSERT INTO collector_runs (type, started_at, finished_at, outcome, duration_ms, reason) VALUES (?, ?, ?, ?, ?, ?)')
    .run(type, startedAt, finishedAt, outcome, Number.isFinite(durationMs) ? Math.round(durationMs) : null, reason ? String(reason).slice(0, 300) : null)
  if (nowMs - lastPruneMs >= PRUNE_EVERY_MS) {
    lastPruneMs = nowMs
    db.prepare('DELETE FROM collector_runs WHERE started_at < ?').run(new Date(nowMs - RETAIN_MS).toISOString())
  }
}

// ── cron 한 칸 맞추기 (분 시 일 월 요일, '*' '*/n' 'a-b' 'a-b/n' 목록) ─────────────────────
function fieldMatches(field, value, min) {
  return field.split(',').some((part) => {
    const [range, stepText] = part.split('/')
    const step = stepText ? Number(stepText) : 1
    let lo, hi
    if (range === '*') { lo = min; hi = Infinity } else if (range.includes('-')) { [lo, hi] = range.split('-').map(Number) } else { lo = Number(range); hi = stepText ? Infinity : lo }
    return value >= lo && value <= hi && (value - lo) % step === 0
  })
}

function partsIn(ms, timezone) {
  // 수집 일정은 UTC 또는 KST뿐이다(collector-registry.js).
  const d = new Date(ms + (timezone === 'Asia/Seoul' ? KST_OFFSET_MS : 0))
  return { minute: d.getUTCMinutes(), hour: d.getUTCHours(), day: d.getUTCDate(), month: d.getUTCMonth() + 1, weekday: d.getUTCDay() }
}

export function scheduledMinutes(expression, timezone, dayStartMs) {
  const [minute, hour, day, month, weekday] = expression.trim().split(/\s+/)
  const out = []
  for (let m = 0; m < 1440; m += 1) {
    const p = partsIn(dayStartMs + m * 60_000, timezone)
    if (fieldMatches(minute, p.minute, 0) && fieldMatches(hour, p.hour, 0) && fieldMatches(day, p.day, 1)
      && fieldMatches(month, p.month, 1) && fieldMatches(weekday, p.weekday, 0)) out.push(m)
  }
  return out
}

function cadenceLabel(minutes) {
  if (minutes.length >= 24 && minutes[1] - minutes[0] < 60) return `${minutes[1] - minutes[0]}분마다`
  if (minutes.length >= 20 && minutes.every((m, i) => i === 0 || m - minutes[i - 1] === 60)) return `매시 ${minutes[0] % 60}분`
  return `하루 ${minutes.length}번`
}

// KST 기준 하루(dayOffset 0 = 오늘, 1 = 어제)의 일정과 실제 실행.
export function readCollectionTimeline(db, { dayOffset = 0, nowMs = Date.now(), config = {} } = {}) {
  const offset = dayOffset === 1 ? 1 : 0
  const dayStartMs = Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS - offset * DAY_MS
  const dayEndMs = dayStartMs + DAY_MS
  const rows = db.prepare('SELECT type, started_at, finished_at, outcome, duration_ms, reason FROM collector_runs WHERE started_at >= ? AND started_at < ? ORDER BY started_at')
    .all(new Date(dayStartMs).toISOString(), new Date(dayEndMs).toISOString())
  const runsByType = new Map()
  for (const row of rows) {
    const list = runsByType.get(row.type) || []
    list.push({ at: (Date.parse(row.started_at) - dayStartMs) / 60_000, durationMs: row.duration_ms, outcome: row.outcome, reason: row.reason })
    runsByType.set(row.type, list)
  }
  const collectors = {}
  for (const collector of activeCollectorRegistry(config)) {
    const minutes = scheduledMinutes(collector.schedule.expression, collector.schedule.timezone, dayStartMs)
    collectors[collector.type] = {
      cadence: cadenceLabel(minutes),
      timezone: collector.schedule.timezone === 'Asia/Seoul' ? 'KST' : 'UTC',
      childProcess: CHILD_PROCESS_TYPES.has(collector.type),
      scheduled: minutes,
      runs: runsByType.get(collector.type) || [],
    }
  }
  const oldest = db.prepare('SELECT MIN(started_at) AS at FROM collector_runs').get()?.at || null
  return {
    generatedAt: new Date(nowMs).toISOString(),
    dayOffset: offset,
    dayStart: new Date(dayStartMs).toISOString(),
    nowMinute: offset === 0 ? (nowMs - dayStartMs) / 60_000 : null,
    recordsSince: oldest,
    collectors,
  }
}

export default { recordCollectorRun, readCollectionTimeline, scheduledMinutes }
