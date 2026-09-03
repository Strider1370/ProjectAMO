import fs from 'fs'
import path from 'path'
import { COLLECTOR_REGISTRY } from './collector-registry.js'
import { API_OPERATION_REGISTRY } from './api-operation-registry.js'

// 여기 없는 type은 recordSuccess/Failure가 조용히 버린다(아래 `if (!entry) return`). 새 수집기는 반드시 등록할 것.
// ('radar'는 실제로 쓰는 키가 'radar_echo'라 여태 한 번도 안 채워졌다 — index.js의 runWithLock 호출과 이름을 맞춤.
//  echo_top·satellite·rainviewer·ground_forecast·environment·airport_info·takeoff_fcst·ktg·notam·typhoon도
//  같은 이유로 빠져 있었다: 등록 안 된 새 수집기 추가 때마다 이 목록을 안 늘려서 실패가 조용히 유실됐다.)
const TYPES = [
  'metar', 'taf', 'warning', 'kma_special_warning', 'sigmet', 'airmet', 'sigwx_low', 'lightning', 'radar_echo', 'wissdom', 'qpf', 'hsr', 'hci', 'echo_top',
  'satellite', 'rainviewer', 'amos', 'adsb', 'metar_overseas', 'taf_overseas', 'sigmet_overseas',
  'satellite_visible', 'ground_forecast', 'environment', 'airport_info', 'takeoff_fcst', 'ktg', 'notam', 'typhoon', 'kim_surface_wind', 'flight_category', 'asos_ceiling', 'terminal_flights', 'overseas_forecast',
]
const MAX_RECENT_RUNS = 50
const START_SAVE_INTERVAL_MS = 30_000
const EMPTY_EXECUTION = Object.freeze({
  last_started_at: null,
  last_scheduled_started_at: null,
  last_finished_at: null,
  last_outcome: null,
  last_issue: null,
  last_missed_at: null,
})
const COLLECTOR_TYPES = new Set(COLLECTOR_REGISTRY.map((collector) => collector.type))
const API_OPERATION_IDS = new Set(API_OPERATION_REGISTRY.map((operation) => operation.id))

const METAR_LIMIT_MIN = { RKSI: 40 }
const METAR_DEFAULT_LIMIT_MIN = 70

function makeTypeEntry() {
  return {
    total_runs: 0,
    success: 0,
    failure: 0,
    last_run: null,
    last_success: null,   // 마지막으로 성공한 수집 — 관리자 콘솔 신선도 판정의 기준
    last_failure: null,
    last_error: null,
    error_counts: {},
    airport_failures: {},
    skips: 0,
    execution: { ...EMPTY_EXECUTION },
  }
}

function makeStatsData() {
  return {
  since: new Date().toISOString(),
  types: Object.fromEntries(TYPES.map((t) => [t, makeTypeEntry()])),
  recent_runs: [],
  api_operations: {},
  }
}

let statsData = makeStatsData()

let statsFilePath = null
let persistence = { now: Date.now, setTimeout, write: () => saveToFile() }
let startSaveTimer = null
let lastStartSaveAt = null

export function initFromFile(basePath) {
  const dir = path.join(basePath, 'stats')
  statsFilePath = path.join(dir, 'latest.json')

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  statsData = makeStatsData()

  if (fs.existsSync(statsFilePath)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'))
      if (!loaded.types) loaded.types = {}
      for (const t of TYPES) {
        if (!loaded.types[t]) loaded.types[t] = makeTypeEntry()
        if (!loaded.types[t].error_counts) loaded.types[t].error_counts = {}
        if (!loaded.types[t].airport_failures) loaded.types[t].airport_failures = {}
        if (!loaded.types[t].airport_error_counts) loaded.types[t].airport_error_counts = {}
        if (loaded.types[t].last_success === undefined) loaded.types[t].last_success = null
        if (!loaded.types[t].execution) loaded.types[t].execution = { ...EMPTY_EXECUTION }
        else loaded.types[t].execution = { ...EMPTY_EXECUTION, ...loaded.types[t].execution }
      }
      if (!loaded.types.metar.airport_ontime) loaded.types.metar.airport_ontime = {}
      if (!loaded.types.metar.airport_late) loaded.types.metar.airport_late = {}
      if (!Array.isArray(loaded.recent_runs)) loaded.recent_runs = []
      if (!loaded.api_operations || typeof loaded.api_operations !== 'object' || Array.isArray(loaded.api_operations)) loaded.api_operations = {}
      statsData = loaded
    } catch (e) {
      console.warn('[STATS] Failed to load stats file, starting fresh:', e.message)
    }
  }
}

