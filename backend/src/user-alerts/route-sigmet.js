import * as turf from '@turf/turf'

import store from '../store.js'
import { createDb, getDb } from '../db/index.js'
import { isDemoMode } from '../dev/demo-mode.js'
import { buildRouteAxis } from '../briefing/route-axis.js'
import { routeRunsInGeometry, timeWindowsOverlap } from '../briefing/geo-time-match.js'
import { bandToFt, plannedAltitudeRangeFt } from '../briefing/planned-altitude.js'
import { queueUserAlertDeliveries, dispatchPendingUserAlerts } from './delivery.js'

const parse = (value, fallback = null) => { try { return JSON.parse(value) ?? fallback } catch { return fallback } }
const SIGMET_MAX_SOURCE_AGE_MS = 20 * 60_000
const freshSource = (source, nowMs) => {
  const fetchedMs = Date.parse(source?.fetched_at)
  return Array.isArray(source?.items) && Number.isFinite(fetchedMs)
    && fetchedMs <= nowMs + 60_000 && nowMs - fetchedMs <= SIGMET_MAX_SOURCE_AGE_MS
}

export function routeAlertSnapshot(row) {
  const saved = parse(row.payload, {})
  const geometry = saved.routeGeometry ?? saved.enrouteGeometry
  const etd = row.etd ?? saved.etd
  const eta = row.eta ?? saved.eta
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)
    || geometry.coordinates.length < 2 || !Number.isFinite(Date.parse(etd))
    || !Number.isFinite(Date.parse(eta)) || Date.parse(eta) <= Date.parse(etd)) return null
  try { buildRouteAxis(geometry, 2000) } catch { return null }
  return { routeGeometry: geometry, etd, eta,
    cruiseAltitudeFt: Number(saved.cruiseAltitudeFt) > 0 ? Number(saved.cruiseAltitudeFt) : null,
    routeName: row.name || '저장 경로' }
}

function validSigmet(item, snapshot, axis, nowMs) {
  if (item?.cancelled || item?.report_status === 'CANCELLATION'
    || !Number.isFinite(Date.parse(item?.valid_from)) || !Number.isFinite(Date.parse(item?.valid_to))
    || Date.parse(item.valid_to) <= nowMs
    || !timeWindowsOverlap(snapshot.etd, snapshot.eta, item.valid_from, item.valid_to)) return null
  try {
    if (!item.geometry || turf.booleanDisjoint(turf.feature(snapshot.routeGeometry), turf.feature(item.geometry))) return null
  } catch { return null }
  const runs = routeRunsInGeometry(axis, item.geometry)
  const band = bandToFt(item.altitude)
  const etdMs = Date.parse(snapshot.etd), etaMs = Date.parse(snapshot.eta)
  const matchingRuns = runs.map((run) => {
    const fromMs = etdMs + (run.startNm / axis.totalDistanceNm) * (etaMs - etdMs)
    const toMs = etdMs + (run.endNm / axis.totalDistanceNm) * (etaMs - etdMs)
    const planned = snapshot.cruiseAltitudeFt
      ? plannedAltitudeRangeFt(run.startNm, run.endNm, axis.totalDistanceNm, snapshot.cruiseAltitudeFt) : null
    return { ...run, fromMs, toMs, planned }
  }).filter((run) => timeWindowsOverlap(new Date(run.fromMs).toISOString(), new Date(run.toMs).toISOString(), item.valid_from, item.valid_to)
    && (!band || !run.planned || (run.planned.maxFt >= band.lowFt && run.planned.minFt <= band.highFt)))
  // 도형은 정확히 교차하지만 간격 샘플에 들어오지 않은 아주 좁은 구간은
  // 통과 시각·고도를 확정할 수 없으므로 보수적으로 알리고 불확실성을 표시한다.
  if (runs.length && !matchingRuns.length) return null
  const firstRun = matchingRuns[0], lastRun = matchingRuns.at(-1)
  const planned = firstRun?.planned && lastRun?.planned
    ? { minFt: Math.min(...matchingRuns.map((run) => run.planned.minFt)),
      maxFt: Math.max(...matchingRuns.map((run) => run.planned.maxFt)) } : null
  return {
    phenomenon: item.phenomenon_label || item.phenomenon_code || 'SIGMET',
    phenomenonCode: item.phenomenon_code ?? null,
    validFrom: item.valid_from, validTo: item.valid_to,
    intersectFromNm: firstRun?.startNm ?? null, intersectToNm: lastRun?.endNm ?? null,
    encounterFrom: firstRun ? new Date(firstRun.fromMs).toISOString() : null,
    encounterTo: lastRun ? new Date(lastRun.toMs).toISOString() : null,
    altitudeBandFt: band, plannedAltitudeFt: planned,
    altitudeStatus: band && planned ? 'matched' : 'unknown',
    sourceId: item.id ?? item.sequence_number ?? null,
  }
}

