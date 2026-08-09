import fs from 'fs'
import path from 'path'

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

const METAR_LIMIT_MIN = { RKSI: 40 }
const METAR_DEFAULT_LIMIT_MIN = 70

function makeTypeEntry() {
  return {
    total_runs: 0,
    success: 0,
    failure: 0,
    last_run: null,
    last_failure: null,
    last_error: null,
    error_counts: {},
    airport_failures: {},
    skips: 0,
  }
}

let statsData = {
  since: new Date().toISOString(),
  types: Object.fromEntries(TYPES.map((t) => [t, makeTypeEntry()])),
  recent_runs: [],
}

let statsFilePath = null

export function initFromFile(basePath) {
  const dir = path.join(basePath, 'stats')
  statsFilePath = path.join(dir, 'latest.json')

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (fs.existsSync(statsFilePath)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'))
      if (!loaded.types) loaded.types = {}
      for (const t of TYPES) {
        if (!loaded.types[t]) loaded.types[t] = makeTypeEntry()
        if (!loaded.types[t].error_counts) loaded.types[t].error_counts = {}
        if (!loaded.types[t].airport_failures) loaded.types[t].airport_failures = {}
        if (!loaded.types[t].airport_error_counts) loaded.types[t].airport_error_counts = {}
      }
      if (!loaded.types.metar.airport_ontime) loaded.types.metar.airport_ontime = {}
      if (!loaded.types.metar.airport_late) loaded.types.metar.airport_late = {}
      if (!Array.isArray(loaded.recent_runs)) loaded.recent_runs = []
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
export function recordSkip(type, reason = 'already_running') {
  const entry = statsData.types[type]
  if (!entry) return
  entry.skips = (entry.skips || 0) + 1
  addRecentRun(type, true, null, [], null, { skipped: true, reason })
  saveToFile()
}

export function recordSuccess(type, result, durationMs) {
  const entry = statsData.types[type]
  if (!entry) return

  entry.total_runs++
  entry.success++
  entry.last_run = new Date().toISOString()

  const failedAirports = Array.isArray(result?.failedAirports) ? result.failedAirports : []
  for (const icao of failedAirports) {
    entry.airport_failures[icao] = (entry.airport_failures[icao] || 0) + 1
  }

  if (result?.airportErrors && typeof result.airportErrors === 'object') {
    if (!entry.airport_error_counts) entry.airport_error_counts = {}
    for (const [icao, errMsg] of Object.entries(result.airportErrors)) {
      if (!entry.airport_error_counts[icao]) entry.airport_error_counts[icao] = {}
      const key = errMsg || 'Unknown error'
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
  saveToFile()
}

export function recordFailure(type, errorMsg, durationMs) {
  const entry = statsData.types[type]
  if (!entry) return

  const now = new Date().toISOString()
  entry.total_runs++
  entry.failure++
  entry.last_run = now
  entry.last_failure = now
  entry.last_error = errorMsg || 'Unknown error'

  const key = errorMsg || 'Unknown error'
  entry.error_counts[key] = (entry.error_counts[key] || 0) + 1

  addRecentRun(type, false, errorMsg, [], durationMs)
  saveToFile()
}

export function getStats() {
  return statsData
}

export default { initFromFile, recordSuccess, recordFailure, recordSkip, getStats }
