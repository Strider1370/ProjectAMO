// #13 재브리핑 스케줄러 — 활성 예정비행을 주기적으로 재계산 → diff 엔진(diff.js)으로 변경 감지 → triggered_alerts 적재.
// 판정은 기존 브리핑 모듈 재사용(composeBriefing/taf-window/enroute-model). 여기 신규는 "스냅샷 추출 + diff 배선 + 적재"만.
//
// 테스트 대상(순수/DB): buildBriefingRequest, buildSnapshot, evaluateFlight.
// I/O 배선(store·DATA_ROOT·composeBriefing): recompute / startAlertScheduler — 유닛 테스트 제외(실 스토어 필요).
import crypto from 'node:crypto'

import store from '../store.js'
import { storage } from '../config.js'
import { getDb } from '../db/index.js'
import { pickActiveFlight } from '../me/alerts.js'
import { composeBriefing } from '../briefing/briefing-composer.js'
import { tafConditionsAt } from './taf-conditions.js'
import { detectChanges } from './diff.js'
import { dispatchFlightAlerts } from './sender.js'
import { isDemoMode, getEffectiveNow } from '../dev/demo-mode.js'

const DEFAULT_CRUISE_ALT_FT = 9000
const TICK_MS = 15 * 60 * 1000 // 15분(§5B: 5~15분 갱신 규모). 무거운 KIM/KTG는 소스 주기 캐시에 의존.

// 인메모리 prev 스냅샷 캐시(§5B: 수백 KB, 인메모리로 충분).
// ponytail: 재시작 생존이 필요하면 routes에 last_snapshot_json 컬럼 추가. 데모/단일 프로세스엔 불필요.
const snapshotCache = new Map() // routeId → 최소 스냅샷

const safeJson = (s) => { try { return JSON.parse(s) } catch { return null } }
const hashOf = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16)

// 저장 route 행(payload + 알림 컬럼) → /api/route-briefing 요청 body. 경로 기하 없으면 null(스킵).
// 감시 기준은 절차 포함 최종선(routeGeometry). 방어적으로 스켈레톤(enrouteGeometry)도 폴백 —
// 절차 유무는 날씨 판정 불변(스펙 §7)이라 폴백해도 알림 결과 동일. (경로/브리핑 통일 플랜 Phase 0.2)
export function buildBriefingRequest(route) {
  const p = safeJson(route.payload) ?? {}
  const geometry = p.routeGeometry ?? p.enrouteGeometry
  if (!geometry?.coordinates?.length) return null
  // routeForm은 실제 저장 payload에서 base 아래에 있다(routeStore.normalizeRouteSnapshot).
  // 최상위 폴백은 구형/합성 payload용으로 남긴다.
  const form = p.base?.routeForm ?? p.routeForm ?? {}
  return {
    flightRule: form.flightRule ?? route.rules ?? 'IFR',
    departureAirport: form.departureAirport ?? route.dep,
    arrivalAirport: form.arrivalAirport ?? route.dest,
    alternateAirport: p.alternateAirport ?? route.altn ?? null,
    routeGeometry: geometry,
    etd: route.etd,
    eta: route.eta,
    plannedCruiseAltitudeFt: Number(p.cruiseAltitudeFt) || DEFAULT_CRUISE_ALT_FT,
  }
}

// composeBriefing 결과 + TAF payload(icao별) + 요청 → diff가 먹는 최소 스냅샷.
// 공항별 조건만 들고, 경로 위험은 SIGMET만 담는다(AIRMET은 폰까지 가지 않는다).
// userMinima는 evaluateFlight가 users 테이블에서 읽어 넘긴다 — 판정선이 조종사마다 다르다.
export function buildSnapshot(briefing, tafByIcao, request, userMinima = null) {
  const taf = (icao) => (icao ? tafByIcao?.[icao] ?? null : null)
  const at = [
    { icao: request.departureAirport, role: 'dep', iso: request.etd },
    { icao: request.arrivalAirport, role: 'dest', iso: request.eta },
    { icao: request.alternateAirport, role: 'altn', iso: request.eta },
  ].filter((entry) => entry.icao)

  const airports = at.map(({ icao, role, iso }) => ({
    icao, role, ...tafConditionsAt(taf(icao), iso, icao, userMinima),
  }))

  // 경로에 실제로 걸치는 SIGMET만(공항경보 제외). hazard-section이 고도·시간 겹침을 이미 적용했다.
  const sigmets = (briefing?.sections?.adverse?.hazards ?? [])
    .filter((h) => h.source === 'SIGMET' && h.encounter === 'on' && !h.airportScope)
    .map((h) => ({ key: `${h.source}:${h.code}:${h.validFrom}`, label: h.label ?? h.code }))

  return { airports, sigmets }
}

