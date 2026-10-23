// 개발/테스트 인스턴스 전용(§검증) — ENABLE_TEST_MUTATIONS=1로 명시 허용한 환경에서만 조작.
//  inject: store 캐시(메모리)에만 가상 악기상을 얹는다. 파일(latest.json)은 안 건드림 → 운영/원본 안전.
//          cron이 꺼져 있어 되덮이지 않고 유지됨. 지도·브리핑·알림이 그대로 반응.
//  reset : 파일에서 다시 읽어(loadLatest) 실황(고정 원본)으로 복구 + 발생 알림 삭제.
// server.js의 별도 gate가 non-production·명시 DATA_PATH를 확인하고, requireAuth가 인증을 강제한다.
import { Router } from 'express'

import { getDb } from '../db/index.js'
import { requireAuth } from '../auth/middleware.js'
import { runUserAlertTick } from '../user-alerts/service.js'
import { getCached, updateCache, canonicalHash, loadLatest } from '../store.js'
import { getStats } from '../stats.js'
import { getRequests, aggregateByPath, getCacheStats } from './instrument.js'
import config from '../config.js'
import path from 'node:path'

// store-stats 대상 타입(주요 데이터셋). getCached는 국내/해외/기타 캐시를 반환.
const STORE_TYPES = ['metar', 'metar_overseas', 'taf', 'taf_overseas', 'sigmet', 'sigmet_overseas', 'airmet', 'warning', 'amos', 'takeoff_fcst', 'notam', 'adsb']
function storeItemCount(data) {
  if (!data) return 0
  if (Array.isArray(data.items)) return data.items.length
  if (data.airports && typeof data.airports === 'object') return Object.keys(data.airports).length
  return null // 형태 불명 — 개수 미측정
}

const INJECT_TYPES = ['metar', 'taf', 'sigmet', 'notam'] // reset가 파일에서 다시 읽어 복구할 store 타입
const DEV_ROLES = ['pilot', 'forecaster', 'admin']
// 경로 SIGMET 프리셋 — 모두 hazard-section이 인식하는 phenomenon_code(iwxxm-advisory-parser).
const SIG_PHENOM = {
  ts: { code: 'EMBD_TS', label: 'Embedded Thunderstorm', upperFl: 400 },
  ice: { code: 'SEV_ICE', label: 'Severe Icing', upperFl: 240 },
}
const LIFR = { vis: 800, clouds: [{ amount: 'OVC', base: 100, raw: 'OVC001' }], wx: [{ raw: 'TSRA', intensity: 'HEAVY', descriptor: 'TS', phenomena: ['RA'], icon_key: 'TSRA' }] }
const IFR = { vis: 3000, clouds: [{ amount: 'OVC', base: 600, raw: 'OVC006' }], wx: null }
const visTok = (v) => String(Math.min(9999, Math.round(v))).padStart(4, '0')

function routeWeatherTarget(route) {
  let payload
  try { payload = JSON.parse(route.payload ?? '{}') } catch { return null }
  const routeGeometry = payload.routeGeometry ?? payload.enrouteGeometry
  if (!routeGeometry?.coordinates?.length) return null
  const form = payload.base?.routeForm ?? payload.routeForm ?? {}
  return { departureAirport: form.departureAirport ?? route.dep,
    arrivalAirport: form.arrivalAirport ?? route.dest, routeGeometry }
}

