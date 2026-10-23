// 해외 기상(NOAA) 수집 — 국내(KMA) 파이프라인과 완전 분리.
// 별도 store 타입(metar_overseas/taf_overseas/sigmet_overseas)에 저장 → 국내 파일과 섞지 않음.
// 국내 processor는 손대지 않는다. 스케줄(cron)은 국내와 같은 주기를 index.js에서 별도 job으로 건다.
import path from 'path'
import config from '../config.js'
import apiClient from '../api-client.js'
import store from '../store.js'
import noaaMetarParser from '../parsers/noaa-metar-parser.js'
import noaaTafParser from '../parsers/noaa-taf-parser.js'
import noaaSigmetParser from '../parsers/noaa-sigmet-parser.js'

// METAR/TAF 공통: 해외 공항 벌크 1콜 → 파서 → { airports: { ICAO: parsed } } → 별도 store에 저장.
async function collectAirports(type, fetchFn, parser) {
  const ids = config.noaa?.overseas_airports || []
  const result = { type: type.toUpperCase(), fetched_at: new Date().toISOString(), airports: {} }
  const failedAirports = []
  const airportErrors = {}

  if (ids.length > 0) {
    try {
      const entries = await fetchFn(ids)
      const seen = new Set()
      for (const entry of entries) {
        const parsed = parser.parse(entry)
        if (parsed?.header?.icao) {
          if (parsed.header.source) parsed.header.source.fetch_time = result.fetched_at
          result.airports[parsed.header.icao] = parsed
          seen.add(parsed.header.icao)
        }
      }
      for (const icao of ids) {
        if (!seen.has(icao)) { failedAirports.push(icao); airportErrors[icao] = 'NOAA: no data' }
      }
    } catch (error) {
      for (const icao of ids) { failedAirports.push(icao); airportErrors[icao] = error.message || 'NOAA fetch failed' }
    }
  }

  // 실패 공항은 이전 스냅샷 유지(국내와 동일한 store 헬퍼 재사용).
  if (failedAirports.length > 0) store.mergeWithPrevious(result, type, failedAirports)

  const saveResult = store.save(type, result)
  return {
    type,
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: Object.keys(result.airports).length,
    failedAirports,
    airportErrors,
  }
}

export async function processMetar() {
  return collectAirports('metar_overseas', apiClient.fetchNoaaMetar, noaaMetarParser)
}

export async function processTaf() {
  return collectAirports('taf_overseas', apiClient.fetchNoaaTaf, noaaTafParser)
}

// SIGMET: 전세계 1콜 → asia_firs 필터 → 이전 스냅샷과 병합(만료 제거). 별도 store에 저장.
function mergeAdvisories(previous, incoming, nowMs) {
  const merged = new Map()
  for (const item of (previous || [])) {
    const endMs = new Date(item.valid_to).getTime()
    if (!Number.isFinite(endMs) || endMs <= nowMs) continue
    merged.set(item.id, item)
  }
  for (const item of (incoming || [])) {
    const endMs = new Date(item.valid_to).getTime()
    if (!Number.isFinite(endMs) || endMs <= nowMs) continue
    merged.set(item.id, item)
  }
  return Array.from(merged.values()).sort((a, b) =>
    new Date(a.valid_from).getTime() - new Date(b.valid_from).getTime())
}

export async function processSigmet() {
  const firs = config.noaa?.asia_firs || []
  const previous = store.loadLatest(path.join(config.storage.base_path, 'sigmet_overseas'))
  const nowMs = Date.now()

  let incoming = []
  let fetched = false
  try {
    const entries = await apiClient.fetchNoaaSigmet()
    incoming = noaaSigmetParser.parse(entries, firs)
    fetched = true
  } catch (error) {
    console.warn(`sigmet_overseas: NOAA fetch failed: ${error.message}`)
  }

  const items = mergeAdvisories(previous?.items, incoming, nowMs)
  const result = { type: 'sigmet_overseas', fetched_at: fetched ? new Date().toISOString() : previous?.fetched_at ?? null, items }
  const saveResult = store.save('sigmet_overseas', result)
  return {
    type: 'sigmet_overseas',
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    total: items.length,
    incoming: incoming.length,
  }
}

export default { processMetar, processTaf, processSigmet }