function saveToFile() {
  if (!statsFilePath) return
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2), 'utf8')
  } catch (e) {
    console.warn('[STATS] Failed to save stats file:', e.message)
  }
}

function nowIso() {
  return new Date(persistence.now()).toISOString()
}

function persistCompletion() {
  persistence.write()
}

function queueStartSave() {
  if (startSaveTimer) return
  const now = persistence.now()
  const delay = Math.max(0, START_SAVE_INTERVAL_MS - (now - (lastStartSaveAt ?? now)))
  const timer = persistence.setTimeout(() => {
    startSaveTimer = null
    lastStartSaveAt = persistence.now()
    persistence.write()
  }, delay)
  startSaveTimer = timer ?? true
  startSaveTimer?.unref?.()
}

export function __setPersistenceForTest({ now = Date.now, setTimeout: setTimer = setTimeout, write = () => saveToFile() } = {}) {
  persistence = { now, setTimeout: setTimer, write }
  startSaveTimer = null
  lastStartSaveAt = null
}

export function normalizeCollectorIssue({ outcome, code, message, at }) {
  const normalized = message == null ? null : String(message)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\?[^\s]*/g, '?[redacted]')
    .replace(/\b(?:authKey|serviceKey)\s*[=:]\s*[^\s&]+/gi, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
    .trim()
    .slice(0, 240)
  return { outcome, code, message: normalized, at }
}

function requireCollector(type) {
  if (!COLLECTOR_TYPES.has(type)) throw new Error(`unknown_collector_type:${type}`)
  return statsData.types[type]
}

function executionFor(type) {
  const entry = requireCollector(type)
  entry.execution = { ...EMPTY_EXECUTION, ...entry.execution }
  return entry.execution
}

function unresolvedScheduledMissed(execution, run) {
  return execution.last_outcome === 'missed' && run?.source !== 'scheduled'
}

export function recordStart(type, { source } = {}) {
  const execution = executionFor(type)
  const at = nowIso()
  const run = { source: source || 'scheduled', id: `${persistence.now()}-${Math.random().toString(36).slice(2)}` }
  execution.last_started_at = at
  if (run.source === 'scheduled') {
    execution.last_scheduled_started_at = at
    if (execution.last_outcome === 'missed') execution.last_outcome = null
  }
  queueStartSave()
  return run
}

function setExecutionCompletion(type, outcome, issue, run) {
  const execution = executionFor(type)
  if (unresolvedScheduledMissed(execution, run)) return false
  execution.last_finished_at = nowIso()
  execution.last_outcome = outcome
  if (issue) execution.last_issue = issue
  return true
}

export function getExecutionState(type) {
  if (!COLLECTOR_TYPES.has(type)) throw new Error(`unknown_collector_type:${type}`)
  return { ...EMPTY_EXECUTION, ...statsData.types[type]?.execution }
}

export function recordMissed(type, issue = {}) {
  const execution = executionFor(type)
  if (execution.last_outcome === 'missed') return
  const at = nowIso()
  execution.last_outcome = 'missed'
  execution.last_missed_at = at
  execution.last_issue = normalizeCollectorIssue({ outcome: 'missed', code: issue.code || 'start_overdue', message: issue.message ?? null, at })
  persistCompletion()
}

function apiOperationEntry(id) {
  if (!API_OPERATION_IDS.has(id)) throw new Error(`unknown_api_operation:${id}`)
  if (!statsData.api_operations[id]) statsData.api_operations[id] = { execution: { ...EMPTY_EXECUTION } }
  return statsData.api_operations[id]
}

export function recordApiOperationStart(id) {
  const execution = apiOperationEntry(id).execution
  execution.last_started_at = nowIso()
  persistCompletion()
}

function recordApiOperationCompletion(id, outcome, message) {
  const execution = apiOperationEntry(id).execution
  const at = nowIso()
  execution.last_finished_at = at
  execution.last_outcome = outcome
  if (outcome === 'failed') execution.last_issue = normalizeCollectorIssue({ outcome, code: 'api_operation_failed', message, at })
  persistCompletion()
}

export function recordApiOperationSuccess(id) { recordApiOperationCompletion(id, 'succeeded') }
export function recordApiOperationFailure(id, errorMsg) { recordApiOperationCompletion(id, 'failed', errorMsg) }

function addRecentRun(type, success, error, failedAirports, durationMs, extra = {}) {
  statsData.recent_runs.unshift({
    type,
    time: new Date().toISOString(),
    success,
    error: error || null,
    failed_airports: failedAirports || [],
    duration_ms: durationMs ?? null,
    ...extra,
  })
  if (statsData.recent_runs.length > MAX_RECENT_RUNS) {
    statsData.recent_runs = statsData.recent_runs.slice(0, MAX_RECENT_RUNS)
  }
}