export function evaluateRouteSigmetWatch(db, watch, data, nowMs = Date.now()) {
  const snapshot = parse(watch.route_snapshot)
  const domesticFresh = freshSource(data.sigmet, nowMs)
  const overseasFresh = freshSource(data.sigmetOverseas, nowMs)
  if (!snapshot) return []
  const nowIso = new Date(nowMs).toISOString()
  for (const event of db.prepare('SELECT id,payload FROM route_sigmet_events WHERE watch_id=? AND active=1').all(watch.id)) {
    const validToMs = Date.parse(parse(event.payload, {}).validTo)
    if (Number.isFinite(validToMs) && validToMs <= nowMs) {
      db.prepare('UPDATE route_sigmet_events SET active=0,resolved_at=? WHERE id=?').run(nowIso, event.id)
    }
  }
  if (Date.parse(snapshot.eta) <= nowMs) {
    db.prepare('UPDATE route_sigmet_events SET active=0,resolved_at=? WHERE watch_id=? AND active=1').run(nowIso, watch.id)
    return []
  }
  if (!domesticFresh && !overseasFresh) return []
  const axis = buildRouteAxis(snapshot.routeGeometry, 2000)
  const found = new Set()
  const created = []
  for (const item of [...(domesticFresh ? data.sigmet.items : []), ...(overseasFresh ? data.sigmetOverseas.items : [])]) {
    const detail = validSigmet(item, snapshot, axis, nowMs)
    if (!detail) continue
    const sourceKey = `${item.id ?? item.sequence_number ?? item.phenomenon_code}:${item.valid_from}:${item.valid_to}:${watch.updated_at}`
    if (found.has(sourceKey)) continue
    found.add(sourceKey)
    const payload = { title: `${watch.route_name} · 경로 SIGMET`, routeName: watch.route_name,
      routeId: watch.route_id, ...detail }
    const result = db.prepare(`INSERT OR IGNORE INTO route_sigmet_events
      (watch_id,user_id,route_id,source_key,payload,detected_at) VALUES (?,?,?,?,?,?)`)
      .run(watch.id, watch.user_id, watch.route_id, sourceKey, JSON.stringify(payload), nowIso)
    if (result.changes) {
      if (!watch.suppressDelivery) queueUserAlertDeliveries(db, { source: 'route', eventId: result.lastInsertRowid,
        userId: watch.user_id, nowIso })
      created.push({ id: result.lastInsertRowid, userId: watch.user_id, payload })
    }
  }
  // 출처 중 하나가 실패한 주기에는 기존 유효 현상을 정상 해소로 오인하지 않는다.
  if (domesticFresh && overseasFresh) {
    const active = db.prepare('SELECT id,source_key FROM route_sigmet_events WHERE watch_id=? AND active=1').all(watch.id)
    for (const row of active) if (!found.has(row.source_key)) {
      db.prepare('UPDATE route_sigmet_events SET active=0,resolved_at=? WHERE id=?').run(nowIso, row.id)
    }
  }
  db.prepare('UPDATE route_sigmet_watches SET last_evaluated_at=? WHERE id=?').run(nowIso, watch.id)
  return created
}

