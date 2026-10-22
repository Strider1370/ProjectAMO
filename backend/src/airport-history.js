// 공항 METAR·TAF 과거 보기(지도형 브리핑 7단계): 보관 스냅샷(전체 공항 묶음)에서 한 공항 것만 골라
// 같은 보고는 하나로 합치고 최신순으로 준다. METAR = 최근 3시간(SPECI 포함), TAF = 현재 + 직전 2개 발표(AMD 포함).
// 보관은 저장 시각 기준(config.storage.max_age_hours_by_type) — 여기서는 파일 이름의 저장 시각으로 일찍 멈춘다.
import fs from 'node:fs'
import path from 'node:path'

export const METAR_HISTORY_MS = 3 * 3600_000
export const TAF_HISTORY_ISSUES = 3 // 현재 + 직전 2개

const TYPES = { metar: ['metar', 'metar_overseas'], taf: ['taf', 'taf_overseas'] }

function savedAtMs(name) {
  const match = /_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z\.json$/.exec(name)
  return match ? Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6], +match[7]) : null
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } // 깨진 파일은 건너뛴다
}

// 최신(latest.json) → 보관 파일 최신순. 저장 시각을 함께 준다(latest는 무한대 취급).
function* snapshots(root, type) {
  const dir = path.join(root, type)
  if (!fs.existsSync(dir)) return
  const latest = readJson(path.join(dir, 'latest.json'))
  if (latest) yield { savedAt: Infinity, data: latest }
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'latest.json').sort().reverse()
  for (const name of names) {
    const data = readJson(path.join(dir, name))
    if (data) yield { savedAt: savedAtMs(name) ?? -Infinity, data }
  }
}

function metarHistory(root, icao, nowMs) {
  const since = nowMs - METAR_HISTORY_MS
  const byKey = new Map()
  for (const type of TYPES.metar) {
    for (const { savedAt, data } of snapshots(root, type)) {
      if (savedAt < since) break // 이 파일 안 관측은 모두 저장 시각 이전 → 범위 밖
      const report = data?.airports?.[icao]
      const time = report?.header?.observation_time
      const ms = Date.parse(time)
      if (!Number.isFinite(ms) || ms < since || ms > nowMs) continue
      const key = `${time}|${report.header.report_type ?? 'METAR'}`
      if (!byKey.has(key)) byKey.set(key, { key, time, kind: report.header.report_type ?? 'METAR', report })
    }
  }
  return [...byKey.values()].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
}

function tafHistory(root, icao, nowMs) {
  const byKey = new Map()
  const add = (report) => {
    const header = report?.header
    const issued = header?.issued
    if (!issued || Date.parse(issued) > nowMs) return
    const key = `${issued}|${header.report_status ?? 'NORMAL'}`
    if (!byKey.has(key)) byKey.set(key, { key, time: issued, kind: header.report_status === 'AMENDMENT' || header.report_type === 'TAF AMD' ? 'AMD' : 'TAF', report })
  }
  for (const type of TYPES.taf) {
    for (const { data } of snapshots(root, type)) {
      const report = data?.airports?.[icao]
      if (!report) continue
      const { previous, ...current } = report
      add(current)
      // 응답에 붙어 온 직전 발표(보관 파일이 모자랄 때를 메운다).
      if (previous?.header) add({ ...previous, header: { icao, ...previous.header } })
      if (byKey.size >= TAF_HISTORY_ISSUES) break
    }
  }
  return [...byKey.values()].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, TAF_HISTORY_ISSUES)
}

export function airportHistory({ root, icao, type, nowMs = Date.now() }) {
  if (!/^[A-Z0-9]{4}$/.test(icao ?? '')) throw Object.assign(new Error('invalid_icao'), { status: 400 })
  if (!TYPES[type]) throw Object.assign(new Error('invalid_type'), { status: 400 })
  const items = type === 'metar' ? metarHistory(root, icao, nowMs) : tafHistory(root, icao, nowMs)
  return { icao, type, range: type === 'metar' ? { hours: 3 } : { issues: TAF_HISTORY_ISSUES }, items }
}

// GET /api/airports/:icao/history?type=metar|taf — 지금 보는 자료(운영/시연 보기)의 위치와 "지금"을 따른다.
export function handleAirportHistory(req, res, { getContext, getNow }) {
  try {
    const context = getContext()
    const payload = airportHistory({ root: context.root, icao: String(req.params.icao ?? '').toUpperCase(), type: String(req.query.type ?? ''), nowMs: getNow().getTime() })
    res.set('Cache-Control', 'private, no-cache')
    return res.json(payload)
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message })
    return res.status(503).json({ error: 'history_unavailable' })
  }
}