function overlayMetar(metar, icao, c) {
  const m = structuredClone(metar); const ap = m?.airports?.[icao]
  if (ap?.observation) {
    ap.observation.visibility = { value: c.vis, minimum_value: null, minimum_direction_degrees: null, cavok: false }
    ap.observation.clouds = c.clouds
    if (c.wx) ap.observation.weather = c.wx
    ap.observation.display = { ...(ap.observation.display ?? {}), visibility: visTok(c.vis), clouds: c.clouds.map((x) => x.raw).join(' '), ...(c.wx ? { weather: c.wx.map((w) => w.raw).join(' ') } : {}) }
    ap.cavok_flag = false
  }
  return m
}
function overlayTaf(taf, icao, c) {
  const t = structuredClone(taf); const ap = t?.airports?.[icao]
  if (ap) {
    ap.timeline = (ap.timeline ?? []).map((e) => ({
      ...e, visibility: { value: c.vis, cavok: false }, clouds: c.clouds, weather: c.wx ?? e.weather,
      display: { ...(e.display ?? {}), visibility: visTok(c.vis), clouds: c.clouds.map((x) => x.raw).join(' ') },
    }))
    if (ap.base) Object.assign(ap.base, { vis: c.vis, clouds: c.clouds, wx: c.wx ?? ap.base.wx, clouds_touched: true, wx_touched: !!c.wx, cavok_flag: false })
  }
  return t
}
// icao가 국내/해외 어느 store 타입에 있든 그 타입 캐시를 복제·수정해 updateCache(메모리).
function injectAirport(icao, c) {
  const metar = getCached('metar'); const metarO = getCached('metar_overseas')
  const taf = getCached('taf'); const tafO = getCached('taf_overseas')
  if (metar?.airports?.[icao]) { const m = overlayMetar(metar, icao, c); updateCache('metar', m, canonicalHash(m)) }
  if (metarO?.airports?.[icao]) { const m = overlayMetar(metarO, icao, c); updateCache('metar_overseas', m, canonicalHash(m)) }
  if (taf?.airports?.[icao]) { const t = overlayTaf(taf, icao, c); updateCache('taf', t, canonicalHash(t)) }
  if (tafO?.airports?.[icao]) { const t = overlayTaf(tafO, icao, c); updateCache('taf_overseas', t, canonicalHash(t)) }
}
function injectRouteSigmet(geometry, phenom = SIG_PHENOM.ts) {
  const coords = geometry?.coordinates
  if (!coords?.length) return
  const [lon, lat] = coords[Math.floor(coords.length / 2)]; const d = 1.2
  const box = [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]
  const now = Date.now()
  const sig = structuredClone(getCached('sigmet') ?? { type: 'sigmet', items: [] })
  sig.items = [...(sig.items ?? []), {
    id: `DEV-${phenom.code}-${now}`, sequence_number: 'D01', report_status: 'NORMAL', cancelled: false,
    phenomenon_code: phenom.code, phenomenon_label: phenom.label, time_indicator: 'FORECAST',
    valid_from: new Date(now - 3600e3).toISOString(), valid_to: new Date(now + 6 * 3600e3).toISOString(),
    fir: 'RKRR', altitude: { lower_fl: null, upper_fl: phenom.upperFl, lower_ref: null, upper_ref: 'STD' },
    motion: { direction_deg: 90, speed_kt: 15 }, geometry: { type: 'Polygon', coordinates: [box] },
  }]
  updateCache('sigmet', sig, canonicalHash(sig))
}

// 목적지(또는 경로) NOTAM 주입 — location=ICAO 스코프면 좌표 없이도 브리핑 NOTAM 섹션에 매칭(notam-briefing).
function injectNotam(icao, geometry) {
  const now = Date.now()
  const notam = structuredClone(getCached('notam') ?? { type: 'notam', items: [] })
  const coords = geometry?.coordinates
  const near = coords?.length ? coords[coords.length - 1] : null
  const box = near ? (() => { const [lon, lat] = near; const d = 0.3; return [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]] })() : null
  notam.items = [...(notam.items ?? []), {
    id: `DEV-NOTAM-${now}`, category: 'danger', scope: 'airport', location: icao,
    summary: `TEST DANGER AREA ACTIVE (${icao})`, rawText: `DEV INJECTED NOTAM — ${icao} danger area SFC-FL999`,
    valid_from: new Date(now - 3600e3).toISOString(), valid_to: new Date(now + 12 * 3600e3).toISOString(),
    altitude: { lower: 0, upper: 999, unit: 'FL', ref: null },
    geometry: box ? { type: 'Polygon', coordinates: [box] } : null,
  }]
  updateCache('notam', notam, canonicalHash(notam))
}
function clearUserAlerts(db, userId) {
  return db.transaction(() => {
    const airport = db.prepare('DELETE FROM airport_alert_events WHERE user_id=?').run(userId).changes
    const route = db.prepare('DELETE FROM route_sigmet_events WHERE user_id=?').run(userId).changes
    db.prepare('DELETE FROM user_alert_deliveries WHERE user_id=?').run(userId)
    db.prepare("UPDATE airport_alert_watches SET state='{}',last_evaluated_at=NULL WHERE user_id=?").run(userId)
    db.prepare("UPDATE route_sigmet_watches SET state='{}',last_evaluated_at=NULL WHERE user_id=?").run(userId)
    return airport + route
  })()
}