export function currentSigmetWeather() {
  return { sigmet: store.getCached('sigmet'), sigmetOverseas: store.getCached('sigmet_overseas') }
}

export function evaluateRouteTest(watch, nowMs = Date.now()) {
  const snapshot = parse(watch.route_snapshot)
  if (!snapshot) return { error: 'invalid_route' }
  const coords = snapshot.routeGeometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return { error: 'invalid_route' }
  const axis = buildRouteAxis(snapshot.routeGeometry, 2000)
  const middle = axis.samples[Math.floor(axis.samples.length / 2)]
  const lon = middle.lon, lat = middle.lat, d = 0.12
  const duration = Math.max(60 * 60_000, Math.min(6 * 60 * 60_000, Date.parse(snapshot.eta) - Date.parse(snapshot.etd)))
  const simulated = { ...snapshot, etd: new Date(nowMs + 5 * 60_000).toISOString(),
    eta: new Date(nowMs + duration + 5 * 60_000).toISOString() }
  const item = {
    id: `TEST-SIGMET-${nowMs}`, phenomenon_code: 'EMBD_TS', phenomenon_label: '뇌우 SIGMET',
    valid_from: new Date(nowMs - 5 * 60_000).toISOString(),
    valid_to: new Date(nowMs + duration + 30 * 60_000).toISOString(),
    altitude: { lower_fl: 0, upper_fl: 600 },
    geometry: { type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d],
      [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] },
  }
  const temporary = createDb(':memory:')
  try {
    temporary.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
      .run(1, 'route-alert-test', 'unused', new Date(nowMs).toISOString())
    const id = temporary.prepare(`INSERT INTO route_sigmet_watches
      (user_id,route_id,route_name,route_snapshot,updated_at) VALUES (?,?,?,?,?)`)
      .run(1, watch.route_id, watch.route_name, JSON.stringify(simulated), new Date(nowMs).toISOString()).lastInsertRowid
    const testWatch = temporary.prepare('SELECT * FROM route_sigmet_watches WHERE id=?').get(id)
    const events = temporary.transaction(() => evaluateRouteSigmetWatch(temporary, testWatch,
      { sigmet: { fetched_at: new Date(nowMs).toISOString(), items: [item] },
        sigmetOverseas: { fetched_at: new Date(nowMs).toISOString(), items: [] } }, nowMs))()
    return events[0] ? { kind: 'sigmet', payload: events[0].payload } : { error: 'condition_not_met' }
  } finally { temporary.close() }
}

export async function runRouteSigmetTick(db = getDb(), { data = currentSigmetWeather(), nowMs = Date.now(), sendPushImpl, deliver = true, queue = true, userId = null } = {}) {
  let created = 0
  const watches = userId == null
    ? db.prepare('SELECT * FROM route_sigmet_watches WHERE enabled=1 AND deleted_at IS NULL').all()
    : db.prepare('SELECT * FROM route_sigmet_watches WHERE enabled=1 AND deleted_at IS NULL AND user_id=?').all(userId)
  for (const watch of watches) {
    try {
      const events = db.transaction(() => evaluateRouteSigmetWatch(db, { ...watch, suppressDelivery: !queue }, data, nowMs))()
      created += events.length
    } catch (error) { console.error(`[route-sigmet] ${watch.id} evaluation failed:`, error?.message) }
  }
  if (deliver) await dispatchPendingUserAlerts(db, { sendPushImpl, nowMs })
  return { created }
}

export function startRouteSigmetScheduler(db = getDb(), { intervalMs = 60_000 } = {}) {
  let running = false
  const tick = async () => {
    if (running || isDemoMode()) return
    running = true
    try { await runRouteSigmetTick(db) } finally { running = false }
  }
  void tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return timer
}