function userMinima(db, userId) {
  const u = db.prepare('SELECT min_ceiling_ft, min_visibility_m FROM users WHERE id=?').get(userId)
  if (!u) return null
  return { ceilingFt: u.min_ceiling_ft ?? null, visibilityM: u.min_visibility_m ?? null }
}

// 이미 발화된 동일 조건(route+dedupKey)이면 재발송 안 함(§5-2 dedup fingerprint).
function alreadyFired(db, routeId, dedupKey) {
  return !!db.prepare('SELECT 1 FROM triggered_alerts WHERE route_id=? AND dedup_key=? LIMIT 1').get(routeId, dedupKey)
}

function insertAlert(db, route, c, nowIso) {
  return db.prepare(`
    INSERT INTO triggered_alerts (user_id, route_id, type, severity, target, from_val, to_val, source_id, dedup_key, detected_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(route.user_id, route.id, c.type, c.severity, c.target ?? null,
    c.from == null ? null : String(c.from), c.to == null ? null : String(c.to),
    c.sourceId ?? null, c.dedupKey, nowIso).lastInsertRowid
}

// 활성 비행 1건 평가: 재계산 스냅샷 vs prev diff → triggered_alerts 적재, 스냅샷 갱신.
// briefing/tafByIcao는 recompute가 생산(테스트는 fixture 주입). prev 없으면 baseline(무발화).
export function evaluateFlight({ db, route, briefing, tafByIcao, now = Date.now(), cache = snapshotCache }) {
  const request = buildBriefingRequest(route)
  if (!request) return { skipped: 'no_geometry' }
  const curr = buildSnapshot(briefing, tafByIcao, request)
  const prev = cache.get(route.id) ?? null
  const nowIso = new Date(now).toISOString()

  const inserted = []
  if (prev) {
    const changes = detectChanges(prev, curr, { minima: userMinima(db, route.user_id) })
    for (const c of changes) {
      if (alreadyFired(db, route.id, c.dedupKey)) continue
      const id = insertAlert(db, route, c, nowIso)
      inserted.push({ ...c, id, to_val: c.to == null ? null : String(c.to) })
    }
  }

  cache.set(route.id, curr)
  db.prepare('UPDATE routes SET last_briefing_snapshot_id=?, updated_at=? WHERE id=?').run(hashOf(curr), nowIso, route.id)
  return { baseline: !prev, changes: inserted, snapshot: curr }
}

// ── I/O 배선(유닛 테스트 제외) ────────────────────────────────────────────

function mergeAirports(a, b) {
  return { ...(a?.airports || {}), ...(b?.airports || {}) }
}

// 활성 감시 대상: alert_enabled 비행을 사용자별로 묶어 pickActiveFlight(사용자당 1건, §11.2).
export function activeFlights(db, now = Date.now()) {
  const rows = db.prepare('SELECT * FROM routes WHERE alert_enabled=1').all()
  const byUser = new Map()
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id).push(r)
  }
  const out = []
  for (const list of byUser.values()) {
    const active = pickActiveFlight(list.map((r) => ({ id: r.id, etd: r.etd, alertStartMinBeforeEtd: r.alert_start_min_before_etd })), now)
    if (active) out.push(list.find((r) => r.id === active.id))
  }
  return out
}

// ETD+유예(expires_at) 지난 예정비행 정리(§11.1 자동삭제).
// 행 단위로 지운다 — 이미 알림이 발송된 경로는 triggered_alerts.route_id(NOT NULL FK)가
// 참조 중이라 삭제가 막힌다(알림센터가 route LEFT JOIN이라 이력은 원래 route 삭제 후에도
// 남는 게 맞다: me/alerts.js 참조). 한 벌크 DELETE로 하면 그 행 하나 때문에 문 전체가 롤백돼
// 이 함수를 감싸지 않는 호출부(runTick)까지 예외가 올라가 이후 알림 평가 자체가 안 돈다.
export function cleanupExpired(db, now = Date.now()) {
  const nowIso = new Date(now).toISOString()
  const expired = db.prepare('SELECT id FROM routes WHERE alert_enabled=1 AND expires_at IS NOT NULL AND expires_at < ?').all(nowIso)
  for (const { id } of expired) {
    try {
      db.prepare('DELETE FROM routes WHERE id=?').run(id)
    } catch (err) {
      console.warn(`[alert-scheduler] cleanup skipped route ${id} (referenced by alert history):`, err.message)
    }
  }
}

// 저장 route 재브리핑 — store 캐시 + 경로단면(KIM/KTG best-effort) → { briefing, tafByIcao }.
// export: 개발용 강제 발화(dev/fire-alert.js)가 주입된 store로 재계산할 때 재사용.
export function recompute(route) {
  const request = buildBriefingRequest(route)
  if (!request) return null
  const data = {
    metar: store.getCached('metar'), metarOverseas: store.getCached('metar_overseas'),
    taf: store.getCached('taf'), tafOverseas: store.getCached('taf_overseas'),
    sigmet: store.getCached('sigmet'), sigmetOverseas: store.getCached('sigmet_overseas'),
    airmet: store.getCached('airmet'), warning: store.getCached('warning'),
    amos: store.getCached('amos'), takeoff_fcst: store.getCached('takeoff_fcst'), notam: store.getCached('notam'),
    dataRoot: storage.active_path, // 사용자와 같은 활성 실황/시연 뷰에서 단면을 읽는다.
    now: getEffectiveNow().getTime(), // 시연 모드면 스냅샷 기준시각으로 고정(실제 현재시각 아님)
  }
  const briefing = composeBriefing(request, data)
  const tafByIcao = mergeAirports(data.taf, data.tafOverseas)
  return { briefing, tafByIcao }
}

// export: 개발용 즉시 발화(dev/scenario.js /tick)가 15분 대기 없이 1회 평가할 때 재사용. { evaluated, fired } 반환.
export async function runTick(db, now = Date.now()) {
  cleanupExpired(db, now)
  let evaluated = 0
  let fired = 0
  let skipped = 0
  for (const route of activeFlights(db, now)) {
    try {
      const res = recompute(route)
      // 저장 payload에 경로 기하가 없으면 브리핑을 재구성할 수 없다. 조용히 넘기지 않는다 —
      // 이 침묵 때문에 저장 경로가 한 건도 평가되지 않는 상태를 오래 알아채지 못했다.
      if (!res) {
        skipped++
        console.warn(`[alert-scheduler] route ${route.id} 건너뜀 — 저장 payload에 경로 기하 없음`)
        continue
      }
      evaluated++
      const { changes } = evaluateFlight({ db, route, briefing: res.briefing, tafByIcao: res.tafByIcao, now })
      // §5B group_wait: 이 비행의 이번 변화들을 텔레그램 1건으로 묶어 발송(인앱은 이미 행 저장).
      if (changes?.length) { await dispatchFlightAlerts(db, changes, route, { now }); fired += changes.length }
    } catch (err) {
      console.error(`[alert-scheduler] route ${route.id} 평가 실패:`, err.message)
    }
  }
  if (skipped) console.warn(`[alert-scheduler] ${skipped}개 경로를 기하 없음으로 건너뜀`)
  return { evaluated, fired, skipped }
}

// 등록 직후 baseline 1회(diff 기준 확보). 이후 인터벌.
// 시연 모드: cron(runWithLock)과 달리 이건 독립 setInterval이라 그 가드를 안 거친다 — 얼려둔 데이터가
// "그대로"여야 하는데 15분마다 재평가해서 엉뚱한 변화 알림이 뜨거나 에러가 나는 걸 막기 위해 직접 skip.
export function startAlertScheduler(db = getDb(), { intervalMs = TICK_MS } = {}) {
  const tick = () => {
    if (isDemoMode()) return
    return runTick(db).catch((err) => console.error('[alert-scheduler] tick 실패:', err.message))
  }
  tick()
  return setInterval(tick, intervalMs)
}

export default { buildBriefingRequest, buildSnapshot, evaluateFlight, activeFlights, cleanupExpired, startAlertScheduler }
