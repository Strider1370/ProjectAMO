-- ProjectAMO 계정·개인데이터 스키마 (#7). SQLite. 최초 연결 시 idempotent 생성(IF NOT EXISTS).
-- 세션 테이블은 express-session 스토어(step2)가 별도 생성·관리.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'pilot' CHECK (role IN ('pilot','forecaster','admin')),
  display_name  TEXT,
  airports      TEXT,                         -- 예보관 담당공항(JSON 배열, 7개 부분집합). #6
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','rejected')),  -- 가입 승인
  min_ceiling_ft   INTEGER CHECK (min_ceiling_ft BETWEEN 0 AND 60000),   -- #13 개인 미니마(사용자당 단일값)
  min_visibility_m INTEGER CHECK (min_visibility_m BETWEEN 0 AND 10000),
  last_active_at TEXT,                        -- 관리자 콘솔 "활성 사용자" — 로그인 시각 기준
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presets (        -- 개인 미니마 (localStorage airport_minima_settings → 서버)
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  icao         TEXT NOT NULL CHECK (length(icao)=4),
  ceiling_ft   INTEGER CHECK (ceiling_ft BETWEEN 0 AND 60000),
  visibility_m INTEGER CHECK (visibility_m BETWEEN 0 AND 10000),
  wind_kt      INTEGER,
  xwind_kt     INTEGER,
  gust_kt      INTEGER,
  pilot_type   TEXT CHECK (pilot_type IN ('VFR','IFR') OR pilot_type IS NULL),
  updated_at   TEXT NOT NULL,
  UNIQUE(user_id, icao)
);

CREATE TABLE IF NOT EXISTS routes (         -- 저장 경로(= 문의·#13 감시 대상). inputs only.
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  name         TEXT,
  dep          TEXT,
  dest         TEXT,
  altn         TEXT,
  waypoints    TEXT,                         -- JSON, 개수·길이 상한은 서버 검증(step5)
  altitude_ft  INTEGER CHECK (altitude_ft BETWEEN 0 AND 60000),
  etd          TEXT,                         -- ISO, #13 감시
  rules        TEXT CHECK (rules IN ('VFR','IFR') OR rules IS NULL),
  payload      TEXT,                         -- 프론트 snapshot 전체(JSON) — 무손실 왕복용(#5)
  eta          TEXT,                         -- #13 목적지 TAF 평가시각(클라 etaCalc 계산값)
  alert_enabled              INTEGER NOT NULL DEFAULT 0,   -- #13 예정비행만 1(=감시 대상). etd 있고 alert_enabled=1
  alert_start_min_before_etd INTEGER NOT NULL DEFAULT 360, -- 감시 시작(ETD-N분), 6~24h
  altitude_filter_ft         INTEGER NOT NULL DEFAULT 4000,
  send_no_change_confirm     INTEGER NOT NULL DEFAULT 0,
  confirm_min_before_etd     INTEGER NOT NULL DEFAULT 60,
  last_briefing_snapshot_id  TEXT,                         -- diff 기준 스냅샷
  expires_at                 TEXT,                         -- 감시 종료(ETD+유예)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (       -- 조종사→예보관 문의
  id                  INTEGER PRIMARY KEY,
  pilot_id            INTEGER NOT NULL REFERENCES users(id),
  route_id            INTEGER NOT NULL REFERENCES routes(id),
  target_airport      TEXT NOT NULL,
  message             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','viewed','closed')),
  assigned_forecaster INTEGER REFERENCES users(id),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (        -- 리소스 시계열(60초 샘플, 7일 보관). 관리자 콘솔
  ts         TEXT NOT NULL,
  cpu_pct    REAL, mem_used INTEGER, mem_total INTEGER, disk_used INTEGER, disk_total INTEGER
);

CREATE TABLE IF NOT EXISTS visits (         -- 익명 포함 방문 추적. 관리자 콘솔
  visitor_id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
);

-- 방문자별 "이 날 왔었다" 1줄(하루에 여러 번 와도 중복 없음, INSERT OR IGNORE).
-- visits는 방문자당 한 줄이라 재방문을 포함한 일별 접속 추이를 못 낸다 — 이 표가 그걸 메운다.
CREATE TABLE IF NOT EXISTS visit_days (
  visitor_id TEXT NOT NULL,
  day        TEXT NOT NULL,                  -- 'YYYY-MM-DD'
  PRIMARY KEY (visitor_id, day)
);
CREATE INDEX IF NOT EXISTS idx_visit_days_day ON visit_days(day);

-- 이용 시간대 격자(요일 x 시각). visit_days는 날짜까지만 있고 visits.last_seen은 덮어쓰기라
-- 시간대 이력을 남기지 못한다 — 이 표가 그걸 메운다. 켠 시점부터 쌓인다.
CREATE TABLE IF NOT EXISTS visit_hours (
  day  TEXT NOT NULL,               -- 'YYYY-MM-DD' (KST)
  hour INTEGER NOT NULL,            -- 0-23 (KST)
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour)
);
CREATE INDEX IF NOT EXISTS idx_visit_hours_day ON visit_hours(day);

CREATE TABLE IF NOT EXISTS triggered_alerts (   -- #13 발송 이력·dedup·알림센터 피드
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  route_id      INTEGER NOT NULL REFERENCES routes(id),
  type          TEXT NOT NULL,                 -- CATEGORY|VIS|CEIL|ALTERNATE_FLIP|ENROUTE_HAZARD|ENROUTE_ICE_TURB|WX|NO_CHANGE_CONFIRM
  severity      TEXT NOT NULL,                 -- CRITICAL|HIGH|MEDIUM|LOW|INFO
  target        TEXT,                          -- 공항 ICAO or 구간
  from_val      TEXT, to_val TEXT,
  source_id     TEXT, source_seq TEXT, source_issued_at TEXT,  -- dedup 키 재료
  dedup_key     TEXT,
  reissue_count INTEGER NOT NULL DEFAULT 0,
  detected_at   TEXT NOT NULL,
  pushed_at     TEXT, channel_status TEXT,     -- 발송 채널 결과(JSON)
  read_at       TEXT                           -- 인앱 알림센터 읽음
);

CREATE TABLE IF NOT EXISTS push_subscriptions (  -- #13 Web Push 구독 (Phase 2, v1엔 미사용)
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  endpoint   TEXT NOT NULL,
  p256dh     TEXT, auth TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_presets_user ON presets(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_user ON routes(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_alert ON routes(alert_enabled, etd);  -- 스케줄러 활성비행 조회
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, target_airport);
CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(ts);
CREATE INDEX IF NOT EXISTS idx_visits_last ON visits(last_seen);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON triggered_alerts(user_id, detected_at);
CREATE INDEX IF NOT EXISTS idx_alerts_dedup ON triggered_alerts(route_id, dedup_key);
CREATE INDEX IF NOT EXISTS idx_pushsub_user ON push_subscriptions(user_id);

-- 운영 알림 발송 기록(중복 방지, 90일 보관). 5분마다 판정하므로 이게 없으면 같은 사건으로
-- 하루 288번 울린다. kind+subject가 하나의 "사건"이고, 사건이 끝나면(조건 해소) 기록을 지운다.
CREATE TABLE IF NOT EXISTS alerts_sent (
  kind    TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL,
  PRIMARY KEY (kind, subject)
);

-- 기관 라운지. 개인 routes와 분리하고, 변경 가능한 본체는 current_version만 가리킨다.
-- 실제 비행/자료/회차 내용은 *_versions에 append-only로 보존한다.
CREATE TABLE IF NOT EXISTS organizations (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  settings        TEXT NOT NULL DEFAULT '{}',
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  role             TEXT NOT NULL CHECK (role IN ('admin','planner','member')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_interests (
  id                       INTEGER PRIMARY KEY,
  organization_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind                     TEXT NOT NULL CHECK (kind IN ('airport','region')),
  name                     TEXT NOT NULL,
  icao                     TEXT CHECK (icao IS NULL OR length(icao) = 4),
  geometry                 TEXT,
  lightning_radius_km      REAL CHECK (lightning_radius_km IS NULL OR lightning_radius_km BETWEEN 1 AND 500),
  lightning_window_minutes INTEGER CHECK (lightning_window_minutes IS NULL OR lightning_window_minutes BETWEEN 5 AND 240),
  version                  INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by               INTEGER NOT NULL REFERENCES users(id),
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  CHECK ((kind = 'airport' AND icao IS NOT NULL AND geometry IS NULL)
      OR (kind = 'region' AND icao IS NULL AND geometry IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS organization_notices (
  id              INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  deleted_at      TEXT,
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_notice_versions (
  notice_id       INTEGER NOT NULL REFERENCES organization_notices(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL CHECK (version >= 1),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  starts_at       TEXT,
  ends_at         TEXT,
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  PRIMARY KEY (notice_id, version)
);

CREATE TABLE IF NOT EXISTS organization_flights (
  id              INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_user_id INTEGER REFERENCES users(id),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_flight_versions (
  flight_id       INTEGER NOT NULL REFERENCES organization_flights(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL CHECK (version >= 1),
  name            TEXT NOT NULL,
  etd             TEXT NOT NULL,
  eta             TEXT NOT NULL,
  snapshot        TEXT NOT NULL,
  profile_request TEXT NOT NULL,
  blocks          TEXT NOT NULL DEFAULT '[]',
  annotations     TEXT NOT NULL DEFAULT '[]',
  material_refs   TEXT NOT NULL DEFAULT '[]',
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  PRIMARY KEY (flight_id, version)
);

CREATE TABLE IF NOT EXISTS organization_materials (
  id              INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id   INTEGER NOT NULL REFERENCES users(id),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  deleted_at      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_material_versions (
  material_id          INTEGER NOT NULL REFERENCES organization_materials(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL CHECK (version >= 1),
  kind                 TEXT NOT NULL CHECK (kind IN ('pdf','image','map','route','document')),
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  source_label         TEXT,
  mime_type            TEXT,
  original_name        TEXT,
  storage_key          TEXT,
  thumbnail_storage_key TEXT,
  size_bytes           INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  content_hash         TEXT,
  metadata             TEXT NOT NULL DEFAULT '{}',
  blocks               TEXT NOT NULL DEFAULT '[]',
  created_by           INTEGER NOT NULL REFERENCES users(id),
  created_at           TEXT NOT NULL,
  PRIMARY KEY (material_id, version)
);

CREATE TABLE IF NOT EXISTS organization_briefings (
  id              INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','archived')),
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_briefing_versions (
  briefing_id    INTEGER NOT NULL REFERENCES organization_briefings(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL CHECK (version >= 1),
  name           TEXT NOT NULL,
  scheduled_at   TEXT,
  flight_refs    TEXT NOT NULL DEFAULT '[]',
  material_refs  TEXT NOT NULL DEFAULT '[]',
  blocks         TEXT NOT NULL DEFAULT '[]',
  created_by     INTEGER NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL,
  PRIMARY KEY (briefing_id, version)
);

CREATE TABLE IF NOT EXISTS organization_briefing_runs (
  id                 INTEGER PRIMARY KEY,
  organization_id    INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  briefing_id        INTEGER NOT NULL REFERENCES organization_briefings(id),
  briefing_version   INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_by         INTEGER NOT NULL REFERENCES users(id),
  active_flight_id   INTEGER REFERENCES organization_flights(id),
  pinned_snapshot    TEXT NOT NULL,
  applied_snapshot   TEXT NOT NULL,
  version            INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  started_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  ended_at           TEXT,
  FOREIGN KEY (briefing_id, briefing_version)
    REFERENCES organization_briefing_versions(briefing_id, version)
);

CREATE TABLE IF NOT EXISTS organization_briefing_run_candidates (
  run_id          INTEGER NOT NULL REFERENCES organization_briefing_runs(id) ON DELETE CASCADE,
  bundle_id       TEXT NOT NULL,
  flight_id       INTEGER NOT NULL REFERENCES organization_flights(id),
  flight_version  INTEGER NOT NULL,
  payload         TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (run_id, bundle_id),
  FOREIGN KEY (flight_id, flight_version)
    REFERENCES organization_flight_versions(flight_id, version)
);

CREATE TABLE IF NOT EXISTS organization_briefing_run_events (
  run_id          INTEGER NOT NULL REFERENCES organization_briefing_runs(id) ON DELETE CASCADE,
  sequence        INTEGER NOT NULL CHECK (sequence >= 1),
  kind            TEXT NOT NULL CHECK (kind IN ('applied','ended')),
  run_version     INTEGER NOT NULL CHECK (run_version >= 2),
  flight_id       INTEGER REFERENCES organization_flights(id),
  bundle_id       TEXT,
  payload         TEXT NOT NULL,
  actor_user_id   INTEGER NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence)
);

CREATE TABLE IF NOT EXISTS organization_alerts (
  id              INTEGER PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_key       TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('airport_warning','sigmet','airmet','lightning')),
  interest_id     INTEGER REFERENCES organization_interests(id) ON DELETE SET NULL,
  payload         TEXT NOT NULL,
  source_revision TEXT,
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  acknowledged_by INTEGER REFERENCES users(id),
  acknowledged_at TEXT,
  acknowledged_version INTEGER,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (organization_id, event_key)
);

CREATE TABLE IF NOT EXISTS organization_alert_user_states (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_id         INTEGER NOT NULL REFERENCES organization_alerts(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  read_at          TEXT,
  hidden_until     TEXT,
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (alert_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_org_interests_org ON organization_interests(organization_id, kind);
CREATE INDEX IF NOT EXISTS idx_org_notices_org ON organization_notices(organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_org_flights_org_status ON organization_flights(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_org_flight_versions_etd ON organization_flight_versions(etd);
CREATE INDEX IF NOT EXISTS idx_org_materials_org ON organization_materials(organization_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_org_briefings_org ON organization_briefings(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_org_runs_briefing ON organization_briefing_runs(briefing_id, status);
CREATE INDEX IF NOT EXISTS idx_org_run_candidates_flight ON organization_briefing_run_candidates(run_id, flight_id, flight_version);
CREATE INDEX IF NOT EXISTS idx_org_run_events_flight ON organization_briefing_run_events(run_id, flight_id, sequence);
CREATE INDEX IF NOT EXISTS idx_org_alerts_org_active ON organization_alerts(organization_id, active, updated_at);

-- 변경 이력/발표 후보는 새 행으로만 확장한다. 본체의 current_version 포인터만 변경 가능하다.
CREATE TRIGGER IF NOT EXISTS immutable_organization_flight_versions_update
BEFORE UPDATE ON organization_flight_versions BEGIN SELECT RAISE(ABORT, 'immutable_organization_flight_version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_flight_versions_delete
BEFORE DELETE ON organization_flight_versions BEGIN SELECT RAISE(ABORT, 'immutable_organization_flight_version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_notice_versions_update
BEFORE UPDATE ON organization_notice_versions BEGIN SELECT RAISE(ABORT, 'immutable_organization_notice_version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_notice_versions_delete
BEFORE DELETE ON organization_notice_versions BEGIN SELECT RAISE(ABORT, 'immutable_organization_notice_version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_material_versions_update
BEFORE UPDATE ON organization_material_versions BEGIN SELECT RAISE(ABORT, 'immutable_organization_material_version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_material_versions_delete
BEFORE DELETE ON organization_material_versions BEGIN SELECT RAISE(ABORT, 'immutable_organization_material_version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_briefing_versions_update
BEFORE UPDATE ON organization_briefing_versions BEGIN SELECT RAISE(ABORT, 'immutable_organization_briefing_version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_briefing_versions_delete
BEFORE DELETE ON organization_briefing_versions BEGIN SELECT RAISE(ABORT, 'immutable_organization_briefing_version'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_run_candidates_update
BEFORE UPDATE ON organization_briefing_run_candidates BEGIN SELECT RAISE(ABORT, 'immutable_organization_run_candidate'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_run_candidates_delete
BEFORE DELETE ON organization_briefing_run_candidates BEGIN SELECT RAISE(ABORT, 'immutable_organization_run_candidate'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_run_events_update
BEFORE UPDATE ON organization_briefing_run_events BEGIN SELECT RAISE(ABORT, 'immutable_organization_run_event'); END;
CREATE TRIGGER IF NOT EXISTS immutable_organization_run_events_delete
BEFORE DELETE ON organization_briefing_run_events BEGIN SELECT RAISE(ABORT, 'immutable_organization_run_event'); END;
