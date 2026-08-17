import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createDb } from '../src/db/index.js'
import { buildBriefingRequest, buildSnapshot, evaluateFlight, cleanupExpired, runTick } from '../src/alerts/scheduler.js'

const ETD = '2026-07-08T10:00:00Z'
const ETA = '2026-07-08T12:00:00Z'
const GEOM = { type: 'LineString', coordinates: [[126.4, 37.4], [126.6, 33.5]] }

const tafFor = (baseFt) => ({
  header: { icao: 'RKPC' },
  timeline: [{ time: ETA, visibility: { value: 9999, cavok: false }, clouds: [{ amount: 'BKN', base: baseFt, raw: `BKN${baseFt}` }] }],
})
// composeBriefing이 낼 형태의 최소 목업(스케줄러가 읽는 필드만).
const briefingWith = ({ alternateRequired = false, hazards = [], model = null } = {}) => ({
  sections: { destination: { alternateRequired }, adverse: { hazards }, enroute: { model } },
})

let seq = 0
function seed(db, { withGeometry = true } = {}) {
  const now = new Date().toISOString()
  const uid = db.prepare("INSERT INTO users (username, password_hash, min_ceiling_ft, min_visibility_m, created_at) VALUES (?,?,?,?,?)")
    .run(`pilot${seq++}`, 'x', 500, 1600, now).lastInsertRowid // IFR 미니마
  const payload = JSON.stringify({
    routeGeometry: withGeometry ? GEOM : undefined,
    routeForm: { flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPC' },
    cruiseAltitudeFt: 9000,
  })
  const rid = db.prepare(`INSERT INTO routes (user_id, name, dep, dest, etd, eta, payload, alert_enabled, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,1,?,?)`).run(uid, 'RKSI→RKPC', 'RKSI', 'RKPC', ETD, ETA, payload, now, now).lastInsertRowid
  return db.prepare('SELECT * FROM routes WHERE id=?').get(rid)
}

test('buildBriefingRequest: payload+행 → 브리핑 요청 body, 기하 없으면 null', () => {
  const db = createDb(':memory:')
  try {
    const req = buildBriefingRequest(seed(db))
    assert.equal(req.arrivalAirport, 'RKPC')
    assert.equal(req.eta, ETA)
    assert.deepEqual(req.routeGeometry, GEOM)
    assert.equal(buildBriefingRequest(seed(db, { withGeometry: false })), null)
  } finally { db.close() }
})

test('buildBriefingRequest: enrouteGeometry 폴백 (Phase 0.2 안전망)', () => {
  const mk = (payload) => ({ payload: JSON.stringify(payload), etd: ETD, eta: ETA, dep: 'RKSI', dest: 'RKPC', altn: null, rules: 'IFR' })
  const form = { flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPC' }
  // routeGeometry 없이 enrouteGeometry만 있어도 요청이 만들어진다(스켈레톤만 저장 대비).
  const onlyEnroute = buildBriefingRequest(mk({ routeForm: form, enrouteGeometry: GEOM }))
  assert.deepEqual(onlyEnroute.routeGeometry, GEOM)
  // 둘 다 있으면 최종선(routeGeometry) 우선(감시 기준, 스펙 §4.1).
  const both = buildBriefingRequest(mk({ routeForm: form, routeGeometry: GEOM, enrouteGeometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] } }))
  assert.deepEqual(both.routeGeometry, GEOM)
  // 둘 다 없으면 null.
  assert.equal(buildBriefingRequest(mk({ routeForm: form })), null)
})

test('buildSnapshot: 목적지 운고 수치 + 교체필요 + 경로위험 추출', () => {
  const db = createDb(':memory:')
  try {
    const route = seed(db)
    const req = buildBriefingRequest(route)
    const snap = buildSnapshot(
      briefingWith({ alternateRequired: true, hazards: [{ source: 'SIGMET', code: 'TS', validFrom: ETD, encounter: 'on', label: 'TS' }] }),
      { RKPC: tafFor(400) }, req,
    )
    assert.equal(snap.dest.ceilingFt, 400)
    assert.equal(snap.dest.alternateRequired, true)
    assert.equal(snap.hazards.length, 1)
    assert.equal(snap.hazards[0].isSigmet, true)
  } finally { db.close() }
})

test('evaluateFlight: 첫 tick=baseline(무발화)·스냅샷 저장, 목적지 하락 tick=CEIL 1건', () => {
  const db = createDb(':memory:')
  try {
    const route = seed(db)
    const cache = new Map()
    // 1) baseline — 정상(운고 3000)
    const r1 = evaluateFlight({ db, route, briefing: briefingWith(), tafByIcao: { RKPC: tafFor(3000) }, cache })
    assert.equal(r1.baseline, true)
    assert.equal(r1.changes.length, 0)
    const stored = db.prepare('SELECT last_briefing_snapshot_id FROM routes WHERE id=?').get(route.id)
    assert.ok(stored.last_briefing_snapshot_id, 'baseline 스냅샷 해시 저장됨')

    // 2) 목적지 운고 400 (< IFR 미니마 500) → CEIL CRITICAL 1건
    const r2 = evaluateFlight({ db, route, briefing: briefingWith(), tafByIcao: { RKPC: tafFor(400) }, cache })
    assert.equal(r2.baseline, false)
    assert.equal(r2.changes.length, 1)
    assert.equal(r2.changes[0].type, 'CEIL')
    assert.equal(r2.changes[0].severity, 'CRITICAL')
    const alerts = db.prepare('SELECT type, severity, route_id FROM triggered_alerts WHERE route_id=?').all(route.id)
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].type, 'CEIL')
  } finally { db.close() }
})