export function createDevRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireAuth)

  // 가상 자료 주입 후 새 사용자 알림 판정만 실행한다. 개발 도구에서 외부 푸시는 보내지 않는다.
  router.post('/inject', async (req, res) => {
    const db2 = database()
    const uid = req.session.userId
    const { routeId, scenario = { depLifr: true, routeTs: true } } = req.body ?? {}
    const route = db2.prepare('SELECT * FROM routes WHERE id = ? AND user_id = ?').get(Number(routeId), uid)
    if (!route) return res.status(404).json({ error: 'no_route', hint: '먼저 경로를 저장하세요.' })
    const request = routeWeatherTarget(route)
    if (!request) return res.status(400).json({ error: 'no_geometry', hint: '이 경로에 항로 좌표가 없습니다.' })

    if (scenario.depLifr) injectAirport(request.departureAirport, LIFR)
    if (scenario.destIfr) injectAirport(request.arrivalAirport, IFR) // 목적지 IFR → TAF ETA±1h로 교체공항 필요도 함께 발생
    if (scenario.routeTs) injectRouteSigmet(request.routeGeometry, SIG_PHENOM.ts)
    if (scenario.routeIce) injectRouteSigmet(request.routeGeometry, SIG_PHENOM.ice)
    if (scenario.destNotam) injectNotam(request.arrivalAirport, request.routeGeometry)

    const summary = await runUserAlertTick(db2, { deliver: false, queue: false, userId: uid })
    const firedCount = (summary.airport?.created ?? 0) + (summary.route?.created ?? 0)
    res.json({
      ok: true, routeId: route.id, dep: request.departureAirport, firedCount,
      note: '지도·브리핑 자료와 저장된 새 공항·경로 감시를 평가했습니다. 개발 도구에서는 외부 푸시를 보내지 않습니다.',
    })
  })

  // POST /api/dev/reset → 파일(고정 원본)에서 다시 읽어 store 복구 + 내 발생 알림 삭제.
  router.post('/reset', (req, res) => {
    const base = config.storage.base_path
    const restored = []
    for (const type of INJECT_TYPES) {
      const latest = loadLatest(path.join(base, type))
      if (latest) { updateCache(type, latest, canonicalHash(latest)); restored.push(type) }
    }
    const deletedAlerts = clearUserAlerts(database(), req.session.userId)
    res.json({ ok: true, restored, deletedAlerts, note: '실황(고정 원본) 복구 + 발생 알림 삭제.' })
  })

  // 시연용 스냅샷 저장/복원은 /api/admin/snapshot/*로 이전됨(배포 서버에서도 써야 해서 admin 라우터로 이동).

  // POST /api/dev/tick → 새 사용자 알림 판정 1회. 외부 푸시는 보내지 않는다.
  router.post('/tick', async (req, res) => {
    const summary = await runUserAlertTick(database(), { deliver: false, queue: false, userId: req.session.userId })
    res.json({ ok: true, ...summary, note: '새 공항·경로 감시를 한 번 평가했습니다. 외부 푸시는 보내지 않습니다.' })
  })

  // POST /api/dev/clear-alerts → 내 발생 알림만 삭제(store/실황은 유지, reset과 달리 데이터 복구 안 함).
  router.post('/clear-alerts', (req, res) => {
    const deleted = clearUserAlerts(database(), req.session.userId)
    res.json({ ok: true, deleted })
  })

  // GET /api/dev/vitals → 관찰 탭용 프로세스 상태(uptime·메모리). 테스트 모드 전용 마운트라 노출 안전.
  router.get('/vitals', (req, res) => {
    const m = process.memoryUsage()
    res.json({ uptimeSec: Math.round(process.uptime()), rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal })
  })

  // GET /api/dev/request-log?limit= → 최근 /api 요청 로그 + 경로별 지연·응답크기 집계(헛fetch·통짜 payload 감지).
  router.get('/request-log', (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 100)
    res.json({ recent: getRequests(limit), byPath: aggregateByPath() })
  })

  // GET /api/dev/processor-log?limit= → 수집기 최근 run(타입·시각·소요·성공여부) + 타입별 요약(성공/실패/스킵).
  // 테스트 모드(cron off)에선 stats/latest.json에서 로드된 마지막 실제 수집 결과가 고정 표시됨.
  router.get('/processor-log', (req, res) => {
    const limit = Math.min(50, Number(req.query.limit) || 30)
    const s = getStats()
    const summary = Object.entries(s.types ?? {}).map(([type, e]) => ({
      type, total: e.total_runs ?? 0, success: e.success ?? 0, failure: e.failure ?? 0, skips: e.skips ?? 0, lastRun: e.last_run ?? null,
    }))
    res.json({ recent: (s.recent_runs ?? []).slice(0, limit), summary })
  })

  // POST /api/dev/role { role } → 내 계정 role 임시 전환(테스트 모드 전용, 권한별 UI/API 검증용).
  // DB role + (예보관이면) airports 갱신 + req.session.role 즉시 반영 → requireRole이 바로 새 role로 판정.
  // 이 라우터 자체가 server.js의 test mutation gate를 통과할 때만 마운트된다.
  router.post('/role', (req, res) => {
    const { role } = req.body ?? {}
    if (!DEV_ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role', hint: `role은 ${DEV_ROLES.join('/')} 중 하나.` })
    const uid = req.session.userId
    const airports = role === 'forecaster' ? JSON.stringify(['RKSI']) : null // 예보관 큐가 최소 1개 담당공항 필요
    database().prepare('UPDATE users SET role=?, airports=? WHERE id=?').run(role, airports, uid)
    req.session.role = role // 세션에도 즉시 반영(로그아웃/재로그인 없이 적용). 프론트 AuthContext는 새로고침 시 /me로 갱신.
    res.json({ ok: true, role, note: 'DB+세션 반영됨. 프론트 권한 UI는 새로고침 후 갱신.' })
  })

  // GET /api/dev/store-stats → store(메모리 캐시) 타입별 아이템수·대략 바이트·해시 + snapshot-meta 캐시 hit/miss.
  router.get('/store-stats', (req, res) => {
    const types = STORE_TYPES.map((type) => {
      const data = getCached(type)
      const bytes = data ? Buffer.byteLength(JSON.stringify(data)) : 0
      return { type, present: !!data, items: storeItemCount(data), bytes }
    })
    res.json({ types, cache: getCacheStats() })
  })

  return router
}

export default createDevRouter