// 락 스킵(직전 run이 아직 진행 중) 카운트 — 수집 주기가 처리시간보다 짧다는 신호.
export function recordSkip(type, reason = 'already_running', run) {
  const entry = statsData.types[type]
  if (!entry) return
  entry.skips = (entry.skips || 0) + 1
  addRecentRun(type, true, null, [], null, { skipped: true, reason })
  setExecutionCompletion(type, 'skipped', normalizeCollectorIssue({ outcome: 'skipped', code: reason, message: null, at: nowIso() }), run)
  persistCompletion()
}

export function recordSuccess(type, result, durationMs, run) {
  const entry = statsData.types[type]
  if (!entry) return

  entry.total_runs++
  entry.success++
  entry.last_run = nowIso()
  entry.last_success = entry.last_run

  const failedAirports = Array.isArray(result?.failedAirports) ? result.failedAirports : []
  for (const icao of failedAirports) {
    entry.airport_failures[icao] = (entry.airport_failures[icao] || 0) + 1
  }

  if (result?.airportErrors && typeof result.airportErrors === 'object') {
    if (!entry.airport_error_counts) entry.airport_error_counts = {}
    for (const [icao, errMsg] of Object.entries(result.airportErrors)) {
      if (!entry.airport_error_counts[icao]) entry.airport_error_counts[icao] = {}
      const key = normalizeCollectorIssue({ outcome: 'failed', code: 'airport_failed', message: errMsg || 'Unknown error', at: nowIso() }).message || 'Unknown error'
      entry.airport_error_counts[icao][key] = (entry.airport_error_counts[icao][key] || 0) + 1
    }
  }

  if (type === 'metar' && result?.airportObsTimes) {
    if (!entry.airport_ontime) entry.airport_ontime = {}
    if (!entry.airport_late) entry.airport_late = {}
    const now = Date.now()
    for (const [icao, info] of Object.entries(result.airportObsTimes)) {
      if (!info.observation_time) continue
      if (info.report_type === 'SPECI') continue
      const ageMin = Math.floor((now - new Date(info.observation_time).getTime()) / 60000)
      const limit = METAR_LIMIT_MIN[icao] ?? METAR_DEFAULT_LIMIT_MIN
      if (ageMin >= limit) {
        entry.airport_late[icao] = (entry.airport_late[icao] || 0) + 1
      } else {
        entry.airport_ontime[icao] = (entry.airport_ontime[icao] || 0) + 1
      }
    }
  }

  addRecentRun(type, true, null, failedAirports, durationMs)
  setExecutionCompletion(type, 'succeeded', null, run)
  persistCompletion()
}

export function recordFailure(type, errorMsg, durationMs, run) {
  const entry = statsData.types[type]
  if (!entry) return

  const now = nowIso()
  const issue = normalizeCollectorIssue({ outcome: 'failed', code: 'collector_failed', message: errorMsg, at: now })
  const safeError = issue.message || 'Unknown error'
  entry.total_runs++
  entry.failure++
  entry.last_run = now
  entry.last_failure = now
  entry.last_error = safeError

  const key = safeError
  entry.error_counts[key] = (entry.error_counts[key] || 0) + 1

  addRecentRun(type, false, safeError, [], durationMs)
  setExecutionCompletion(type, 'failed', issue, run)
  persistCompletion()
}

export function getStats() {
  return statsData
}

// 관리자 콘솔용 타입 요약. 성공률은 누적이다 — recent_runs는 34종이 함께 쓰는 50건짜리 공용
// 목록이라 24시간 같은 시간 창을 계산할 근거가 못 된다(그건 2단계에서 따로 쌓는다).
export function getTypeSummary(type) {
  const entry = statsData.types[type]
  const empty = { successRate: null, totalRuns: 0, skips: 0, avgMs: null, since: statsData.since, errorCounts: {}, lastError: null }
  if (!entry) return empty

  const durations = statsData.recent_runs
    .filter((r) => r.type === type && Number.isFinite(r.duration_ms))
    .map((r) => r.duration_ms)

  return {
    successRate: entry.total_runs > 0 ? entry.success / entry.total_runs : null,
    totalRuns: entry.total_runs,
    skips: entry.skips || 0,
    avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    since: statsData.since,
    errorCounts: entry.error_counts || {},
    lastError: entry.last_error ?? null,
  }
}

export default { initFromFile, recordStart, recordSuccess, recordFailure, recordSkip, recordMissed, getExecutionState, recordApiOperationStart, recordApiOperationSuccess, recordApiOperationFailure, getStats, getTypeSummary }
