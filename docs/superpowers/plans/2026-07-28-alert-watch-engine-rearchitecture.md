# 알림 감시 엔진 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-28-alert-watch-engine-rearchitecture.md`

**Goal:** 저장된 예정 비행 중 실제로 영향을 받는 감시만 데이터 revision 변화 또는 시간 경계에 맞춰 재평가하고, 재시작 안전한 상태·outbox·PWA Web Push까지 완성한다.

**Architecture:** `routes`는 재사용 템플릿으로 남기고 `alert_watches`가 한 번의 예정 비행 snapshot과 수명주기를 소유한다. snapshot store가 내용 변경 시 `ChangeSet`을 발행하면 `AlertWatchEngine`이 DB 후보 인덱스로 활성 감시만 dirty 처리하며, 고정 interval 대신 다음 `starts_at`/ETD/`expires_at`/재평가 시각에 watch one-shot timer 하나만 둔다. 평가 결과는 condition state와 `triggered_alerts`/`alert_outbox`를 한 트랜잭션에 기록하고, 별도 worker가 독립적인 delivery one-shot timer로 Telegram과 Web Push를 전달한다.

**Tech Stack:** Node.js 22 ESM, Express 4, SQLite/`better-sqlite3`, `node:test`, React 19, Service Worker + Push API, `web-push`, Playwright.

## Global Constraints

- 기존 사용자 알림 종류·임계값·첫 active 평가의 baseline-only 동작을 바꾸지 않는다.
- 기존 `/api/me/alerts`, `/api/me/notifications`, 알림센터와 `?flight=` URL 계약을 유지한다.
- `?flight=<id>`의 `<id>`는 adapter가 노출하는 예정 비행 ID(`alert_watches.id`)이며, 원본 템플릿 ID는 `templateId`로 별도 보존한다.
- 모든 저장·비교 시각은 UTC ISO instant 또는 epoch로 처리한다.
- 부분 수집 실패는 기존 last-good snapshot을 보존하고 변화 사건으로 오인하지 않는다.
- 열린 감시가 없으면 watch timer, watch 주기 DB 조회, 브리핑 계산이 모두 0이어야 한다. 이미 쌓인 outbox가 있으면 delivery worker만 별도 timer로 재시도할 수 있다.
- 미래 `scheduled` 감시만 있으면 source change를 버리고 가장 이른 `starts_at`에만 깨어난다.
- HIGH/CRITICAL만 Telegram 및 PWA Web Push 대상으로 삼고, MEDIUM 이하는 인앱 이력만 남긴다.
- Telegram 관리자 전용 정책은 유지한다.
- Push 권한 요청은 사용자 버튼 동작 안에서만 실행하고 VAPID 비밀키는 서버 환경 변수에만 둔다.
- PostGIS, 외부 queue, 새 npm dependency, 다중 서버용 분산 lock은 추가하지 않는다.
- 경로 위험 최종 판정은 기존 `route-axis`, `hazard-section`, `typhoon-briefing`, KIM/KTG 단면 모듈을 재사용한다.
- 브라우저-visible 변경은 Linux Playwright 계약과 실제 HTTPS Push 수신으로 검증한다.
- 한글 파일 편집은 `docs/policies/encoding-safety.md`를 따르고, 코드 변경 후 `graphify update .`를 실행한다.
- 현재 worktree의 사용자 변경을 되돌리거나 덮어쓰지 않는다. 겹치는 파일은 최신 diff를 읽고 최소 범위만 수정한다.
- 아래 `git add` 목록은 허용 경로 목록일 뿐이다. 실행 시작부터 dirty였던 경로는 `git add -p`
  로 이번 task hunk만 고르고 `git diff --cached`로 확인한다. 기존 hunk와 안전하게 분리할 수
  없으면 그 파일은 commit하지 않고 상태 문서에 남긴다.

---

## File Structure

### Backend — 새 파일

- `backend/src/alerts/watch-repository.js` — watch CRUD, legacy migration, 공항/source 후보 인덱스, 수명주기 SQL을 한곳에 둔다.
- `backend/src/alerts/source-changes.js` — store publication을 `ChangeSet`으로 변환하고 구독자에게 전달한다.
- `backend/src/alerts/watch-engine.js` — `recordSourceChange(changeSet)`와 `runDue(now)` 및 one-shot wake 상태를 소유한다.
- `backend/src/alerts/evaluator.js` — watch snapshot을 요청으로 바꾸고 airport/hazard/enroute group만 선택 평가한다.
- `backend/src/alerts/condition-store.js` — baseline/firing/resolved 전이와 alert/outbox 원자 기록을 소유한다.
- `backend/src/alerts/outbox-worker.js` — due outbox 전달, 재시도, 만료 Push 구독 정리와 다음 재시도 시각 계산을 소유한다.
- `backend/test/alert-watch-repository.test.js`
- `backend/test/alert-source-changes.test.js`
- `backend/test/store-change-detection.test.js`
- `backend/test/overseas-weather-processor.test.js`
- `backend/test/alert-watch-engine.test.js`
- `backend/test/alert-evaluator.test.js`
- `backend/test/alert-condition-store.test.js`
- `backend/test/alert-outbox-worker.test.js`
- `backend/test/me-push.test.js`
- `backend/test/ktg-processor.test.js`

### Backend — 수정/삭제

- `backend/src/db/schema.sql` — watch/state/index/condition/outbox 테이블과 인덱스.
- `backend/src/db/index.js` — 기존 `triggered_alerts` 제약 migration과 legacy watch migration 호출.
- `backend/src/store.js` — 저장 전/후 snapshot과 revision을 source-change publisher에 전달.
- `backend/src/index.js` — KIM/KTG publication revision 발행 및 store-ready callback.
- `backend/src/briefing/briefing-composer.js` — 기존 adverse 조립 seam을 evaluator가 재사용할 수 있게 export.
- `backend/src/alerts/diff.js` — 현재 snapshot에서 활성 condition을 도출하는 순수 함수 추가.
- `backend/src/alerts/sender.js` — 문구/Telegram 전송만 유지하고 DB 직접 발송 기록 제거.
- `backend/src/me/alerts.js` — 기존 HTTP shape를 watch repository adapter로 제공.
- `backend/src/me/push.js` — 구독 검증/등록/해지 및 상태 조회.
- `backend/src/processors/kim-surface-wind-processor.js` — 실제 발행한 model revision 반환.
- `backend/src/processors/ktg-processor.js` — 실제 발행한 model revision 반환.
- `backend/src/processors/overseas-weather-processor.js` — SIGMET 수집 실패 시 last-good snapshot 보존.
- `backend/src/dev/scenario.js` — 직접 scheduler 호출 대신 source change + engine `runDue`.
- `backend/server.js` — engine/outbox 생성, router 주입, store-ready bootstrap.
- `backend/src/alerts/scheduler.js` — 최종 task에서 삭제. 필요한 순수 함수는 evaluator로 이동한다.
- 기존 `backend/test/alert-*.test.js`, `backend/test/me-alerts-delete.test.js`, `backend/test/me-notifications.test.js`, `backend/test/db.test.js` — 새 모델에 맞춰 갱신.

### Frontend

- Create: `frontend/src/features/notifications/pushSubscription.js` — VAPID key 변환과 브라우저 구독/해지.
- Create: `frontend/src/features/notifications/pushSubscription.test.js` — VAPID 변환과 구독 helper 단위 테스트.
- Create: `frontend/src/features/notifications/usePushSubscription.js` — `unsupported|permission-needed|denied|subscribed|error` 상태.
- Modify: `frontend/src/features/personal/PersonalSettingsPanel.jsx` — 비행 알림 탭의 기기 알림 제어.
- Modify: `frontend/src/features/developer/tabs/TriggerTab.jsx` — 공통 Push helper 재사용.
- Modify: `frontend/src/features/developer/developerApi.js` — 운영 Push API helper 재사용.
- Modify: `frontend/src/app/App.jsx` — watch snapshot으로 전체 브리핑 열기.
- Modify: `frontend/public/sw.js` — payload URL 저장, 기존 창 focus 또는 새 창 open.
- Create: `frontend/verification/contracts/alert-push.spec.mjs` — 구독 UI, payload, 딥링크의 자동 계약.

### Docs

- Modify: `Architecture.md`
- Modify: `docs/policies/verification/contracts.md`
- Create: `docs/superpowers/status/alert-watch-engine-rearchitecture.status.md`

---

### Task 1: 현재 만료/취소 수명주기 버그를 먼저 차단

**Files:**
- Modify: `backend/src/alerts/scheduler.js`
- Modify: `backend/test/alert-scheduler.test.js`
- Modify: `backend/test/me-alerts-delete.test.js`

**Interfaces:**
- Consumes: 현재 `routes.alert_enabled`, `routes.expires_at`, `triggered_alerts.route_id`.
- Produces: `cleanupExpired(db, now): { expired: number, deleted: number }`; 이력이 있더라도 만료 감시가 다시 평가되지 않는 안전망.

- [ ] **Step 1: 이력 있는 만료 경로가 비활성화되어야 한다는 실패 테스트 작성**

`backend/test/alert-scheduler.test.js`의 기존 `cleanupExpired` 테스트를 다음 assertion으로 바꾼다.

```js
const summary = cleanupExpired(db, Date.parse('2026-07-27T00:00:00Z'))

const retained = db.prepare('SELECT alert_enabled FROM routes WHERE id=?').get(withHistory.id)
assert.equal(retained.alert_enabled, 0, '이력은 남겨도 감시는 반드시 꺼진다')
assert.equal(db.prepare('SELECT 1 FROM routes WHERE id=?').get(withoutHistory.id), undefined)
assert.deepEqual(summary, { expired: 2, deleted: 1 })
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix backend test -- --test-name-pattern="cleanupExpired"`

Expected: `retained.alert_enabled`가 `1`이어서 FAIL.

- [ ] **Step 3: FK로 삭제할 수 없는 행은 같은 함수에서 비활성화**

`cleanupExpired`를 다음 형태로 제한한다.

```js
export function cleanupExpired(db, now = Date.now()) {
  const nowIso = new Date(now).toISOString()
  const expired = db.prepare(
    'SELECT id FROM routes WHERE alert_enabled=1 AND expires_at IS NOT NULL AND expires_at < ?'
  ).all(nowIso)
  let deleted = 0
  for (const { id } of expired) {
    try {
      deleted += db.prepare('DELETE FROM routes WHERE id=?').run(id).changes
    } catch {
      db.prepare('UPDATE routes SET alert_enabled=0, updated_at=? WHERE id=?').run(nowIso, id)
    }
  }
  return { expired: expired.length, deleted }
}
```

- [ ] **Step 4: 취소와 만료 회귀 테스트 실행**

Run: `node --test backend/test/alert-scheduler.test.js backend/test/me-alerts-delete.test.js`

Expected: PASS, 이력 보존 및 `alert_enabled=0` 확인.

- [ ] **Step 5: Commit**

```bash
git add backend/src/alerts/scheduler.js backend/test/alert-scheduler.test.js backend/test/me-alerts-delete.test.js
git commit -m "fix: stop expired alert watches with history"
```

---

### Task 2: 영속 watch/state/outbox 스키마와 legacy migration

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/index.js`
- Create: `backend/src/alerts/watch-repository.js`
- Create: `backend/test/alert-watch-repository.test.js`
- Modify: `backend/test/db.test.js`

**Interfaces:**
- Produces: `deriveWatchRecord(route, input, now): AlertWatchInsert`.
- Produces: `migrateLegacyAlertWatches(db, now): { migrated: number }`.
- Produces tables: `alert_watches`, `watch_airports`, `watch_dependencies`, `alert_watch_state`, `alert_condition_state`, `alert_outbox`.
- `triggered_alerts.watch_id` references `alert_watches.id`; `route_id` becomes nullable with `ON DELETE SET NULL`.

- [ ] **Step 1: 새 테이블과 FK 동작을 검증하는 실패 테스트 작성**

`backend/test/alert-watch-repository.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db/index.js'
import { migrateLegacyAlertWatches } from '../src/alerts/watch-repository.js'

test('legacy alert route migrates with the same flight id and persistent state', () => {
  const db = createDb(':memory:')
  const now = '2026-07-28T00:00:00.000Z'
  const uid = db.prepare(
    'INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)'
  ).run('pilot', 'x', now).lastInsertRowid
  const payload = JSON.stringify({
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 35]] },
    routeForm: { departureAirport: 'RKSI', arrivalAirport: 'RKPC' },
  })
  const routeId = db.prepare(`
    INSERT INTO routes
      (user_id,name,etd,eta,payload,alert_enabled,alert_start_min_before_etd,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,?,1,120,?,?,?)
  `).run(uid, 'RKSI→RKPC', '2026-07-28T03:00:00.000Z', '2026-07-28T04:00:00.000Z',
    payload, '2026-07-28T06:00:00.000Z', now, now).lastInsertRowid

  assert.deepEqual(migrateLegacyAlertWatches(db, Date.parse(now)), { migrated: 1 })
  const watch = db.prepare('SELECT * FROM alert_watches WHERE id=?').get(routeId)
  assert.equal(watch.id, routeId)
  assert.equal(watch.status, 'scheduled')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM watch_airports WHERE watch_id=?').get(routeId).n, 2)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM watch_dependencies WHERE watch_id=?').get(routeId).n, 8)
  assert.equal(migrateLegacyAlertWatches(db, Date.parse(now)).migrated, 0)
})

