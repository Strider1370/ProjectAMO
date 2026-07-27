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
  alert_start_min_before_etd INTEGER NOT NULL DEFAULT 120, -- 감시 시작(ETD-N분), 2~6h
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
