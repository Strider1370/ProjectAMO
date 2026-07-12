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
import { summarizeEnrouteModel } from '../briefing/enroute-model.js'
import { loadRouteCrossSection } from '../briefing/enroute-cross-section.js'
import { metricsAt } from '../briefing/taf-window.js'
import { detectChanges } from './diff.js'
import { dispatchFlightAlerts } from './sender.js'

const RANK = { 약: 1, 중: 2, 심: 3 }
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
  const form = p.routeForm ?? {}
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

// TAF base/change_groups에서 ETD 시각에 유효한 TS 현상 여부(timeline엔 wx가 없어 base/그룹을 직접 스캔).
// ponytail: 지속그룹(base)+시간창 그룹만 봄. PROB 확률가중은 데모 범위 밖.
function departureTs(taf, etdIso) {
  if (!taf) return false
  const hasTs = (wx) => (wx ?? []).some((w) => /TS/.test(w?.raw || w || ''))
  if (hasTs(taf.base?.wx)) return true
  const etd = Date.parse(etdIso)
  for (const g of (taf.change_groups ?? [])) {
    const s = Date.parse(g.start)
    const e = Date.parse(g.end)
    if (Number.isFinite(s) && Number.isFinite(e) && etd >= s && etd < e && g.wx_touched && hasTs(g.wx)) return true
  }
  return false
}

function maxLevel(intervals) {
  let best = null
  for (const iv of (intervals ?? [])) if (!best || (RANK[iv.level] ?? 0) > (RANK[best] ?? 0)) best = iv.level
  return best
}
function enrouteLevels(model) {
  const out = { icing: null, turb: null }
  for (const el of (model?.elements ?? [])) {
    if (el.kind === 'icing') out.icing = maxLevel(el.intervals)
    else if (el.kind === 'turbulence') out.turb = maxLevel(el.intervals)
  }
  return out
}

function airportSnap(taf, iso) {
  const m = metricsAt(taf, iso) // null이면 TAF 없음 → 수치 null(below()가 false → 오탐 없음)
  return { ceilingFt: m?.ceilingFt ?? null, visibilityM: m?.visibilityM ?? null }
}

// composeBriefing 결과 + TAF payload(icao별) + 요청 → diff.js가 먹는 최소 스냅샷.
export function buildSnapshot(briefing, tafByIcao, request) {
  const t = (icao) => (icao ? tafByIcao?.[icao] ?? null : null)
  const dest = {
    icao: request.arrivalAirport,
    ...airportSnap(t(request.arrivalAirport), request.eta),
    alternateRequired: briefing?.sections?.destination?.alternateRequired ?? null,
  }
  const dep = {
    icao: request.departureAirport,
    ...airportSnap(t(request.departureAirport), request.etd),
    ts: departureTs(t(request.departureAirport), request.etd),
  }
  const altn = request.alternateAirport
    ? { icao: request.alternateAirport, ...airportSnap(t(request.alternateAirport), request.eta) }
    : null

  // 경로 위험(공항경보 제외, 경로 조우분만). hazard-section이 고도필터·시간겹침 이미 적용.
  const hazards = (briefing?.sections?.adverse?.hazards ?? [])
    .filter((h) => h.encounter === 'on' && !h.airportScope)
    .map((h) => ({
      key: `${h.source}:${h.code}:${h.validFrom}`,
      isSigmet: h.source === 'SIGMET',
      label: h.label ?? h.code,
    }))

  return { dep, dest, altn, hazards, enroute: enrouteLevels(briefing?.sections?.enroute?.model) }
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
export function cleanupExpired(db, now = Date.now()) {
  db.prepare('DELETE FROM routes WHERE alert_enabled=1 AND expires_at IS NOT NULL AND expires_at < ?').run(new Date(now).toISOString())
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
  }
  const briefing = composeBriefing(request, data)
  try {
    const model = loadRouteCrossSection({ root: storage.base_path, routeGeometry: request.routeGeometry, body: request })
    if (model.available && briefing.sections?.enroute) {
      briefing.sections.enroute.model = summarizeEnrouteModel({
        crossSection: model.crossSection, turbulence: model.turbulence,
        totalDistanceNm: model.totalDistanceNm, cruiseAltitudeFt: request.plannedCruiseAltitudeFt,
      })
    }
  } catch { /* 엔루트 모델 optional */ }
  const tafByIcao = mergeAirports(data.taf, data.tafOverseas)
  return { briefing, tafByIcao }
}

// export: 개발용 즉시 발화(dev/scenario.js /tick)가 15분 대기 없이 1회 평가할 때 재사용. { evaluated, fired } 반환.
export async function runTick(db, now = Date.now()) {
  cleanupExpired(db, now)
  let evaluated = 0
  let fired = 0
  for (const route of activeFlights(db, now)) {
    try {
      const res = recompute(route)
      if (!res) continue
      evaluated++
      const { changes } = evaluateFlight({ db, route, briefing: res.briefing, tafByIcao: res.tafByIcao, now })
      // §5B group_wait: 이 비행의 이번 변화들을 텔레그램 1건으로 묶어 발송(인앱은 이미 행 저장).
      if (changes?.length) { await dispatchFlightAlerts(db, changes, route, { now }); fired += changes.length }
    } catch (err) {
      console.error(`[alert-scheduler] route ${route.id} 평가 실패:`, err.message)
    }
  }
  return { evaluated, fired }
}

// 등록 직후 baseline 1회(diff 기준 확보). 이후 인터벌.
export function startAlertScheduler(db = getDb(), { intervalMs = TICK_MS } = {}) {
  const tick = () => runTick(db).catch((err) => console.error('[alert-scheduler] tick 실패:', err.message))
  tick()
  return setInterval(tick, intervalMs)
}

export default { buildBriefingRequest, buildSnapshot, evaluateFlight, activeFlights, cleanupExpired, startAlertScheduler }