test('evaluateFlight: 같은 조건 재발화 dedup — cache 리셋해도 triggered_alerts 중복 없음', () => {
  const db = createDb(':memory:')
  try {
    const route = seed(db)
    const cache = new Map()
    evaluateFlight({ db, route, briefing: briefingWith(), tafByIcao: { RKPC: tafFor(3000) }, cache }) // baseline
    evaluateFlight({ db, route, briefing: briefingWith(), tafByIcao: { RKPC: tafFor(400) }, cache })  // CEIL 발화
    cache.set(route.id, buildSnapshot(briefingWith(), { RKPC: tafFor(3000) }, buildBriefingRequest(route))) // prev=정상으로 강제
    evaluateFlight({ db, route, briefing: briefingWith(), tafByIcao: { RKPC: tafFor(400) }, cache })  // 같은 크로싱 재현
    assert.equal(db.prepare('SELECT COUNT(*) n FROM triggered_alerts WHERE route_id=?').get(route.id).n, 1)
  } finally { db.close() }
})

test('evaluateFlight: routeGeometry 없으면 skip', () => {
  const db = createDb(':memory:')
  try {
    const route = seed(db, { withGeometry: false })
    const res = evaluateFlight({ db, route, briefing: briefingWith(), tafByIcao: {}, cache: new Map() })
    assert.equal(res.skipped, 'no_geometry')
  } finally { db.close() }
})

test('cleanupExpired: 알림 이력이 없는 만료 경로는 지우고, 있는 경로는 남겨서 이후 정리를 막지 않는다', () => {
  const db = createDb(':memory:')
  try {
    const past = new Date('2026-01-01T00:00:00Z').toISOString()
    const withHistory = seed(db)
    const withoutHistory = seed(db)
    db.prepare('UPDATE routes SET expires_at=? WHERE id IN (?,?)').run(past, withHistory.id, withoutHistory.id)
    db.prepare(`INSERT INTO triggered_alerts (user_id, route_id, type, severity, target, from_val, to_val, source_id, dedup_key, detected_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(withHistory.user_id, withHistory.id, 'ceiling', '중', 'dest', '3000', '400', null, 'k1', past)

    cleanupExpired(db, Date.parse('2026-07-27T00:00:00Z'))

    assert.ok(db.prepare('SELECT 1 FROM routes WHERE id=?').get(withHistory.id), '이력 있는 만료 경로는 삭제되지 않는다')
    assert.equal(db.prepare('SELECT 1 FROM routes WHERE id=?').get(withoutHistory.id), undefined, '이력 없는 만료 경로는 삭제된다')
  } finally { db.close() }
})

// 실제 저장 payload는 routeForm을 base 아래에 두고, routes의 dep/dest/altn/rules 컬럼은
// 저장(me/routes.js)·알림등록(me/alerts.js) 어느 쪽도 채우지 않는다 → payload가 유일한 출처.
// 위 mk()는 dep/dest를 채워 이 어긋남을 가린다. 여기서는 실제와 같이 비워 둔다.
test('buildBriefingRequest: 실제 저장 모양(base.routeForm, dep/dest 컬럼 없음)', () => {
  const realRow = (payload) => ({
    payload: JSON.stringify(payload), etd: ETD, eta: ETA,
    dep: null, dest: null, altn: null, rules: null,
  })
  const req = buildBriefingRequest(realRow({
    version: 3,
    base: {
      routeForm: { flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPC' },
      enroute: {}, routeString: 'SEL',
    },
    routeGeometry: GEOM,
    alternateAirport: 'RKPK',
    cruiseAltitudeFt: 31000,
  }))
  assert.ok(req, '실제 저장 모양에서 null이 나오면 안 된다')
  assert.equal(req.departureAirport, 'RKSI')
  assert.equal(req.arrivalAirport, 'RKPC')
  assert.equal(req.alternateAirport, 'RKPK')
  assert.equal(req.flightRule, 'IFR')
  assert.equal(req.plannedCruiseAltitudeFt, 31000)
})

// 기하 없는 경로를 조용히 넘기면 "감시중"으로 보이면서 아무것도 안 하는 상태가 오래 간다.
test('runTick: 기하 없는 경로를 세어서 반환한다', async () => {
  const db = createDb(':memory:')
  const now = Date.parse('2026-08-17T00:00:00Z')
  const nowIso = new Date(now).toISOString()
  const etd = new Date(now + 60 * 60 * 1000).toISOString() // 감시창(ETD-2h ~ ETD) 안
  const uid = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)')
    .run('pilot-skip', 'x', nowIso).lastInsertRowid
  const payload = JSON.stringify({
    version: 3,
    base: { routeForm: { flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPC' }, enroute: {}, routeString: 'SEL' },
  })
  db.prepare(`INSERT INTO routes (user_id, name, etd, payload, alert_enabled, alert_start_min_before_etd, created_at, updated_at)
    VALUES (?,?,?,?,1,120,?,?)`).run(uid, 'RKSI→RKPC', etd, payload, nowIso, nowIso)

  const result = await runTick(db, now)
  assert.equal(result.skipped, 1)
  assert.equal(result.evaluated, 0)
})