test('route template deletion keeps triggered history through nullable route_id', () => {
  const db = createDb(':memory:')
  const now = new Date().toISOString()
  const uid = db.prepare('INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)')
    .run('pilot2', 'x', now).lastInsertRowid
  const routeId = db.prepare('INSERT INTO routes (user_id,created_at,updated_at) VALUES (?,?,?)')
    .run(uid, now, now).lastInsertRowid
  const watchId = db.prepare(`
    INSERT INTO alert_watches
      (user_id,route_id,route_snapshot_json,etd,starts_at,expires_at,status,alert_start_min_before_etd,settings_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(uid, routeId, '{}', now, now, now, 'completed', 120, '{}', now, now).lastInsertRowid
  db.prepare(`
    INSERT INTO triggered_alerts (user_id,route_id,watch_id,type,severity,dedup_key,detected_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(uid, routeId, watchId, 'CEIL', 'HIGH', 'CEIL:RKPC', now)

  db.prepare('DELETE FROM routes WHERE id=?').run(routeId)
  assert.equal(db.prepare('SELECT route_id FROM triggered_alerts').get().route_id, null)
  assert.ok(db.prepare('SELECT 1 FROM triggered_alerts WHERE watch_id=?').get(watchId))
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/alert-watch-repository.test.js`

Expected: `no such table: alert_watches`로 FAIL.

- [ ] **Step 3: schema.sql에 watch/state/outbox 테이블 추가**

`triggered_alerts.route_id`는 신규 DB에서 `INTEGER REFERENCES routes(id) ON DELETE SET NULL`, `watch_id`는 `INTEGER REFERENCES alert_watches(id)`로 정의한다. 이어서 아래 테이블을 추가한다.

```sql
CREATE TABLE IF NOT EXISTS alert_watches (
  id                         INTEGER PRIMARY KEY,
  user_id                    INTEGER NOT NULL REFERENCES users(id),
  route_id                   INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  legacy_route_id            INTEGER UNIQUE,
  name                       TEXT,
  route_snapshot_json        TEXT NOT NULL,
  etd                        TEXT NOT NULL,
  eta                        TEXT,
  starts_at                  TEXT NOT NULL,
  expires_at                 TEXT NOT NULL,
  status                     TEXT NOT NULL CHECK (status IN ('scheduled','active','completed','expired','cancelled')),
  alert_start_min_before_etd INTEGER NOT NULL,
  settings_json              TEXT NOT NULL,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_airports (
  watch_id INTEGER NOT NULL REFERENCES alert_watches(id) ON DELETE CASCADE,
  icao     TEXT NOT NULL,
  role     TEXT NOT NULL CHECK (role IN ('departure','arrival','alternate')),
  PRIMARY KEY (watch_id, icao, role)
);

CREATE TABLE IF NOT EXISTS watch_dependencies (
  watch_id INTEGER NOT NULL REFERENCES alert_watches(id) ON DELETE CASCADE,
  source   TEXT NOT NULL,
  PRIMARY KEY (watch_id, source)
);

CREATE TABLE IF NOT EXISTS alert_watch_state (
  watch_id                  INTEGER PRIMARY KEY REFERENCES alert_watches(id) ON DELETE CASCADE,
  snapshot_json             TEXT,
  evaluated_revisions_json TEXT NOT NULL DEFAULT '{}',
  dirty_sources_json        TEXT NOT NULL DEFAULT '[]',
  next_check_at             TEXT,
  last_evaluated_at         TEXT
);

CREATE TABLE IF NOT EXISTS alert_condition_state (
  watch_id          INTEGER NOT NULL REFERENCES alert_watches(id) ON DELETE CASCADE,
  condition_key     TEXT NOT NULL,
  source_group      TEXT NOT NULL CHECK (source_group IN ('airport','hazard','enroute')),
  status            TEXT NOT NULL CHECK (status IN ('inactive','firing','resolved')),
  fingerprint       TEXT,
  opened_at         TEXT,
  last_notified_at  TEXT,
  resolved_at       TEXT,
  PRIMARY KEY (watch_id, condition_key)
);

CREATE TABLE IF NOT EXISTS alert_outbox (
  id              INTEGER PRIMARY KEY,
  delivery_key    TEXT NOT NULL UNIQUE,
  watch_id        INTEGER NOT NULL REFERENCES alert_watches(id),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  route_id        INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('telegram','web_push')),
  alert_ids_json  TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  delivery_state_json TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL CHECK (status IN ('pending','sending','sent','retry','skipped')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error      TEXT,
  sent_at         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_watch_status_time ON alert_watches(status, starts_at, etd, expires_at);
CREATE INDEX IF NOT EXISTS idx_watch_airport ON watch_airports(icao, watch_id);
CREATE INDEX IF NOT EXISTS idx_watch_dependency ON watch_dependencies(source, watch_id);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON alert_outbox(status, next_attempt_at);
```

- [ ] **Step 4: 기존 triggered_alerts를 안전하게 재작성하는 idempotent migration 추가**

`backend/src/db/index.js`에 `migrateTriggeredAlertsTable(database)`를 추가한다. `PRAGMA table_info(triggered_alerts)`의 `route_id.notnull === 1`이거나 `watch_id`가 없을 때만 transaction 안에서 `_triggered_alerts_v2`를 만들고 기존 열을 복사한다.

```js
function migrateTriggeredAlertsTable(database) {
  const exists = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='triggered_alerts'"
  ).get()
  if (!exists) return
  const cols = database.prepare('PRAGMA table_info(triggered_alerts)').all()
  const routeId = cols.find((c) => c.name === 'route_id')
  if (cols.some((c) => c.name === 'watch_id') && routeId?.notnull === 0) return

  database.transaction(() => {
    database.exec(`
      CREATE TABLE _triggered_alerts_v2 (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
        watch_id INTEGER REFERENCES alert_watches(id),
        type TEXT NOT NULL, severity TEXT NOT NULL, target TEXT,
        from_val TEXT, to_val TEXT, source_id TEXT, source_seq TEXT, source_issued_at TEXT,
        dedup_key TEXT, reissue_count INTEGER NOT NULL DEFAULT 0,
        detected_at TEXT NOT NULL, pushed_at TEXT, channel_status TEXT, read_at TEXT
      );
      INSERT INTO _triggered_alerts_v2
        (id,user_id,route_id,type,severity,target,from_val,to_val,source_id,source_seq,
         source_issued_at,dedup_key,reissue_count,detected_at,pushed_at,channel_status,read_at)
      SELECT id,user_id,route_id,type,severity,target,from_val,to_val,source_id,source_seq,
             source_issued_at,dedup_key,reissue_count,detected_at,pushed_at,channel_status,read_at
      FROM triggered_alerts;
      DROP TABLE triggered_alerts;
      ALTER TABLE _triggered_alerts_v2 RENAME TO triggered_alerts;
    `)
  })()
}
```

`createDb()` 순서를 `ensureColumns → schema exec → migrateTriggeredAlertsTable → schema exec`로 둬 재작성 뒤 인덱스도 복구한다.

- [ ] **Step 5: legacy watch 파생과 migration 구현**

`backend/src/alerts/watch-repository.js`:

```js
const SOURCES = [
  'taf', 'taf_overseas', 'sigmet', 'sigmet_overseas',
  'airmet', 'warning', 'typhoon', 'enroute_model',
]

const parse = (text, fallback = {}) => {
  try { return JSON.parse(text) } catch { return fallback }
}

export function deriveWatchIndexes(snapshot = {}) {
  const form = snapshot.routeForm ?? {}
  return {
    airports: [
      ['departure', form.departureAirport],
      ['arrival', form.arrivalAirport],
      ['alternate', snapshot.alternateAirport],
    ].filter(([, icao]) => typeof icao === 'string' && icao.length === 4)
      .map(([role, icao]) => ({ role, icao })),
    dependencies: SOURCES,
  }
}

export function migrateLegacyAlertWatches(db, now = Date.now()) {
  const rows = db.prepare(`
    SELECT * FROM routes
    WHERE alert_enabled=1
      AND NOT EXISTS (SELECT 1 FROM alert_watches w WHERE w.legacy_route_id=routes.id)
  `).all()
  let migrated = 0
  db.transaction(() => {
    for (const route of rows) {
      const etdMs = Date.parse(route.etd)
      if (!Number.isFinite(etdMs)) continue
      const lead = route.alert_start_min_before_etd || 120
      const startsMs = etdMs - lead * 60000
      const expiresMs = Number.isFinite(Date.parse(route.expires_at))
        ? Date.parse(route.expires_at) : etdMs + 3 * 3600000
      const status = now < startsMs ? 'scheduled'
        : now < etdMs ? 'active' : now < expiresMs ? 'completed' : 'expired'
      insertWatch(db, {
        id: route.id, userId: route.user_id, routeId: route.id, legacyRouteId: route.id,
        name: route.name,
        snapshot: { ...parse(route.payload), etd: route.etd, eta: route.eta },
        etd: route.etd, eta: route.eta,
        startsAt: new Date(startsMs).toISOString(),
        expiresAt: new Date(expiresMs).toISOString(),
        status, leadMinutes: lead,
        settings: { sendNoChangeConfirm: Boolean(route.send_no_change_confirm) },
        createdAt: route.created_at, updatedAt: route.updated_at,
      })
      db.prepare('UPDATE routes SET alert_enabled=0 WHERE id=?').run(route.id)
      migrated += 1
    }
    db.prepare(`
      UPDATE triggered_alerts
      SET watch_id=route_id
      WHERE watch_id IS NULL
        AND EXISTS (SELECT 1 FROM alert_watches w WHERE w.id=triggered_alerts.route_id)
    `).run()
  })()
  return { migrated }
}

export function insertWatch(db, input) {
  return db.transaction(() => {
    const values = [
      input.userId, input.routeId ?? null, input.legacyRouteId ?? null, input.name ?? null,
      JSON.stringify(input.snapshot), input.etd, input.eta ?? null, input.startsAt,
      input.expiresAt, input.status, input.leadMinutes, JSON.stringify(input.settings),
      input.createdAt, input.updatedAt,
    ]
    const info = input.id == null
      ? db.prepare(`
          INSERT INTO alert_watches
            (user_id,route_id,legacy_route_id,name,route_snapshot_json,etd,eta,starts_at,
             expires_at,status,alert_start_min_before_etd,settings_json,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(...values)
      : db.prepare(`
          INSERT INTO alert_watches
            (id,user_id,route_id,legacy_route_id,name,route_snapshot_json,etd,eta,starts_at,
             expires_at,status,alert_start_min_before_etd,settings_json,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(input.id, ...values)
    const watchId = input.id ?? Number(info.lastInsertRowid)
    db.prepare(`
      INSERT INTO alert_watch_state
        (watch_id,snapshot_json,evaluated_revisions_json,dirty_sources_json)
      VALUES (?,NULL,'{}','[]')
    `).run(watchId)
    const indexes = deriveWatchIndexes(input.snapshot)
    const airport = db.prepare(
      'INSERT INTO watch_airports (watch_id,icao,role) VALUES (?,?,?)'
    )
    for (const item of indexes.airports) airport.run(watchId, item.icao, item.role)
    const dependency = db.prepare(
      'INSERT INTO watch_dependencies (watch_id,source) VALUES (?,?)'
    )
    for (const source of indexes.dependencies) dependency.run(watchId, source)
    return db.prepare('SELECT * FROM alert_watches WHERE id=?').get(watchId)
  })()
}
```

`createDb()`의 schema 적용이 끝난 직후 `migrateLegacyAlertWatches(database)`를 호출한다.

- [ ] **Step 6: schema와 migration 테스트**

Run: `node --test backend/test/db.test.js backend/test/alert-watch-repository.test.js`

Expected: PASS; migration 두 번째 실행은 `migrated: 0`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/schema.sql backend/src/db/index.js backend/src/alerts/watch-repository.js backend/test/db.test.js backend/test/alert-watch-repository.test.js
git commit -m "feat: persist alert watch lifecycle state"
```

---

### Task 3: 기존 HTTP 계약을 alert_watches adapter로 전환

**Files:**
- Modify: `backend/src/me/alerts.js`
- Modify: `backend/test/alert-active.test.js`
- Modify: `backend/test/me-alerts-delete.test.js`
- Modify: `backend/test/me-notifications.test.js`
- Modify: `frontend/src/features/personal/usePersonalSettings.js`
- Modify: `frontend/src/app/App.jsx`

**Interfaces:**
- Consumes: `insertWatch`, `deriveWatchIndexes` from Task 2.
- Produces: `POST /api/me/alerts` → `{ id: watchId }`.
- Produces: `GET /api/me/alerts` → 기존 `{ flights: [{id,name,etd,eta,alert_start_min_before_etd,active}] }`.
- Produces: `GET /api/me/alerts/:id` → `{ id, templateId, name, snapshot, etd, eta, status }`.
- Produces: `PATCH`/`DELETE`가 watch 상태·시각·인덱스를 원자 갱신하고 `onWatchChanged()`를 호출.
- `GET /api/me/notifications`의 기존 `routeId` 필드는 watch ID를 반환하고 `templateId`, `watchId`를 추가한다.

- [ ] **Step 1: router adapter 실패 테스트 작성**

라우터의 SQL을 직접 복제하지 말고 `createAlertsRouter({ db, now, onWatchChanged })`를 세션 middleware가 있는 작은 Express test app에 마운트한다. 다음 계약을 검증한다.

```js
assert.equal(created.status, 201)
const watch = db.prepare('SELECT * FROM alert_watches WHERE id=?').get(created.body.id)
assert.equal(watch.route_id, templateId)
assert.equal(JSON.parse(watch.route_snapshot_json).routeForm.arrivalAirport, 'RKPC')
assert.equal(changedCalls, 1)

const listed = await request(app).get('/api/me/alerts')
assert.deepEqual(Object.keys(listed.body.flights[0]).sort(), [
  'active', 'alert_start_min_before_etd', 'eta', 'etd', 'id', 'name',
])
```

프로젝트에 HTTP test helper가 없으므로 새 dependency를 추가하지 않는다. 기존 `requests-flow.test.js`처럼 실제 ephemeral port와 `fetch`를 사용한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/alert-active.test.js backend/test/me-alerts-delete.test.js backend/test/me-notifications.test.js`

Expected: watch table을 사용하지 않아 FAIL.

- [ ] **Step 3: POST/GET/PATCH/DELETE를 watch repository로 교체**

`createAlertsRouter` signature를 다음으로 바꾼다.

```js
export function createAlertsRouter({
  db = null,
  now = () => Date.now(),
  onWatchChanged = () => {},
} = {}) {
```

POST는 템플릿을 삭제하지 않고 snapshot을 복사한다.

```js
const createdAt = new Date(now()).toISOString()
const etdMs = Date.parse(etd)
const leadMinutes = alertStartMinBeforeEtd ?? 120
const watch = insertWatch(db2, {
  userId: req.session.userId,
  routeId: templateId,
  name: tpl.name,
  snapshot: { ...JSON.parse(tpl.payload || '{}'), etd, eta: eta ?? null },
  etd,
  eta: eta ?? null,
  startsAt: new Date(etdMs - leadMinutes * 60000).toISOString(),
  expiresAt: new Date(etdMs + EXPIRE_MS).toISOString(),
  status: now() < etdMs - leadMinutes * 60000 ? 'scheduled' : 'active',
  leadMinutes,
  settings: { sendNoChangeConfirm: Boolean(sendNoChangeConfirm) },
  createdAt,
  updatedAt: createdAt,
})
onWatchChanged()
return res.status(201).json({ id: watch.id })
```

DELETE는 행을 지우지 않고 `status='cancelled'`로 바꾸며 이력과 snapshot을 유지한다. PATCH는 ETD/ETA/`starts_at`/`expires_at`/status를 다시 계산하고 `route_snapshot_json`의 최상위 `etd`/`eta`도 같은 값으로 갱신한다. 이어 `alert_watch_state.next_check_at`을 비운 뒤 `onWatchChanged()`를 호출한다.

- [ ] **Step 4: notification adapter에서 watch ID와 template ID를 분리**

`listNotifications` SELECT 핵심:

```sql
SELECT t.id,
       COALESCE(t.watch_id, t.route_id) AS routeId,
       t.watch_id AS watchId,
       t.route_id AS templateId,
       t.type, t.severity, t.target,
       t.from_val AS fromVal, t.to_val AS toVal,
       t.detected_at AS detectedAt, t.pushed_at AS pushedAt, t.read_at AS readAt,
       COALESCE(w.name, r.name) AS routeName
FROM triggered_alerts t
LEFT JOIN alert_watches w ON w.id=t.watch_id
LEFT JOIN routes r ON r.id=t.route_id
WHERE t.user_id=?
ORDER BY t.detected_at DESC, t.id DESC
LIMIT 200
```

- [ ] **Step 5: 전체 브리핑 버튼이 watch snapshot을 읽도록 frontend adapter 추가**

`usePersonalSettings.js`:

```js
export async function getAlertFlight(id) {
  const res = await fetch(`${ALERTS}/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error('alert_flight_not_found')
  return res.json()
}
```

`App.jsx`의 `FlightAlertDetail.onOpenRoute`는 `listSavedRoutes()` 대신 `getAlertFlight(id)`의 `snapshot`을 `mapRef.current?.loadRouteBriefing?.()`에 전달한다.

- [ ] **Step 6: API와 frontend 단위 테스트 실행**

Run: `node --test backend/test/alert-active.test.js backend/test/me-alerts-delete.test.js backend/test/me-notifications.test.js`

Run: `npm --prefix frontend test`

Expected: 모두 PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/me/alerts.js backend/test/alert-active.test.js backend/test/me-alerts-delete.test.js backend/test/me-notifications.test.js frontend/src/features/personal/usePersonalSettings.js frontend/src/app/App.jsx
git commit -m "feat: adapt flight alert APIs to watch records"
```

---

### Task 4: snapshot publication을 ChangeSet으로 변환

**Files:**
- Create: `backend/src/alerts/source-changes.js`
- Create: `backend/test/alert-source-changes.test.js`
- Create: `backend/test/store-change-detection.test.js`
- Create: `backend/test/overseas-weather-processor.test.js`
- Create: `backend/test/ktg-processor.test.js`
- Modify: `backend/src/store.js`
- Modify: `backend/src/index.js`
- Modify: `backend/src/processors/overseas-weather-processor.js`
- Modify: `backend/src/processors/kim-surface-wind-processor.js`
- Modify: `backend/src/processors/ktg-processor.js`
- Modify: `backend/test/kim-scheduler.test.js`

**Interfaces:**
- Produces: `subscribeSourceChanges(listener): unsubscribe`.
- Produces: `publishSnapshotChange({type, previous, current, revision, occurredAt})`.
- Produces: `publishCollectorResult(type, result, occurredAt, {dataRoot})`.
- Emits `ChangeSet = { source, revision, affected, occurredAt }`.

- [ ] **Step 1: source별 changed/removed 항목 실패 테스트 작성**

`backend/test/alert-source-changes.test.js`:

```js
test('unchanged publication emits nothing; TAF emits changed ICAO only', () => {
  const seen = []
  const off = subscribeSourceChanges((change) => seen.push(change))
  publishSnapshotChange({
    type: 'taf',
    previous: { airports: { RKSI: { issued: 'a' }, RKPC: { issued: 'a' } } },
    current: { airports: { RKSI: { issued: 'a' }, RKPC: { issued: 'b' } } },
    revision: 'rev-b',
    occurredAt: '2026-07-28T00:00:00.000Z',
  })
  off()
  assert.deepEqual(seen[0], {
    source: 'taf',
    revision: 'rev-b',
    affected: { airports: ['RKPC'] },
    occurredAt: '2026-07-28T00:00:00.000Z',
  })
})

test('SIGMET removal remains in affected items', () => {
  const change = buildSnapshotChange({
    type: 'sigmet',
    previous: { items: [{ id: 'A', bbox: [1, 2, 3, 4], valid_from: 'a', valid_to: 'b' }] },
    current: { items: [] },
    revision: 'rev-2',
    occurredAt: '2026-07-28T00:00:00.000Z',
  })
  assert.deepEqual(change.affected.items, [{
    id: 'A', removed: true, bbox: [1, 2, 3, 4], validFrom: 'a', validTo: 'b',
  }])
})

test('TAF fingerprint ignores collection timestamps', () => {
  const previous = {
    fetched_at: '2026-07-28T00:00:00.000Z',
    airports: { RKPC: { raw: 'TAF RKPC SAME', header: { source: { fetch_time: 'old' } } } },
  }
  const current = {
    fetched_at: '2026-07-28T00:05:00.000Z',
    airports: { RKPC: { raw: 'TAF RKPC SAME', header: { source: { fetch_time: 'new' } } } },
  }
  assert.equal(buildSnapshotChange({
    type: 'taf', previous, current, revision: 'same', occurredAt: current.fetched_at,
  }), null)
})
```

`backend/test/store-change-detection.test.js`에도 `canonicalHash()`가 중첩 위치와 무관하게
`fetched_at`, `fetch_time`, `_stale`, `content_hash`, 최상위 `type`만 달라진 payload를 같은
내용으로 보는 회귀 테스트를 둔다. 실제 예보 본문이 바뀌면 hash가 달라지는 대조 assertion도
같이 둔다.

`backend/test/overseas-weather-processor.test.js`는 last-good 해외 SIGMET 한 건을 seed하고
`fetchNoaaSigmet()`이 throw하도록 만든 뒤 `processSigmet()`이 `saved:false`,
`failed:true`를 반환하고 `store.save()` 및 source publication을 호출하지 않으며 기존
`latest.json`의 item을 보존하는지 검증한다.

`backend/test/ktg-processor.test.js`는 새 `tmfc+hfs` 발행 시 revision을 반환하고, 동일 run
skip 또는 수집 실패에는 새 revision/publication이 없음을 검증한다.

- [ ] **Step 2: 실패 확인**

Run:

```bash
node --test \
  backend/test/alert-source-changes.test.js \
  backend/test/store-change-detection.test.js \
  backend/test/overseas-weather-processor.test.js \
  backend/test/ktg-processor.test.js
```

Expected: module/test seams missing으로 FAIL.

- [ ] **Step 3: stdlib 기반 단일-process publisher 구현**

`backend/src/alerts/source-changes.js`는 `Set` 하나만 사용한다.

```js
import crypto from 'node:crypto'
import { readKimNwpLatest } from '../processors/kim-nwp-store.js'
import { readKtgIndex } from '../processors/ktg-store.js'

const fingerprint = (value) => crypto.createHash('sha256')
  .update(JSON.stringify(value)).digest('hex')
const listeners = new Set()
const AIRPORT_SOURCES = new Set(['taf', 'taf_overseas', 'warning'])
const ITEM_SOURCES = new Set(['sigmet', 'sigmet_overseas', 'airmet'])

export function subscribeSourceChanges(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitSourceChange(changeSet) {
  if (!changeSet) return
  for (const listener of listeners) {
    try {
      listener(changeSet)
    } catch (error) {
      console.error('[source-change] listener failed:', error.message)
    }
  }
}

export function publishSnapshotChange(event) {
  emitSourceChange(buildSnapshotChange(event))
}

export function combinedModelRevision(dataRoot) {
  const kim = readKimNwpLatest(dataRoot)
  const ktg = readKtgIndex(dataRoot)
  return fingerprint({
    kim: kim?.latestRunId ?? null,
    ktg: ktg ? { tmfc: ktg.tmfc, hfs: (ktg.hours ?? []).map((item) => item.hf) } : null,
  })
}
```

공항 payload는 이전/현재 `airports`의 합집합에서 이 파일 내부의 SHA-256
`fingerprint(stable(record))`가 다른 ICAO만 정렬한다. `stable()`은 객체를 재귀 순회하며
`fetched_at`, `fetch_time`, `_stale`, `content_hash`, 최상위 `type`을 제외한다. `store.js`를
import하면 순환 의존이 생기므로 이 작은 helper만 동일 파일에 둔다. item payload는 `id`를
key로 비교하고 변경·추가·삭제 item의 `id`, `bbox`, `validFrom`, `validTo`, `removed`를
보존한다. 태풍은 `${year}-${number}-${seq}`를 ID로 사용한다. 실제 변경 항목이 0개면
`null`을 반환한다.

- [ ] **Step 4: store.save가 성공 publication만 발행**

`backend/src/store.js`의 기존 `canonicalize()` 제외 목록에 중첩 `fetch_time`을 추가한다.
`save()`에서 `const previous = cache[type].prev_data`를 `shouldSave` 전에 잡고,
`saved:false` 경로에서는 발행하지 않는다. 새 파일 저장과 `updateCache`가 성공한 뒤에만
호출한다.

```js
publishSnapshotChange({
  type,
  previous,
  current: data,
  revision: decision.hash,
  occurredAt: data.fetched_at || new Date().toISOString(),
})
return { saved: true, filePath, revision: decision.hash }
```

- [ ] **Step 5: 해외 SIGMET 실패는 last-good을 그대로 유지**

`processSigmet()`은 fetch/parse 성공 여부를 구분한다. 실패 catch에서는 만료 항목을
재계산하거나 `store.save()`를 호출하지 않고 즉시 다음을 반환한다.

```js
return {
  type: 'sigmet_overseas',
  saved: false,
  failed: true,
  error: error.message || 'NOAA fetch failed',
  total: previous?.items?.length ?? 0,
  incoming: 0,
}
```

성공한 빈 응답만 실제 removal로 취급해 `mergeAdvisories()`와 `store.save()`를 거친다.
따라서 통신 실패가 “모든 SIGMET 해소” ChangeSet으로 발행되지 않는다.

- [ ] **Step 6: KIM/KTG는 실제 발행 revision을 반환**

KIM 성공 반환:

```js
const legacy = surfaceGrid ? store.save(TYPE, buildKimSurfaceWindFieldFromWindGrid(surfaceGrid)) : null
return {
  type: TYPE,
  revision: latestRunId,
  latestRun: candidate.tmfc,
  saved: true,
  legacy,
}
```

KTG 성공 반환:

```js
return {
  type: TYPE,
  revision: `ktg:${tmfc}:${collected.map((c) => c.hf).join(',')}`,
  tmfc,
  hours: collected.length,
  hfs: collected.map((c) => c.hf),
  altLevels: altLevelsFt.length,
}
```

`publishCollectorResult(type, result, occurredAt, {dataRoot})`는 `kim_surface_wind`/`ktg`의 `result.revision`이 있고 `!result.skipped`일 때만 발행한다. revision은 한 모델의 값만 쓰지 않고, 방금 원자 발행된 KIM `latestRunId`와 KTG `tmfc+hfs`를 store reader로 다시 읽어 SHA-256한 결합 revision을 사용한다. 따라서 두 모델 중 어느 쪽이 갱신돼도 `enroute_model` revision 하나가 현재 전체 단면 상태를 나타낸다.

```js
{
  source: 'enroute_model',
  revision: combinedModelRevision(dataRoot),
  affected: { model: type },
  occurredAt,
}
```

`runWithLock`은 성공 결과를 stats에 기록하기 전에 `publishCollectorResult(type, result, new Date().toISOString(), { dataRoot: config.storage.base_path })`를 호출한다.

- [ ] **Step 7: source change와 scheduler wiring 테스트**

Run:

```bash
node --test \
  backend/test/alert-source-changes.test.js \
  backend/test/store-change-detection.test.js \
  backend/test/overseas-weather-processor.test.js \
  backend/test/kim-scheduler.test.js \
  backend/test/ktg-processor.test.js
```

Expected: timestamp-only TAF는 무변화, 해외 SIGMET fetch 실패는 last-good 보존,
동일 model revision은 무발행, 새 KIM/KTG revision만 `enroute_model` event를 만든다.

- [ ] **Step 8: Commit**

```bash
git add backend/src/alerts/source-changes.js backend/test/alert-source-changes.test.js backend/test/store-change-detection.test.js backend/test/overseas-weather-processor.test.js backend/test/ktg-processor.test.js backend/src/store.js backend/src/index.js backend/src/processors/overseas-weather-processor.js backend/src/processors/kim-surface-wind-processor.js backend/src/processors/ktg-processor.js backend/test/kim-scheduler.test.js
git commit -m "feat: publish weather source change sets"
```

---

### Task 5: 후보 인덱스와 완전 유휴 one-shot AlertWatchEngine

**Files:**
- Create: `backend/src/alerts/watch-engine.js`
- Create: `backend/test/alert-watch-engine.test.js`
- Modify: `backend/src/alerts/watch-repository.js`

**Interfaces:**
- Consumes: `ChangeSet` from Task 4.
- Produces: `createAlertWatchEngine(deps) -> { recordSourceChange, runDue }`.
- `recordSourceChange(changeSet): { ignored?: 'idle'|'scheduled_only', dirty?: number }`.
- `runDue(now): Promise<{ evaluated, fired, nextWakeAt }>` and at most one timer.
- `createAlertWatchEngine` dependencies:

```js
{
  db,
  evaluateWatch,
  applyEvaluation,
  getCurrentRevisions,
  onOutboxReady: () => void,
  now: () => number,
  setTimeoutFn: (fn, delay) => timer,
  clearTimeoutFn: (timer) => void,
  debounceMs: 250,
}
```

- [ ] **Step 1: fake clock로 idle/future/active 실패 테스트 작성**

`backend/test/alert-watch-engine.test.js`:

```js
test('no open watch means no timer and source changes do not query candidates', async () => {
  const db = createDb(':memory:')
  let candidateQueries = 0
  const timers = fakeTimers()
  const engine = createAlertWatchEngine({
    db,
    evaluateWatch: async () => { throw new Error('must not evaluate') },
    applyEvaluation: () => ({ alerts: [] }),
    getCurrentRevisions: () => ({}),
    now: () => NOW,
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    onCandidateQuery: () => { candidateQueries += 1 },
  })

  const first = await engine.runDue(NOW)
  assert.equal(first.nextWakeAt, null)
  assert.equal(timers.pending(), 0)
  assert.deepEqual(engine.recordSourceChange(changeSet), { ignored: 'idle' })
  assert.equal(candidateQueries, 0)
})

test('future watch arms starts_at only and ignores source changes', async () => {
  seedWatch(db, { startsAt: iso(2), etd: iso(4), status: 'scheduled' })
  const result = await engine.runDue(NOW)
  assert.equal(result.nextWakeAt, iso(2))
  assert.equal(timers.pending(), 1)
  assert.deepEqual(engine.recordSourceChange(changeSet), { ignored: 'scheduled_only' })
})

test('RKPC TAF dirties only active watches indexed to RKPC', async () => {
  const rkpc = seedWatch(db, { airport: 'RKPC', status: 'active' })
  seedWatch(db, { airport: 'RKSI', status: 'active' })
  await engine.runDue(NOW)
  assert.equal(engine.recordSourceChange({
    source: 'taf', revision: 'taf-2', affected: { airports: ['RKPC'] }, occurredAt: iso(0),
  }).dirty, 1)
  assert.deepEqual(JSON.parse(
    db.prepare('SELECT dirty_sources_json FROM alert_watch_state WHERE watch_id=?').get(rkpc).dirty_sources_json
  ), ['taf'])
})

test('overlapping runDue calls coalesce into one evaluation pass', async () => {
  seedWatch(db, { airport: 'RKPC', status: 'active' })
  const gate = deferred()
  let evaluations = 0
  const engine = createEngine({
    evaluateWatch: async () => { evaluations += 1; await gate.promise; return evaluation },
  })
  const first = engine.runDue(NOW)
  const second = engine.runDue(NOW)
  gate.resolve()
  await Promise.all([first, second])
  assert.equal(evaluations, 1)
})

test('source change arriving during evaluation schedules one follow-up pass', async () => {
  const gate = deferred()
  const seenRevisions = []
  const engine = createEngine({
    evaluateWatch: async ({ currentRevisions }) => {
      seenRevisions.push(currentRevisions.taf)
      if (seenRevisions.length === 1) await gate.promise
      return evaluationFor(currentRevisions)
    },
  })
  const first = engine.runDue(NOW)
  publishStoreRevision('taf-2')
  engine.recordSourceChange({ ...tafChange, revision: 'taf-2' })
  gate.resolve()
  await first
  assert.equal(timers.pending(), 1)
  assert.equal(timers.lastDelay(), 250)
  await timers.fireLast()
  assert.deepEqual(seenRevisions, ['taf-1', 'taf-2'])
  assert.equal(readWatchState(db, watch.id).evaluatedRevisions.taf, 'taf-2')
})

test('evaluation failure stays dirty and receives a bounded retry boundary', async () => {
  const id = seedWatch(db, { airport: 'RKPC', status: 'active', dirtySources: ['taf'] })
  const engine = createEngine({ evaluateWatch: async () => { throw new Error('temporary') } })
  await engine.runDue(NOW)
  const state = readWatchState(db, id)
  assert.deepEqual(state.dirtySources, ['taf'])
  assert.equal(state.nextCheckAt, new Date(NOW + 60_000).toISOString())
})

test('a boundary 30 days away is re-armed in safe timeout chunks', async () => {
  seedWatch(db, { status: 'scheduled', startsAt: new Date(NOW + 30 * 86400000).toISOString() })
  await engine.runDue(NOW)
  assert.equal(timers.lastDelay(), MAX_TIMER_MS)
  timers.fireLast()
  assert.equal(evaluateCalls, 0)
  assert.ok(timers.lastDelay() < MAX_TIMER_MS)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/alert-watch-engine.test.js`

Expected: module missing으로 FAIL.

- [ ] **Step 3: repository 후보/수명주기 query 구현**

`watch-repository.js`에 다음 함수만 export한다.

```js
export function transitionWatchTimes(db, nowIso) {
  db.prepare("UPDATE alert_watches SET status='active', updated_at=? WHERE status='scheduled' AND starts_at<=?")
    .run(nowIso, nowIso)
  db.prepare("UPDATE alert_watches SET status='completed', updated_at=? WHERE status='active' AND etd<=?")
    .run(nowIso, nowIso)
  db.prepare("UPDATE alert_watches SET status='expired', updated_at=? WHERE status='completed' AND expires_at<=?")
    .run(nowIso, nowIso)
}

export function candidateWatchIds(db, changeSet) {
  if (['taf', 'taf_overseas', 'warning'].includes(changeSet.source)) {
    const airports = changeSet.affected?.airports ?? []
    if (!airports.length) return []
    const slots = airports.map(() => '?').join(',')
    return db.prepare(`
      SELECT DISTINCT w.id
      FROM alert_watches w
      JOIN watch_airports a ON a.watch_id=w.id
      WHERE w.status='active' AND a.icao IN (${slots})
    `).all(...airports).map((row) => row.id)
  }
  return db.prepare(`
    SELECT w.id
    FROM alert_watches w
    JOIN watch_dependencies d ON d.watch_id=w.id
    WHERE w.status='active' AND d.source=?
  `).all(changeSet.source).map((row) => row.id)
}
```

`nextWatchBoundary(db)`는 scheduled `starts_at`, active `etd`/`next_check_at`, completed `expires_at` 중 최소 UTC ISO를 반환한다.

같은 repository에 engine이 쓰는 state helper를 실제 이름으로 추가한다.

```js
export function readWatchState(db, watchId) {
  const row = db.prepare('SELECT * FROM alert_watch_state WHERE watch_id=?').get(watchId)
  return {
    snapshot: parse(row?.snapshot_json, null),
    evaluatedRevisions: parse(row?.evaluated_revisions_json, {}),
    dirtySources: parse(row?.dirty_sources_json, []),
    nextCheckAt: row?.next_check_at ?? null,
  }
}

export function lastRevision(db, watchId, source) {
  return readWatchState(db, watchId).evaluatedRevisions[source] ?? null
}

export function markDirty(db, watchIds, source) {
  const update = db.prepare('UPDATE alert_watch_state SET dirty_sources_json=? WHERE watch_id=?')
  db.transaction(() => {
    for (const watchId of watchIds) {
      const state = readWatchState(db, watchId)
      update.run(JSON.stringify([...new Set([...state.dirtySources, source])].sort()), watchId)
    }
  })()
}

export function scheduleWatchRetry(db, watchId, nowIso, delayMs = 60_000) {
  const next = new Date(Date.parse(nowIso) + delayMs).toISOString()
  db.prepare('UPDATE alert_watch_state SET next_check_at=? WHERE watch_id=?')
    .run(next, watchId)
  return next
}

export function listActiveWatches(db) {
  return db.prepare("SELECT * FROM alert_watches WHERE status='active' ORDER BY etd,id").all()
}

export function countWatchStatuses(db) {
  const rows = db.prepare(`
    SELECT status,COUNT(*) n FROM alert_watches
    WHERE status IN ('scheduled','active','completed')
    GROUP BY status
  `).all()
  const counts = Object.fromEntries(rows.map((row) => [row.status, row.n]))
  return {
    open: (counts.scheduled ?? 0) + (counts.active ?? 0) + (counts.completed ?? 0),
    active: counts.active ?? 0,
  }
}
```

- [ ] **Step 4: engine은 memory summary로 idle fast-path 구현**

`watch-engine.js` 핵심:

```js
export const MAX_TIMER_MS = 2_147_000_000

export function createAlertWatchEngine(deps) {
  const nowMs = deps.now ?? Date.now
  const setTimer = deps.setTimeoutFn ?? setTimeout
  const clearTimer = deps.clearTimeoutFn ?? clearTimeout
  const debounceMs = deps.debounceMs ?? 250
  let timer = null
  let openCount = null
  let activeCount = 0
  let running = null
  let rerunRequested = false

  function refreshCounts() {
    const counts = countWatchStatuses(deps.db)
    openCount = counts.open
    activeCount = counts.active
  }

  function arm(nextIso) {
    if (timer) clearTimer(timer)
    timer = null
    if (!nextIso) return
    const remaining = Math.max(0, Date.parse(nextIso) - nowMs())
    const delay = Math.min(remaining, MAX_TIMER_MS)
    timer = setTimer(() => {
      if (remaining > MAX_TIMER_MS) arm(nextIso)
      else runDue(nowMs()).catch(deps.onError ?? console.error)
    }, delay)
  }

  function recordSourceChange(changeSet) {
    if (openCount === 0) return { ignored: 'idle' }
    if (activeCount === 0) return { ignored: 'scheduled_only' }
    deps.onCandidateQuery?.()
    const ids = candidateWatchIds(deps.db, changeSet)
      .filter((id) => lastRevision(deps.db, id, changeSet.source) !== changeSet.revision)
    if (!ids.length) return { dirty: 0 }
    markDirty(deps.db, ids, changeSet.source)
    if (running) rerunRequested = true
    else arm(new Date(nowMs() + debounceMs).toISOString())
    return { dirty: ids.length }
  }

  function runDue(now = nowMs()) {
    if (running) return running
    running = (async () => {
      const nowIso = new Date(now).toISOString()
      transitionWatchTimes(deps.db, nowIso)
      const result = await evaluateDueWatches(deps, nowIso)
      refreshCounts()
      const nextWakeAt = rerunRequested
        ? new Date(nowMs() + debounceMs).toISOString()
        : nextWatchBoundary(deps.db)
      rerunRequested = false
      arm(nextWakeAt)
      return { ...result, nextWakeAt }
    })().finally(() => { running = null })
    return running
  }

  refreshCounts()
  return { recordSourceChange, runDue }
}
```

`evaluateDueWatches`는 baseline, dirty source, 서버 정지 중 revision drift를 한 경로로 합친다.

```js
async function evaluateDueWatches(deps, nowIso) {
  const currentRevisions = deps.getCurrentRevisions()
  let evaluated = 0
  let fired = 0
  for (const watch of listActiveWatches(deps.db)) {
    const state = readWatchState(deps.db, watch.id)
    const dirty = new Set(state.dirtySources)
    if (!state.snapshot) {
      for (const source of Object.keys(currentRevisions)) dirty.add(source)
    } else {
      for (const [source, revision] of Object.entries(currentRevisions)) {
        if (revision && state.evaluatedRevisions[source] !== revision) dirty.add(source)
      }
    }
    if (!dirty.size && (!state.nextCheckAt || state.nextCheckAt > nowIso)) continue
    try {
      const evaluation = await deps.evaluateWatch({
        watch, state, dirtySources: [...dirty], currentRevisions, now: nowIso,
      })
      const applied = deps.applyEvaluation(deps.db, {
        watch,
        evaluation,
        currentRevisions: deps.getCurrentRevisions(),
        now: nowIso,
      })
      if (applied.outboxIds?.length) deps.onOutboxReady?.()
      evaluated += 1
      fired += applied.alerts.length
    } catch (error) {
      scheduleWatchRetry(deps.db, watch.id, nowIso, 60_000)
      deps.onError?.(error, watch)
    }
  }
  return { evaluated, fired }
}
```

`runDue()`는 진행 중 Promise가 있으면 그 Promise를 그대로 반환해 API/timer 호출이
겹쳐도 동일 watch를 동시에 평가하지 않는다. 평가 중 들어온 source change는
`rerunRequested`만 세우고 현재 pass가 끝난 뒤 debounce one-shot을 하나 만든다. 실패
watch는 dirty source를 유지하고 `next_check_at=now+60초`를 기록한다. 성공 evaluation이
반환한 `nextCheckAt`은 Task 7 transaction에서 저장된다. apply 직전에 다시 읽은 current
revision과 evaluation이 실제 사용한 revision이 다르면 해당 source는 dirty에서 제거하지
않는다. outbox transaction이 commit된 뒤 `outboxIds`가 있을 때만 optional
`onOutboxReady()`를 호출한다.

`arm()`은 기존 timer를 먼저 `clearTimer(timer)`로 지우고, 다음 시각이 없으면 timer를
만들지 않는다. Node timeout 상한을 넘는 delay는 `MAX_TIMER_MS=2_147_000_000`으로
잘라서 target 시각까지 `arm(nextIso)`만 반복하며, target 전에는 `runDue()`를 호출하지
않는다.

- [ ] **Step 5: standalone engine gate 유지**

이 task에서는 engine을 server에 연결하지 않는다. evaluator/condition store/outbox가 아직 없기 때문에 test double로 public interface와 timer/candidate 동작만 확정한다. 실제 startup wiring은 세 의존성이 완성된 Task 8에서 한 번만 추가한다.

- [ ] **Step 6: engine 테스트**

Run: `node --test backend/test/alert-watch-engine.test.js backend/test/alert-active.test.js backend/test/kim-scheduler.test.js`

Expected: idle 0 timer, future 1 timer, active source candidate만 dirty, 겹친 run은 1회로
합쳐지고 한 watch 실패는 dirty+60초 retry를 남기며 다른 watch를 막지 않음. 30일 뒤
boundary는 overflow 없이 chunk re-arm됨.

- [ ] **Step 7: Commit**

```bash
git add backend/src/alerts/watch-engine.js backend/test/alert-watch-engine.test.js backend/src/alerts/watch-repository.js
git commit -m "feat: run alert watches from source changes"
```

---

### Task 6: source group별 부분 평가와 현재 condition 도출

**Files:**
- Create: `backend/src/alerts/evaluator.js`
- Create: `backend/test/alert-evaluator.test.js`
- Modify: `backend/src/briefing/briefing-composer.js`
- Modify: `backend/src/alerts/diff.js`
- Modify: `backend/test/alert-diff.test.js`
- Modify: `backend/src/alerts/scheduler.js`

**Interfaces:**
- Produces: `SOURCE_GROUP` mapping:

```js
{
  taf: 'airport',
  taf_overseas: 'airport',
  warning: 'hazard',
  sigmet: 'hazard',
  sigmet_overseas: 'hazard',
  airmet: 'hazard',
  typhoon: 'hazard',
  enroute_model: 'enroute',
}
```

- Produces: `evaluateWatch({ watch, state, dirtySources, currentRevisions, dataRoot, now }): Evaluation`.
- Produces: `readCurrentRevisions(dataRoot): Record<string,string|null>`.
- `Evaluation = { snapshot, evaluatedRevisions, groups, conditions, baseline, nextCheckAt }`.
- Produces: `deriveConditions(snapshot, { minima, groups }): Condition[]`.
- `Condition = { key, sourceGroup, fingerprint, type, severity, target, from, to, sourceId }`.

- [ ] **Step 1: unrelated source 계산을 호출하지 않는 실패 테스트 작성**

```js
test('TAF change evaluates airport group only', async () => {
  const calls = []
  const result = await evaluateWatch({
    watch,
    state: { snapshot: previous, evaluatedRevisions: {} },
    dirtySources: ['taf'],
    dataRoot: '/unused',
    readers: {
      airport: () => { calls.push('airport'); return airportSnapshot },
      hazard: () => { calls.push('hazard'); throw new Error('must not run') },
      enroute: () => { calls.push('enroute'); throw new Error('must not run') },
      revisions: () => ({ taf: 'taf-2' }),
    },
  })
  assert.deepEqual(calls, ['airport'])
  assert.deepEqual(result.groups, ['airport'])
  assert.deepEqual(result.snapshot.hazard, previous.hazard)
})

test('baseline evaluates all groups from a real persisted empty state row', async () => {
  const id = insertWatch(db, {
    routeSnapshot: routeWithSidStarAndEnRouteRange,
    status: 'active',
  })
  const persistedWatch = db.prepare('SELECT * FROM alert_watches WHERE id=?').get(id)
  const state = readWatchState(db, id)
  const result = await evaluateWatch({ watch: persistedWatch, state, dirtySources: [] })
  assert.equal(result.baseline, true)
  assert.deepEqual(result.groups.sort(), ['airport', 'enroute', 'hazard'])
  assert.ok(result.conditions.some((c) => c.key === 'CEIL:RKPC'))
  assert.deepEqual(capturedRequest.routeModel, routeWithSidStarAndEnRouteRange.routeModel)
})

test('elapsed airport boundary reevaluates only its group without a source revision', async () => {
  const result = await evaluateWatch({
    watch,
    state: {
      snapshot: { ...previous, boundaries: { airport: T0, hazard: T2 } },
      evaluatedRevisions: { taf: 'same' },
    },
    dirtySources: [],
    now: T1,
    readers,
  })
  assert.deepEqual(result.groups, ['airport'])
  assert.deepEqual(calls, ['airport'])
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/alert-evaluator.test.js backend/test/alert-diff.test.js`

Expected: `evaluateWatch`/`deriveConditions`가 없어 FAIL.

- [ ] **Step 3: briefing composer의 adverse 조립을 재사용 가능한 export로 추출**

`briefing-composer.js`에 있던 route axis + 공항경보 + SIGMET/AIRMET/태풍 조립을 `export function composeAdverse(request, data)`로 감싼다. 기존 `composeBriefing()`도 이 함수를 호출해 판정 코드가 한 벌만 남게 한다.

```js
export function composeAdverse(request, data) {
  const axis = buildRouteAxis(request.routeGeometry, 2000)
  return buildHazardSection({
    sigmet: mergeAdvisoryPayloads(data?.sigmet, data?.sigmetOverseas).items ?? [],
    airmet: data?.airmet?.items ?? [],
    axis,
    etd: request.etd,
    eta: request.eta,
    cruiseAltitudeFt: Number(request.plannedCruiseAltitudeFt) || 0,
    enRouteRange: request.routeModel?.enRouteRange ?? null,
    airportWarnings: buildAirportWarningHazards(
      data?.warning, airportRoles(request), request.etd, request.eta
    ),
    typhoons: matchTyphoonHazards({
      typhoons: data?.typhoon?.typhoons ?? [],
      axis,
      etd: request.etd,
      eta: request.eta,
      enRouteRange: request.routeModel?.enRouteRange ?? null,
      airports: airportCoordinates(request),
    }),
  })
}
```

- [ ] **Step 4: scheduler 순수 함수와 group readers를 evaluator로 이동**

`buildBriefingRequest`, `departureTs`, `airportSnap`, `enrouteLevels`를 `evaluator.js`로
옮긴다. 기존 함수가 `route.payload`를 읽던 부분은 그대로 복사하지 말고 watch adapter로
바꾼다. `buildBriefingRequest(watch)`는 `watch.route_snapshot_json`을 parse하고 DB의
`etd`/`eta`를 우선 적용하되 snapshot의 `routeModel` 전체를 그대로 보존한다. SID/STAR,
`routeGeometry`, `routeModel.enRouteRange`를 다시 조립하거나 누락하지 않는다.

```js
export function buildBriefingRequest(watch) {
  const snapshot = JSON.parse(watch.route_snapshot_json)
  return {
    ...snapshot,
    etd: watch.etd ?? snapshot.etd,
    eta: watch.eta ?? snapshot.eta,
    routeModel: snapshot.routeModel ?? null,
  }
}
```

reader는 다음처럼 기존 모듈을 재사용한다.

```js
function readAirport(request) {
  const tafByIcao = mergeAirports(store.getCached('taf'), store.getCached('taf_overseas'))
  const dest = buildDestination(
    tafByIcao[request.arrivalAirport],
    request.eta,
    {
      alternateTaf: tafByIcao[request.alternateAirport] ?? null,
      alternateIcao: request.alternateAirport ?? null,
      flightRule: request.flightRule,
    },
  )
  return {
    dep: airportDepartureSnapshot(tafByIcao, request),
    dest: airportDestinationSnapshot(tafByIcao, request, dest.alternateRequired),
    altn: airportAlternateSnapshot(tafByIcao, request),
  }
}

function readHazard(request) {
  const adverse = composeAdverse(request, {
    sigmet: store.getCached('sigmet'),
    sigmetOverseas: store.getCached('sigmet_overseas'),
    airmet: store.getCached('airmet'),
    warning: store.getCached('warning'),
    typhoon: store.getCached('typhoon'),
  })
  return { hazards: toAlertHazards(adverse.hazards) }
}

function readEnroute(request, dataRoot) {
  return { enroute: enrouteLevels(buildEnrouteModel({
    root: dataRoot,
    routeGeometry: request.routeGeometry,
    body: request,
    cruiseAltitudeFt: request.plannedCruiseAltitudeFt,
  })) }
}

export function readCurrentRevisions(dataRoot) {
  return {
    taf: store.cache.taf.hash,
    taf_overseas: store.cache.taf_overseas.hash,
    sigmet: store.cache.sigmet.hash,
    sigmet_overseas: store.cache.sigmet_overseas.hash,
    airmet: store.cache.airmet.hash,
    warning: store.cache.warning.hash,
    typhoon: store.cache.typhoon.hash,
    enroute_model: combinedModelRevision(dataRoot),
  }
}
```

`evaluateWatch()`는 engine이 pass 시작 시 넘긴 `currentRevisions`를 이번 evaluation이 실제
소비한 revision으로 기록한다. 직접 호출 test에서만 생략을 허용해
`readCurrentRevisions(dataRoot)`를 fallback으로 읽는다.

group 선택은 baseline이면 전체, 그 외에는 dirty source가 가리키는 group과
`snapshot.boundaries[group] <= now`인 group의 합집합이다. 평가가 끝나면
`snapshot.boundaries`를 group별로 갱신하고 `nextCheckAt`은 현재 시각보다 뒤인 사용 중 TAF 구간 시작/종료,
SIGMET/AIRMET/공항경보/태풍 유효 시작·종료, 모델 시간 bucket 경계 중 가장 이른 값이다.
해당 group을 이번에 다시 계산하지 않았으면 기존 snapshot에 저장된 group boundary를
재사용한다. 후보가 없으면 `null`이다. 이 값이 있어야 새 snapshot publication이 없어도
예보 구간이 넘어가는 순간 condition을 다시 판정한다.

- [ ] **Step 5: 현재 condition 순수 도출**

`diff.js`에 `deriveConditions`를 추가한다. baseline 여부와 무관하게 현재 firing condition 전체를 반환한다.

```js
export function deriveConditions(snapshot, { minima: configured, groups = ['airport', 'hazard', 'enroute'] } = {}) {
  const minima = effectiveMinima(configured)
  const conditions = []
  if (groups.includes('airport')) {
    addAirportConditions(conditions, snapshot.airport?.dep, minima, 'DEP')
    addAirportConditions(conditions, snapshot.airport?.dest, minima, 'DEST')
    addAirportConditions(conditions, snapshot.airport?.altn, minima, 'ALTN')
    if (snapshot.airport?.dest?.alternateRequired) {
      conditions.push(condition('ALTERNATE_FLIP', snapshot.airport.dest.icao, 'HIGH', 'airport'))
    }
    if (snapshot.airport?.dep?.ts) {
      conditions.push(condition('WX', snapshot.airport.dep.icao, 'HIGH', 'airport', { to: 'TS' }))
    }
  }
  if (groups.includes('hazard')) addHazardConditions(conditions, snapshot.hazard?.hazards)
  if (groups.includes('enroute')) addEnrouteConditions(conditions, snapshot.enroute)
  return conditions
}
```

CEIL/VIS key는 `CEIL:<ICAO>`/`VIS:<ICAO>`, hazard key는 `ENROUTE_HAZARD:<sourceId>`, enroute key는 `ENROUTE_ICE_TURB:<icing|turb>`를 사용한다.

- [ ] **Step 6: evaluator와 기존 briefing 회귀 테스트**

Run: `node --test backend/test/alert-evaluator.test.js backend/test/alert-diff.test.js backend/test/briefing-composer.test.js backend/test/typhoon-briefing.test.js`

Expected: 부분 평가 호출 수, 실제 watch row의 SID/STAR/`enRouteRange` 보존,
`nextCheckAt` 산출과 기존 브리핑 payload 모두 PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/alerts/evaluator.js backend/test/alert-evaluator.test.js backend/src/briefing/briefing-composer.js backend/src/alerts/diff.js backend/test/alert-diff.test.js backend/src/alerts/scheduler.js
git commit -m "refactor: evaluate alert source groups independently"
```

---

### Task 7: condition 전이와 alert/outbox 원자 기록

**Files:**
- Create: `backend/src/alerts/condition-store.js`
- Create: `backend/test/alert-condition-store.test.js`
- Modify: `backend/src/alerts/watch-engine.js`
- Modify: `backend/test/alert-watch-engine.test.js`
- Modify: `backend/src/alerts/sender.js`
- Modify: `backend/test/alert-sender.test.js`

**Interfaces:**
- Produces: `applyEvaluation(db, {watch,evaluation,currentRevisions,now}): { alerts, outboxIds }`.
- 첫 baseline은 firing state를 저장하지만 `triggered_alerts`/outbox를 만들지 않는다.
- 동일 firing은 무발송, firing→resolved→firing은 새 alert를 만든다.
- 한 평가의 HIGH/CRITICAL alert를 채널별 한 outbox row로 묶는다.

- [ ] **Step 1: baseline/dedup/re-fire/rollback 실패 테스트 작성**

```js
test('baseline stores firing state without history; resolve then re-fire creates a new event', () => {
  const first = applyEvaluation(db, {
    watch,
    evaluation: { baseline: true, groups: ['airport'], conditions: [ceilCondition], snapshot, evaluatedRevisions },
    currentRevisions: evaluatedRevisions,
    now: T0,
  })
  assert.equal(first.alerts.length, 0)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM triggered_alerts').get().n, 0)
  assert.equal(db.prepare('SELECT status FROM alert_condition_state').get().status, 'firing')

  applyEvaluation(db, {
    watch,
    evaluation: { baseline: false, groups: ['airport'], conditions: [], snapshot: clearSnapshot, evaluatedRevisions },
    currentRevisions: evaluatedRevisions,
    now: T1,
  })
  const fired = applyEvaluation(db, {
    watch,
    evaluation: { baseline: false, groups: ['airport'], conditions: [ceilCondition], snapshot, evaluatedRevisions },
    currentRevisions: evaluatedRevisions,
    now: T2,
  })
  assert.equal(fired.alerts.length, 1)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM alert_outbox').get().n, 2)

  const duplicate = applyEvaluation(db, {
    watch,
    evaluation: { baseline: false, groups: ['airport'], conditions: [ceilCondition], snapshot, evaluatedRevisions },
    currentRevisions: evaluatedRevisions,
    now: T2,
  })
  assert.equal(duplicate.alerts.length, 0)
})

test('restart keeps baseline and condition state, then evaluates one persisted revision drift', async () => {
  const file = temporaryDbPath()
  const firstDb = createDb(file)
  const watchId = seedActiveWatch(firstDb)
  await createEngine(firstDb, { revisions: { taf: 'taf-1' } }).runDue(NOW)
  firstDb.close()

  const restartedDb = createDb(file)
  const evaluateCalls = []
  const restarted = createEngine(restartedDb, {
    revisions: { taf: 'taf-2' },
    onEvaluate: (args) => evaluateCalls.push(args),
  })
  await restarted.runDue(NOW + 1000)

  assert.equal(evaluateCalls.length, 1)
  assert.deepEqual(evaluateCalls[0].dirtySources, ['taf'])
  assert.equal(
    restartedDb.prepare('SELECT status FROM alert_condition_state WHERE watch_id=?')
      .get(watchId).status,
    'firing',
  )
  assert.equal(restartedDb.prepare(
    'SELECT COUNT(*) n FROM triggered_alerts WHERE watch_id=?'
  ).get(watchId).n, 0, 'restart must not recreate baseline alerts')
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/alert-condition-store.test.js`

Expected: module missing으로 FAIL.

- [ ] **Step 3: group 한정 condition 전이 구현**

`applyEvaluation`은 `db.transaction()` 하나 안에서 다음 순서를 지킨다.

```js
const existing = listConditionStates(db, watch.id, evaluation.groups)
const current = new Map(evaluation.conditions.map((item) => [item.key, item]))

for (const state of existing) {
  if (state.status === 'firing' && !current.has(state.condition_key)) {
    markResolved.run(nowIso, watch.id, state.condition_key)
  }
}

for (const condition of evaluation.conditions) {
  const before = existingByKey.get(condition.key)
  const opens = !before || before.status === 'inactive' || before.status === 'resolved'
  upsertFiring.run(/* watch id, key, group, fingerprint, opened/resolved fields */)
  if (!evaluation.baseline && opens) alerts.push(insertTriggeredAlert(db, watch, condition, nowIso))
}

updateWatchState(db, watch.id, {
  ...evaluation,
  nextCheckAt: evaluation.nextCheckAt,
}, currentRevisions, nowIso)
if (alerts.some((alert) => shouldPush(alert.severity))) {
  outboxIds.push(...insertGroupedOutbox(db, watch, alerts, nowIso))
}
```

부분 평가 때는 `evaluation.groups`에 속한 condition만 resolve한다. 다른 group condition은 그대로 둔다.

- [ ] **Step 4: channel별 묶음 outbox payload 생성**

`delivery_key`는 `${watch.id}:${channel}:${alertIds.join(',')}`를 SHA-256으로 해시한다. `delivery_state_json`은 Web Push가 성공하거나 404/410으로 끝난 subscription ID를 기록해, 한 기기 성공 뒤 다른 기기가 일시 실패해도 재시도에서 성공한 기기로 다시 보내지 않는다. payload는 sender의 기존 포맷을 재사용한다.

```js
const payload = {
  title: '경로 예보변화 알림',
  body: composeMessage(pushAlerts, watch, { now }),
  url: `/?flight=${watch.id}`,
  alertIds,
  watchId: watch.id,
  routeId: watch.route_id,
}
```

관리자 여부와 실제 Push 구독 유무는 worker가 처리한다. 평가 transaction은 두 channel 모두 `pending`으로 기록해 실패 시 이력을 잃지 않는다.

- [ ] **Step 5: engine에 실제 evaluator/applyEvaluation 연결**

`runDue()`는 watch별로 `evaluateWatch()` 후 apply 직전
`getCurrentRevisions()`를 다시 읽어 `applyEvaluation()`에 넘긴다.
`updateWatchState()`는 `evaluation.evaluatedRevisions[source] ===
currentRevisions[source]`인 성공 source만 `dirty_sources_json`에서 빼고
`evaluation.nextCheckAt`을 `alert_watch_state.next_check_at`에 저장한다. 예외가 난 watch는
dirty 상태를 유지하며 Task 5의 bounded retry 시각만 갱신한다.

- [ ] **Step 6: condition/outbox/engine 테스트**

Run: `node --test backend/test/alert-condition-store.test.js backend/test/alert-watch-engine.test.js backend/test/alert-sender.test.js`

Expected: baseline 0건, 지속 0건, 해소 후 재발 1건, HIGH/CRITICAL group당 outbox 2건,
파일 DB 재시작 뒤 condition/baseline 유지와 persisted revision drift 평가 정확히 1회.

- [ ] **Step 7: Commit**

```bash
git add backend/src/alerts/condition-store.js backend/test/alert-condition-store.test.js backend/src/alerts/watch-engine.js backend/test/alert-watch-engine.test.js backend/src/alerts/sender.js backend/test/alert-sender.test.js
git commit -m "feat: persist alert condition transitions and outbox"
```

---

### Task 8: outbox worker로 Telegram/Web Push 전달

**Files:**
- Create: `backend/src/alerts/outbox-worker.js`
- Create: `backend/test/alert-outbox-worker.test.js`
- Modify: `backend/src/alerts/sender.js`
- Modify: `backend/src/push/send.js`
- Modify: `backend/src/me/push.js`
- Create: `backend/test/me-push.test.js`
- Modify: `backend/test/me-notifications.test.js`
- Modify: `backend/src/alerts/watch-engine.js`
- Modify: `backend/test/alert-watch-engine.test.js`
- Modify: `backend/src/index.js`
- Modify: `backend/server.js`

**Interfaces:**
- Produces: `createOutboxWorker({db,sendTelegramImpl,sendPushImpl,now,setTimeoutFn,clearTimeoutFn}) -> { start,wake,runDue,stop }`.
- `runDue(now): Promise<{sent,retried,skipped,pruned,nextWakeAt}>`.
- worker는 watch engine과 분리된 delivery one-shot timer를 최대 하나만 소유한다.
- 404/410 Push subscription은 즉시 삭제한다.
- 그 외 외부 I/O 실패는 횟수 제한 없이 `retry`와 최대 60분 capped exponential backoff를 기록한다.

- [ ] **Step 1: 성공/만료/일시실패 실패 테스트 작성**

```js
test('web push sends once to each subscription and prunes 410', async () => {
  const calls = []
  seedOutbox(db, { channel: 'web_push', payload })
  const good = seedSubscription(db, watch.user_id, 'https://push/good')
  const stale = seedSubscription(db, watch.user_id, 'https://push/stale')
  const worker = createOutboxWorker({
    db,
    now: () => NOW,
    sendPushImpl: async (subscription, body) => {
      calls.push({ subscription, body })
      if (subscription.endpoint.endsWith('/stale')) {
        throw Object.assign(new Error('gone'), { statusCode: 410 })
      }
    },
    sendTelegramImpl: async () => ({ ok: true, status: 200 }),
  })

  const result = await worker.runDue(NOW)
  assert.equal(result.sent, 1)
  assert.equal(result.pruned, 1)
  assert.equal(calls.length, 2)
  assert.ok(db.prepare('SELECT 1 FROM push_subscriptions WHERE id=?').get(good))
  assert.equal(db.prepare('SELECT 1 FROM push_subscriptions WHERE id=?').get(stale), undefined)
  assert.equal(db.prepare('SELECT status FROM alert_outbox').get().status, 'sent')
})

test('temporary failure remains retry with a one-shot next_attempt_at', async () => {
  seedOutbox(db, { channel: 'telegram', payload })
  const worker = createOutboxWorker({
    db,
    now: () => NOW,
    sendTelegramImpl: async () => ({ ok: false, status: 503 }),
  })
  const result = await worker.runDue(NOW)
  assert.equal(result.retried, 1)
  assert.equal(db.prepare('SELECT status FROM alert_outbox').get().status, 'retry')
  assert.ok(Date.parse(result.nextWakeAt) > NOW)
})

test('retry skips a subscription already delivered before a sibling failed', async () => {
  const good = seedSubscription(db, watch.user_id, 'https://push/good')
  seedSubscription(db, watch.user_id, 'https://push/flaky')
  seedOutbox(db, { channel: 'web_push', payload })
  const calls = []
  const worker = createOutboxWorker({
    db,
    now: () => NOW,
    sendPushImpl: async (subscription) => {
      calls.push(subscription.endpoint)
      if (subscription.endpoint.endsWith('/flaky') && calls.length === 2) {
        throw Object.assign(new Error('temporary'), { statusCode: 503 })
      }
    },
  })
  await worker.runDue(NOW)
  await worker.runDue(NOW + 60000)
  assert.equal(calls.filter((endpoint) => endpoint.endsWith('/good')).length, 1)
  assert.ok(JSON.parse(
    db.prepare('SELECT delivery_state_json FROM alert_outbox').get().delivery_state_json
  ).pushSubscriptionIds.includes(good))
})

test('overlapping runDue calls claim and deliver each row once', async () => {
  seedOutbox(db, { channel: 'telegram', payload })
  const gate = deferred()
  let sends = 0
  const worker = createOutboxWorker({
    db,
    sendTelegramImpl: async () => { sends += 1; await gate.promise; return { ok: true } },
  })
  const first = worker.runDue(NOW)
  const second = worker.runDue(NOW)
  gate.resolve()
  await Promise.all([first, second])
  assert.equal(sends, 1)
})

test('start recovers abandoned sending once and maintains its own retry timer', async () => {
  seedOutbox(db, { channel: 'telegram', payload, status: 'sending' })
  const timers = fakeTimers()
  const worker = createOutboxWorker({
    db,
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    sendTelegramImpl: async () => ({ ok: false, status: 503 }),
  })
  await worker.start()
  assert.equal(db.prepare('SELECT status FROM alert_outbox').get().status, 'retry')
  assert.equal(timers.pending(), 1)
})

test('terminal channel state is projected to referenced alert rows atomically', async () => {
  const { alertId } = seedOutbox(db, { channel: 'web_push', payload })
  await createOutboxWorker({
    db,
    sendPushImpl: async () => {},
  }).runDue(NOW)
  const alert = db.prepare(
    'SELECT pushed_at,channel_status FROM triggered_alerts WHERE id=?'
  ).get(alertId)
  assert.equal(alert.pushed_at, new Date(NOW).toISOString())
  assert.equal(JSON.parse(alert.channel_status).web_push, 'sent')
})

test('empty startup wakes when a later evaluation commits an outbox row', async () => {
  const timers = fakeTimers()
  let sends = 0
  const watch = seedActiveWatchWithBaseline(db, { conditions: [] })
  seedSubscription(db, watch.user_id, 'https://push/device')
  const worker = createOutboxWorker({
    db,
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    sendPushImpl: async () => { sends += 1 },
  })
  await worker.start()
  assert.equal(timers.pending(), 0)

  const engine = createEngine({
    onOutboxReady: worker.wake,
    applyEvaluation: (db, input) => applyEvaluation(db, input),
    evaluateWatch: async () => firingEvaluation,
  })
  await engine.runDue(NOW)
  assert.equal(timers.pending(), 1)
  await timers.fireLast()
  assert.equal(sends, 1)
  assert.equal(
    db.prepare("SELECT status FROM alert_outbox WHERE channel='web_push'").get().status,
    'sent',
  )
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/alert-outbox-worker.test.js backend/test/me-push.test.js backend/test/me-notifications.test.js`

Expected: outbox worker module missing으로 FAIL.

- [ ] **Step 3: due row claim과 재시도 구현**

단일 프로세스 SQLite이므로 외부 queue/lease manager를 만들지 않는다. `start()`가
프로세스 시작 시 딱 한 번 `sending` row를 `retry`로 복구한 뒤 `runDue()`를 호출한다.
일반 claim 경로는 이미 진행 중인 `sending`을 건드리지 않는다. `runDue()`도 watch engine과
같이 진행 중 Promise를 공유해 process 내부 겹친 실행을 한 번으로 합친다.

```js
function recoverAbandoned(db, nowIso) {
  db.prepare(
    "UPDATE alert_outbox SET status='retry',next_attempt_at=?,updated_at=? WHERE status='sending'"
  ).run(nowIso, nowIso)
}

function claimDue(db, nowIso) {
  return db.transaction(() => {
    const rows = db.prepare(`
      SELECT * FROM alert_outbox
      WHERE status IN ('pending','retry') AND next_attempt_at<=?
      ORDER BY id
      LIMIT 50
    `).all(nowIso)
    const claim = db.prepare(
      "UPDATE alert_outbox SET status='sending',updated_at=? WHERE id=? AND status IN ('pending','retry')"
    )
    return rows.filter((row) => claim.run(nowIso, row.id).changes === 1)
  })()
}

function retryAt(attempt, now) {
  const minutes = Math.min(2 ** Math.max(0, attempt), 60)
  return new Date(now + minutes * 60000).toISOString()
}
```

일시 실패는 attempt 수와 무관하게 계속 `retry`로 남기고 backoff만 최대 60분으로 제한한다.
검증 불가능한 malformed persisted payload만 `skipped:invalid_payload`로 종결한다. `dead`
상태와 임의 횟수 제한은 두지 않는다.

- [ ] **Step 4: Telegram 관리자 정책과 Web Push 구독 fan-out**

Telegram row는 user role이 admin이 아니면 `skipped:not_admin`, 환경 변수가 없으면 `skipped:no_telegram_env`로 완료한다. Web Push row는 해당 user 구독이 없으면 `skipped:no_subscription`으로 완료한다.

```js
function saveDeliveryState(outboxId, state) {
  db.prepare('UPDATE alert_outbox SET delivery_state_json=?,updated_at=? WHERE id=?')
    .run(JSON.stringify(state), new Date(now()).toISOString(), outboxId)
}

async function deliverWebPush(row, payload) {
  const deliveryState = JSON.parse(row.delivery_state_json || '{}')
  const completed = new Set(deliveryState.pushSubscriptionIds || [])
  const allSubscriptions = db.prepare(
    'SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?'
  ).all(row.user_id)
  if (!allSubscriptions.length) return { skipped: 'no_subscription', pruned: 0 }
  const subscriptions = allSubscriptions.filter((subscription) => !completed.has(subscription.id))
  if (!subscriptions.length) return { delivered: 0, pruned: 0, completed: true }
  let delivered = 0
  let pruned = 0
  for (const sub of subscriptions) {
    try {
      await sendPushImpl(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      delivered += 1
      completed.add(sub.id)
      saveDeliveryState(row.id, { pushSubscriptionIds: [...completed] })
    } catch (error) {
      if (error.statusCode !== 404 && error.statusCode !== 410) throw error
      db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(sub.id)
      completed.add(sub.id)
      saveDeliveryState(row.id, { pushSubscriptionIds: [...completed] })
      pruned += 1
    }
  }
  return { delivered, pruned }
}
```

각 outbox row가 `sent` 또는 `skipped`로 끝날 때 그 status 변경과
`alert_ids_json`이 가리키는 `triggered_alerts` projection 갱신을 같은 SQLite transaction에
둔다. `channel_status`는 기존 JSON 값을 parse해 `{...before, [row.channel]: terminalStatus}`
로 merge하고, 실제 한 채널 이상 전송 성공 시 `pushed_at`을 최초 성공 시각으로 채운다.
`backend/test/me-notifications.test.js`에서 worker 실행 전후에도 기존 알림 API shape가
유지되고 `pushedAt`만 예상대로 갱신되는지 회귀 검증한다.

- [ ] **Step 5: Push API 입력 경계 강화**

`subscribeSchema.endpoint`는 `z.string().url().max(4096)`, `p256dh`와 `auth`는 각각 `z.string().min(1).max(512)`를 사용한다. 현재 기기 상태는 브라우저의 `pushManager.getSubscription()`이 이미 소유하므로 별도 조회 endpoint를 추가하지 않는다.

- [ ] **Step 6: server에 독립적인 outbox one-shot worker 연결**

outbox worker는 `next_attempt_at` 최솟값만 보고 delivery timer를 하나 arm한다. `wake()`는
현재 delivery timer를 즉시 one-shot으로 앞당기는 idempotent 동작이다. watch가
0건이어도 pending/retry outbox는 전달해야 하므로 이 timer를 AlertWatchEngine에 합치지
않는다. outbox가 비면 delivery timer도 0개다. `start()`와 `runDue()` 모두 전달이 끝난
뒤 다음 due 시각을 다시 arm하고, `stop()`은 timer를 해제한다.

`backend/src/index.js`는 store bootstrap 직후 callback을 제공한다.

```js
async function main({ afterStoreInit = () => {} } = {}) {
  store.ensureDirectories(config.storage.base_path)
  store.initFromFiles(config.storage.base_path)
  await afterStoreInit()
  // 기존 cron 등록과 initial collection을 그대로 이어간다.
}
```

`backend/server.js`는 worker와 engine을 한 번 만들고 기존 router에 같은 instance를 주입한다.

```js
const outboxWorker = createOutboxWorker({ db: getDb() })
const alertWatchEngine = createAlertWatchEngine({
  db: getDb(),
  evaluateWatch,
  applyEvaluation,
  getCurrentRevisions: () => readCurrentRevisions(config.storage.base_path),
  onOutboxReady: outboxWorker.wake,
})

subscribeSourceChanges(alertWatchEngine.recordSourceChange)
app.use('/api/me', createAlertsRouter({
  onWatchChanged: () => alertWatchEngine.runDue(Date.now()),
}))
app.use('/api/dev', createDevRouter({ engine: alertWatchEngine }))

startScheduler({
  afterStoreInit: async () => {
    await outboxWorker.start()
    await alertWatchEngine.runDue(Date.now())
  },
}).catch((error) => {
  console.error('[server] Scheduler startup error:', error.message)
  process.exit(1)
})
```

기존 `startAlertScheduler(getDb())` 호출은 이 단계에서 제거한다.
`readCurrentRevisions()`는 TAF/SIGMET/AIRMET/warning/typhoon의 cached `content_hash`와 KIM
`latestRunId`, KTG `tmfc+hfs`를 반환해, 서버가 꺼진 동안 바뀐 source도 첫
`runDue()`에서 dirty로 복구한다. instrumentation은 `watchTimer`와 `deliveryTimer`를
별도 필드로 노출해 완전 유휴와 “watch 0건 + 전달 재시도만 대기”를 구별한다.

- [ ] **Step 7: delivery 테스트**

Run: `node --test backend/test/alert-outbox-worker.test.js backend/test/me-push.test.js backend/test/me-notifications.test.js backend/test/alert-sender.test.js backend/test/alert-watch-engine.test.js`

Expected: Telegram 실패 이력 유지, Push 404/410 정리, 임시 실패 무기한 capped retry,
startup `sending` 복구 1회, 같은 worker의 겹친 실행 중복 전송 없음, terminal projection과
독립 delivery timer PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/alerts/outbox-worker.js backend/test/alert-outbox-worker.test.js backend/src/alerts/sender.js backend/src/push/send.js backend/src/me/push.js backend/test/me-push.test.js backend/test/me-notifications.test.js backend/src/alerts/watch-engine.js backend/test/alert-watch-engine.test.js backend/src/index.js backend/server.js
git commit -m "feat: deliver alert outbox through push channels"
```

---

### Task 9: 개인설정 PWA 구독과 notification click 딥링크

**Files:**
- Create: `frontend/src/features/notifications/pushSubscription.js`
- Create: `frontend/src/features/notifications/usePushSubscription.js`
- Modify: `frontend/src/features/personal/PersonalSettingsPanel.jsx`
- Modify: `frontend/src/features/developer/tabs/TriggerTab.jsx`
- Modify: `frontend/src/features/developer/developerApi.js`
- Modify: `frontend/public/sw.js`
- Create: `frontend/verification/contracts/alert-push.spec.mjs`
- Modify: `docs/policies/verification/contracts.md`

**Interfaces:**
- Produces: `usePushSubscription() -> {status,error,enable,disable}`.
- 상태는 정확히 `unsupported|permission-needed|denied|subscribed|error`.
- Push payload: `{title,body,url,alertIds,watchId,routeId}`.
- notification click은 same-origin 기존 창을 focus/navigate하거나 새 창을 연다.

- [ ] **Step 1: 브라우저 API helper 단위 테스트와 Playwright 계약 작성**

`pushSubscription.js`의 순수 변환 test:

```js
test('urlBase64ToUint8Array converts VAPID base64url', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQIDBA')], [1, 2, 3, 4])
})

test('existing browser subscription is re-registered and server failure is not subscribed', async () => {
  const subscription = fakeSubscription()
  const failed = async () => new Response('{"error":"offline"}', {
    status: 503, headers: { 'content-type': 'application/json' },
  })
  await assert.rejects(
    syncCurrentSubscription({ registration: fakeRegistration(subscription), fetchImpl: failed }),
    /offline/,
  )
})
```

`alert-push.spec.mjs`는 Notification/ServiceWorker/PushManager를 `addInitScript`로 stub하고 다음을 role/label로 검증한다.

```js
await page.getByRole('button', { name: '설정' }).click()
await page.getByRole('tab', { name: '개인설정' }).click()
await page.getByRole('tab', { name: '비행 알림' }).click()
await expect(page.getByText('기기 알림 권한이 필요합니다')).toBeVisible()
await page.getByRole('button', { name: '기기 알림 켜기' }).click()
await expect(page.getByText('이 기기에 알림이 켜져 있습니다')).toBeVisible()
expect(capturedSubscribe.applicationServerKey).toBeTruthy()
```

같은 계약에 서버 `POST /api/me/push/subscribe`를 첫 호출만 503으로 만드는 case를 둔다.
PushManager의 local subscription은 남겨둔 채 reload하고, UI가 “구독됨”이 아니라 오류를
표시하며 POST를 다시 시도하는지 확인한다. 다음 POST를 200으로 바꾸고 다시 reload하면
서버 재등록 뒤에만 subscribed 문구가 보여야 한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test frontend/src/features/notifications/pushSubscription.test.js`

Run: `npm --prefix frontend run dev:contract:fast -- contracts/alert-push.spec.mjs`

Expected: helper/UI가 없어 FAIL.

- [ ] **Step 3: 개발자 콘솔의 VAPID 변환을 공통 helper로 이동**

`frontend/src/features/notifications/pushSubscription.js`:

```js
export function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4))
    .replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

async function registerSubscription(subscription, fetchImpl) {
  await fetchImpl('/api/me/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  }).then(readJson)
}

export async function syncCurrentSubscription({
  registration,
  fetchImpl = fetch,
} = {}) {
  const ready = registration ?? await navigator.serviceWorker.ready
  const subscription = await ready.pushManager.getSubscription()
  if (!subscription) return { status: 'permission-needed' }
  await registerSubscription(subscription, fetchImpl)
  return { status: 'subscribed', subscription }
}

export async function subscribeCurrentBrowser({ fetchImpl = fetch } = {}) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { status: permission === 'denied' ? 'denied' : 'permission-needed' }
  const registration = await navigator.serviceWorker.ready
  const { key } = await fetchImpl('/api/me/push/vapid-public-key', { credentials: 'include' }).then(readJson)
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
  await registerSubscription(subscription, fetchImpl)
  return { status: 'subscribed', subscription }
}

export async function unsubscribeCurrentBrowser({ fetchImpl = fetch } = {}) {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return { status: 'permission-needed' }
  await fetchImpl('/api/me/push/subscribe', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).then(readJson)
  await subscription.unsubscribe()
  return { status: 'permission-needed' }
}
```

Developer TriggerTab은 로컬 함수를 삭제하고 이 helper를 import한다.

- [ ] **Step 4: 상태 hook과 비행 알림 탭 UI**

hook 초기화는 browser feature와 `Notification.permission`을 읽고, 권한이 있으면 기존
browser subscription을 `syncCurrentSubscription()`으로 서버에 재등록한다. 이는 새 권한
요청을 만들지 않는다. 서버 확인이 실패하면 `subscribed`로 추정하지 않고 `error`를
유지한다.

```js
const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
if (!supported) setStatus('unsupported')
else if (Notification.permission === 'denied') setStatus('denied')
else {
  try {
    const result = await syncCurrentSubscription()
    setStatus(result.status)
  } catch (error) {
    setError(error)
    setStatus('error')
  }
}
```

`AlertsTab`에 다음 accessible text/control을 추가한다.

```jsx
<section aria-labelledby="device-alert-heading">
  <h3 id="device-alert-heading">기기 알림</h3>
  <p>{PUSH_STATUS_TEXT[push.status]}</p>
  {push.status !== 'subscribed' && push.status !== 'unsupported' && push.status !== 'denied' && (
    <Button onClick={push.enable}>기기 알림 켜기</Button>
  )}
  {push.status === 'subscribed' && (
    <Button onClick={push.disable}>기기 알림 끄기</Button>
  )}
</section>
```

- [ ] **Step 5: service worker click이 payload URL을 보존**

`frontend/public/sw.js`:

```js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const requested = new URL(data.url || '/', self.location.origin)
  const url = requested.origin === self.location.origin
    ? requested.href : new URL('/', self.location.origin).href
  event.waitUntil(self.registration.showNotification(data.title || 'ProjectAMO', {
    body: data.body || '',
    icon: '/gisang-i/clear_3_avatar.png',
    badge: '/gisang-i/clear_3_avatar.png',
    data: {
      url,
      alertIds: data.alertIds || [],
      watchId: data.watchId ?? null,
    },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || new URL('/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const sameOrigin = clients.find((client) => new URL(client.url).origin === self.location.origin)
    if (sameOrigin) {
      await sameOrigin.navigate(url)
      return sameOrigin.focus()
    }
    return self.clients.openWindow(url)
  }))
})
```

- [ ] **Step 6: frontend/Playwright 검증**

Run: `node --test frontend/src/features/notifications/pushSubscription.test.js`

Run: `npm --prefix frontend test`

Run: `npm run dev:contract -- --grep alert-push`

Expected: desktop/iPad/mobile에서 구독 상태와 버튼 접근성, subscribe request, `?flight=<watchId>` click URL이 PASS.

- [ ] **Step 7: 실제 HTTPS Push gate**

지원 브라우저의 배포 HTTPS origin에서 다음을 실제로 수행한다.

1. 로그인 → 설정 → 개인설정 → 비행 알림 → `기기 알림 켜기`.
2. DB `push_subscriptions`에 해당 user 구독 1건 확인.
3. active watch baseline 후 HIGH/CRITICAL 조건을 실제 dev/운영 진단 경로로 발생.
4. 앱 탭을 닫고 OS notification 수신 확인.
5. notification 클릭 후 `/?flight=<watchId>`와 해당 비행 알림 상세 확인.
6. 테스트용 endpoint를 무효화한 fixture에서 410 구독 정리 확인.

Expected: 실제 OS notification 한 번, 상세 딥링크 복귀, 중복 outbox 전송 없음. 이 gate를 통과하지 않으면 PWA 전달 완료로 표시하지 않는다.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/notifications/pushSubscription.js frontend/src/features/notifications/pushSubscription.test.js frontend/src/features/notifications/usePushSubscription.js frontend/src/features/personal/PersonalSettingsPanel.jsx frontend/src/features/developer/tabs/TriggerTab.jsx frontend/src/features/developer/developerApi.js frontend/public/sw.js frontend/verification/contracts/alert-push.spec.mjs docs/policies/verification/contracts.md
git commit -m "feat: enable flight alert web push subscriptions"
```

---

### Task 10: 개발 시나리오 전환, 구 scheduler 제거, 종단 간 검증

**Files:**
- Modify: `backend/src/dev/scenario.js`
- Modify: `backend/server.js`
- Delete: `backend/src/alerts/scheduler.js`
- Modify: 기존 `backend/test/alert-scheduler.test.js`를 evaluator/engine test로 흡수 후 삭제.
- Modify: `Architecture.md`
- Create: `docs/superpowers/status/alert-watch-engine-rearchitecture.status.md`

**Interfaces:**
- `/api/dev/tick`은 `engine.runDue(now)`를 호출한다.
- `/api/dev/inject`는 메모리 snapshot 변경 후 `publishSnapshotChange()`를 호출한다.
- 운영 코드에는 `setInterval` 기반 alert scheduler가 남지 않는다.

- [ ] **Step 1: dev scenario가 engine/source-change contract를 사용하는 실패 테스트 작성**

```js
test('dev inject publishes changed sources and tick runs the watch engine', async () => {
  const seen = []
  const engine = { runDue: async () => ({ evaluated: 1, fired: 1, nextWakeAt: null }) }
  const router = createDevRouter({
    db,
    engine,
    publishChange: (change) => seen.push(change),
  })
  const injected = await post(router, '/inject', { routeId: templateId, scenario: { depLifr: true } })
  assert.equal(injected.status, 200)
  assert.equal(seen[0].source, 'taf')
  const ticked = await post(router, '/tick', {})
  assert.deepEqual(ticked.body, { ok: true, evaluated: 1, fired: 1, nextWakeAt: null })
})
```

- [ ] **Step 2: dev route를 새 engine에 주입**

`createDevRouter({ db, engine, publishChange })`로 바꾸고, `updateCache` 전후 hash를 이용해 TAF/SIGMET ChangeSet을 발행한다. 직접 `detectChanges`, `insert triggered_alerts`, `dispatchAlert`, `runTick` 호출은 제거한다.

- [ ] **Step 3: 기존 scheduler의 남은 caller가 0인지 확인하고 삭제**

Run: `rg -n "startAlertScheduler|runTick|recompute|alerts/scheduler" backend frontend`

Expected: `backend/src/alerts/scheduler.js` 자체와 삭제 예정 테스트 외 결과 0.

그 뒤 `backend/src/alerts/scheduler.js`와 흡수 완료된 `backend/test/alert-scheduler.test.js`를 삭제한다.

- [ ] **Step 4: Architecture/status 갱신**

`Architecture.md` Backend File Roles에 아래 책임을 기록한다.

```markdown
- `backend/src/alerts/watch-engine.js` -> source revision과 watch 시간 경계만으로 due 감시를 실행하는 one-shot engine; 열린 감시가 없으면 timer/DB polling 없음.
- `backend/src/alerts/watch-repository.js` -> 예정 비행 snapshot 수명주기와 공항/source 후보 인덱스.
- `backend/src/alerts/evaluator.js` + `condition-store.js` -> source-group 부분 평가, 재시작 안전 condition 전이, triggered history/outbox 원자 기록.
- `backend/src/alerts/outbox-worker.js` -> Telegram/Web Push 전달, 재시도, 404/410 구독 정리.
```

상태 문서에 task별 commit, 실행 명령, 실제 Push gate 결과를 기록한다.

- [ ] **Step 5: focused backend suite**

Run:

```bash
node --test \
  backend/test/alert-watch-repository.test.js \
  backend/test/store-change-detection.test.js \
  backend/test/overseas-weather-processor.test.js \
  backend/test/ktg-processor.test.js \
  backend/test/alert-source-changes.test.js \
  backend/test/alert-watch-engine.test.js \
  backend/test/alert-evaluator.test.js \
  backend/test/alert-condition-store.test.js \
  backend/test/alert-outbox-worker.test.js \
  backend/test/me-alerts-delete.test.js \
  backend/test/me-notifications.test.js \
  backend/test/me-push.test.js
```

Expected: PASS, open handle 없이 exit 0.

- [ ] **Step 6: full test/build**

Run: `npm run check`

Expected: backend/frontend test PASS, production frontend build PASS.

- [ ] **Step 7: managed browser contracts**

Run: `npm run dev:contract -- --grep "alert-push|notam-and-settings|route-workflow"`

Expected: Linux의 모든 등록 viewport PASS. `?flight=` 상세와 전체 브리핑 열기 회귀 없음.

- [ ] **Step 8: idle runtime evidence**

감시 0건 DB로 서버를 띄우고 최소 한 source snapshot update를 발생시킨다. instrumentation에 다음을 남긴다.

```text
alert_watch_open=0
watch_timer=none
delivery_timer=none
alert_candidate_queries=0
alert_briefing_evaluations=0
```

미래 scheduled watch 1건에서는 `nextWakeAt === starts_at`, active watch 2건 중 RKPC TAF
변경에서는 RKPC index watch만 `evaluated=1`인지 확인한다. 별도 fixture로 watch 0건과
retry outbox 1건을 만들면 `watch_timer=none`, `delivery_timer=armed`이고 브리핑 계산은
0인지 확인한다.

- [ ] **Step 9: graph 갱신과 dirty diff 검토**

Run: `graphify update .`

Run: `git status --short`

Run: `git diff --check`

Expected: graph update 성공, whitespace error 0, 사용자 기존 변경이 되돌려지지 않음.

- [ ] **Step 10: Final commit**

```bash
git add \
  backend/server.js \
  backend/src/alerts/condition-store.js \
  backend/src/alerts/diff.js \
  backend/src/alerts/evaluator.js \
  backend/src/alerts/outbox-worker.js \
  backend/src/alerts/scheduler.js \
  backend/src/alerts/sender.js \
  backend/src/alerts/source-changes.js \
  backend/src/alerts/watch-engine.js \
  backend/src/alerts/watch-repository.js \
  backend/src/briefing/briefing-composer.js \
  backend/src/db/index.js \
  backend/src/db/schema.sql \
  backend/src/dev/scenario.js \
  backend/src/index.js \
  backend/src/me/alerts.js \
  backend/src/me/push.js \
  backend/src/processors/kim-surface-wind-processor.js \
  backend/src/processors/overseas-weather-processor.js \
  backend/src/processors/ktg-processor.js \
  backend/src/push/send.js \
  backend/test/alert-active.test.js \
  backend/test/alert-condition-store.test.js \
  backend/test/alert-diff.test.js \
  backend/test/alert-evaluator.test.js \
  backend/test/alert-outbox-worker.test.js \
  backend/test/alert-scheduler.test.js \
  backend/test/alert-sender.test.js \
  backend/test/alert-source-changes.test.js \
  backend/test/alert-watch-engine.test.js \
  backend/test/alert-watch-repository.test.js \
  backend/test/db.test.js \
  backend/test/kim-scheduler.test.js \
  backend/test/ktg-processor.test.js \
  backend/test/overseas-weather-processor.test.js \
  backend/test/store-change-detection.test.js \
  backend/test/me-alerts-delete.test.js \
  backend/test/me-notifications.test.js \
  backend/test/me-push.test.js \
  frontend/public/sw.js \
  frontend/src/app/App.jsx \
  frontend/src/features/developer/developerApi.js \
  frontend/src/features/developer/tabs/TriggerTab.jsx \
  frontend/src/features/notifications/pushSubscription.js \
  frontend/src/features/notifications/pushSubscription.test.js \
  frontend/src/features/notifications/usePushSubscription.js \
  frontend/src/features/personal/PersonalSettingsPanel.jsx \
  frontend/src/features/personal/usePersonalSettings.js \
  frontend/verification/contracts/alert-push.spec.mjs \
  Architecture.md \
  docs/policies/verification/contracts.md \
  docs/superpowers/specs/2026-07-28-alert-watch-engine-rearchitecture.md \
  docs/superpowers/plans/2026-07-28-alert-watch-engine-rearchitecture.md \
  docs/superpowers/status/alert-watch-engine-rearchitecture.status.md
git commit -m "refactor: complete revision-driven flight alert engine"
```

`graphify update .`가 바꾼 파일은 실행 시작 시 clean이었던 graph output만 별도 검토해 stage한다. 기존 dirty graph output을 위 commit에 섞지 않는다.

---

## 명시적 전달 보장 한계

이 설계는 DB claim, process 내부 run coalescing, Push subscription별 delivery state로 정상
실행과 일반 재시도의 중복을 막지만 외부 provider가 성공 응답을 보낸 직후 DB에 `sent`를
기록하기 전에 프로세스가 죽는 경우까지 exactly-once를 보장하지는 않는다. 재시작하면 해당
row는 다시 전달될 수 있으므로 보장은 at-least-once다. 이를 없애려면 provider-side
idempotency key/receipt 계약이 필요하며 Telegram/Web Push가 그 계약을 제공하지 않으므로
이번 범위에서는 별도 분산 전달 계층을 만들지 않는다.

---

## Completion Gates

- 같은 revision 재발행은 평가 0건.
- 평가 도중 더 새 revision이 발행되면 이전 pass가 dirty를 지우지 않고 후속 pass가 최신
  revision을 정확히 1회 평가.
- RKPC TAF 변경은 RKPC가 출발/도착/교체인 active watch만 후보.
- hazard/typhoon은 source 후보를 SQL로 줄인 뒤 기존 경로·시간·고도 판정 통과 시에만 firing.
- 서버 재시작 뒤 snapshot/revision/condition state를 이어서 사용.
- expired/cancelled watch는 평가 0건이고 history는 유지.
- 동일 firing 중복 0건, resolved 뒤 recurrence는 새 history 1건.
- Telegram/Web Push 실패가 history를 잃지 않고 outbox retry로 남으며 일반 재시도에서 이미
  완료한 Push subscription에는 다시 보내지 않음.
- 빈 outbox로 시작한 worker도 이후 evaluation이 row를 commit하면 즉시 깨어나 1회 전달.
- watch 0건이면 watch timer/query/briefing 0, 미래 watch만 있으면 `starts_at` watch
  one-shot 1개. 미전달 outbox가 있으면 delivery timer만 별도로 존재.
- Push 구독/전달/410 정리/`?flight=` click이 자동 계약과 실제 HTTPS 브라우저 gate 모두 통과.
- local Push subscription의 서버 재등록이 실패하면 UI는 `subscribed`가 아니라 `error`.
- 기존 알림 API shape, 알림센터, route briefing, 설정 화면 계약 통과.
