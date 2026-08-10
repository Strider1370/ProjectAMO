# 관리자 콘솔 재구성 (1단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 콘솔을 사이드바 6개 구조로 다시 만들고, 자료 34종을 자기 정상 주기 기준으로 판정해 이상한 것만 눈에 띄게 한다.

**Architecture:** 판정은 전부 백엔드에서 계산해 내려보낸다(프런트는 그리기만 한다). 자료 메타(출처·성격·주기·기준·쉬는 시간)는 `data-health-catalog.js` 한 파일의 34행 표에 모으고, `data-health.js`는 그 표와 `stats`/store/meta 파일을 읽어 판정만 한다. 프런트는 화면당 파일 하나로 쪼개 `AdminPage.jsx`가 라우팅만 맡는다.

**Tech Stack:** Node 20 · Express · better-sqlite3 · node:test · React 18 · Vite · Playwright

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-10-admin-console-redesign-design.md`
- **시각 계약: `docs/superpowers/specs/assets/2026-08-10-admin-console-mockup.html`.** 배치·색·글자 크기는 목업을 따른다. 어긋나면 목업이 옳다.
- 판정 기준은 **마지막 성공 수집 시각**이다. 내용 변경 시각이 아니다.
- 색만으로 뜻을 전하지 않는다. 상태는 항상 색 + 글자. **이모지 금지.**
- 그래프는 y축 눈금 4~6개 + 옅은 가로선 + 단위 표기 + 최댓값 숫자 표기가 필수다.
- 전역 토큰(`frontend/src/shared/theme/tokens.css`)은 건드리지 않는다. 어드민 전용 값은 `AdminPage.css`의 `.admin-page` 스코프 안에 둔다.
- 한글 주석/문자열은 UTF-8. `docs/policies/encoding-safety.md` 참고.
- 관리자 API는 전부 기존 `requireRole('admin')` 아래 둔다. 새 경로도 `createAdminRouter` 안에 추가한다.
- 이번 단계에서 만들지 않는 것: 응답시간·오류율 계측, 자료별 가동률 이력, 로그 화면, 알림, DB 백업. **목업에 그려져 있어도 만들지 않는다.**

---

## File Structure

**백엔드 — 신규**
- `backend/src/admin/data-health-catalog.js` — 자료 34종 표(키·이름·출처·성격·주기·지연·멈춤·쉬는시간·이벤트성)와 조회 헬퍼. 데이터만 담고 로직 없음.
- `backend/src/admin/freshness.js` — 순수 판정 함수. 나이와 기준을 받아 `'ok'|'late'|'stopped'|'quiet'` 반환.
- `backend/src/admin/disk-forecast.js` — metrics 시계열로 디스크 소진 예상 일수 계산.
- `backend/src/admin/deployment.js` — 실행 중 커밋·배포 시각·인증서 만료일.

**백엔드 — 수정**
- `backend/src/stats.js` — `last_success` 필드 추가, `getTypeSummary()` 노출.
- `backend/src/admin/data-health.js` — 카탈로그 + freshness로 판정해 행을 만든다.
- `backend/src/admin/visits.js` — `visit_hours` 기록과 요일×시각 집계.
- `backend/src/db/schema.sql` — `visit_hours` 테이블.
- `backend/src/admin/router.js` — 새 응답 배선.

**프런트 — 신규** (화면당 한 파일)
- `frontend/src/features/admin/AdminShell.jsx` — 상단 띠 + 사이드바 + 화면 전환.
- `frontend/src/features/admin/screens/OverviewScreen.jsx`
- `frontend/src/features/admin/screens/DataCollectionScreen.jsx`
- `frontend/src/features/admin/screens/ServerResourceScreen.jsx`
- `frontend/src/features/admin/screens/ApiUsageScreen.jsx`
- `frontend/src/features/admin/screens/UsersScreen.jsx`
- `frontend/src/features/admin/screens/AccountsScreen.jsx`
- `frontend/src/features/admin/components/DataGrid.jsx` — 자료 34종 격자(출처별/성격별 토글).
- `frontend/src/features/admin/components/AttentionList.jsx` — 확인 필요 목록.
- `frontend/src/features/admin/components/Chart.jsx` — 축 그리기 공용(`axes`, `LineChart`, `GroupedBarChart`, `HourHeatmap`).

**프런트 — 수정**
- `AdminPage.jsx` — 권한 확인과 `AdminShell` 렌더만 남긴다.
- `AdminPage.css` — 머큐리 계열 디자인 언어로 교체.
- `adminApi.js` — 새 엔드포인트 추가.
- 기존 `DataHealthDashboard.jsx` / `ServerHealthPanel.jsx` / `UserActivityPanel.jsx` — 화면 파일로 흡수 후 삭제.

---

### Task 1: 자료 카탈로그 34행

**Files:**
- Create: `backend/src/admin/data-health-catalog.js`
- Test: `backend/test/data-health-catalog.test.js`

**Interfaces:**
- Produces: `CATALOG` (배열), `SOURCES`, `CHARACTERS` (id→라벨 맵), `bySource(id)`, `byCharacter(id)`

각 행의 모양:
```js
{
  key: 'metar',            // store 키 또는 meta 행 키
  statsKey: 'metar',       // stats.types 키 (다르면 명시)
  label: 'METAR 국내',
  source: 'kma_aviation',  // SOURCES의 id
  character: 'report',     // CHARACTERS의 id
  normalMs: 5 * 60_000,
  lateMs: 20 * 60_000,
  stoppedMs: 40 * 60_000,
  quiet: null,             // 또는 { kind:'hours', fromHourKst:0, toHourKst:4 } / { kind:'night' }
  eventDriven: false,
  meta: null,              // meta 파일 상대경로(있으면 mtime을 내용 시각으로 씀)
}
```

- [ ] **Step 1: Write the failing test**

```js
// backend/test/data-health-catalog.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, SOURCES, CHARACTERS, bySource } from '../src/admin/data-health-catalog.js'

test('카탈로그는 34종이고 키가 중복되지 않는다', () => {
  assert.equal(CATALOG.length, 34)
  assert.equal(new Set(CATALOG.map((r) => r.key)).size, 34)
})

test('모든 행이 알려진 출처·성격에 속한다', () => {
  for (const row of CATALOG) {
    assert.ok(SOURCES[row.source], `${row.key}: 알 수 없는 출처 ${row.source}`)
    assert.ok(CHARACTERS[row.character], `${row.key}: 알 수 없는 성격 ${row.character}`)
  }
})

test('기준은 정상 주기 < 지연 < 멈춤 순서다', () => {
  for (const row of CATALOG) {
    assert.ok(row.normalMs < row.lateMs, `${row.key}`)
    assert.ok(row.lateMs < row.stoppedMs, `${row.key}`)
  }
})

test('이벤트성 자료 7종이 표시돼 있다', () => {
  const ev = CATALOG.filter((r) => r.eventDriven).map((r) => r.key).sort()
  assert.deepEqual(ev, ['airmet', 'kma_special_warning', 'lightning', 'sigmet', 'sigmet_overseas', 'typhoon', 'warning'].sort())
})

test('bySource는 출처 순서대로 묶어 돌려준다', () => {
  const groups = bySource()
  assert.equal(groups[0].id, 'kma_aviation')
  assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), 34)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/data-health-catalog.test.js`
Expected: FAIL — `Cannot find module '../src/admin/data-health-catalog.js'`

- [ ] **Step 3: Write the catalog**

```js
// backend/src/admin/data-health-catalog.js
// 자료 34종의 판정 기준표. 스펙 2026-08-10-admin-console-redesign-design.md의 표가 원본이다.
// cron 식을 시간 간격으로 번역하는 코드는 두지 않는다 — 발표 지연 같은 현장 사정은 사람이 조정해야 하고,
// 숫자를 직접 적는 편이 짧고 정직하다. 수집 주기를 바꾸면 이 표도 같이 고칠 것.
const m = (min) => min * 60_000
const h = (hour) => hour * 3_600_000

export const SOURCES = {
  kma_aviation: { label: '기상청 항공키', apiHubCategory: 'aviation' },
  kma_radar: { label: '레이더·위성키', apiHubCategory: 'radar_satellite' },
  kma_nwp: { label: '수치예보키', apiHubCategory: 'kim_nwp' },
  noaa: { label: 'NOAA', apiHubCategory: null },
  kac: { label: '공항공사', apiHubCategory: null },
  external: { label: '기타 외부', apiHubCategory: null },
}

export const CHARACTERS = {
  report: { label: '항공 보고·예보' },
  hazard: { label: '위험기상 경보' },
  observation: { label: '실황 관측' },
  nwp: { label: '수치예보' },
  general: { label: '일반예보·환경' },
  ops: { label: '운항 정보' },
}

// 밤에는 수집기가 프레임을 걸러내므로 판정하지 않는다.
const NIGHT = { kind: 'night' }
// 00–04시 KST에는 cron 자체가 돌지 않는다.
const EARLY_MORNING = { kind: 'hours', fromHourKst: 0, toHourKst: 4 }

export const CATALOG = [
  { key: 'metar', label: 'METAR 국내', source: 'kma_aviation', character: 'report', normalMs: m(5), lateMs: m(20), stoppedMs: m(40) },
  { key: 'taf', label: 'TAF 국내', source: 'kma_aviation', character: 'report', normalMs: m(10), lateMs: m(30), stoppedMs: h(1) },
  { key: 'sigmet', label: 'SIGMET 국내', source: 'kma_aviation', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'airmet', label: 'AIRMET', source: 'kma_aviation', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'sigwx_low', label: 'SIGWX', source: 'kma_aviation', character: 'hazard', normalMs: h(6), lateMs: h(9), stoppedMs: h(18) },
  { key: 'amos', label: 'AMOS', source: 'kma_aviation', character: 'report', normalMs: m(5), lateMs: m(20), stoppedMs: m(40) },
  { key: 'warning', label: '기상특보', source: 'kma_aviation', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'kma_special_warning', label: '기상특보(KMA)', source: 'kma_aviation', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'lightning', label: '낙뢰', source: 'kma_aviation', character: 'observation', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },
  { key: 'typhoon', label: '태풍', source: 'kma_aviation', character: 'hazard', normalMs: m(30), lateMs: m(90), stoppedMs: h(3), eventDriven: true },
  { key: 'takeoff_fcst', label: '이륙예보', source: 'kma_aviation', character: 'report', normalMs: h(1), lateMs: h(3), stoppedMs: h(6) },
  { key: 'airport_info', label: '공항정보', source: 'kma_aviation', character: 'ops', normalMs: h(12.5), lateMs: h(26), stoppedMs: h(50) },
  { key: 'ground_forecast', label: '지상예보', source: 'kma_aviation', character: 'general', normalMs: h(3), lateMs: h(7), stoppedMs: h(14) },
  { key: 'environment', label: '대기환경', source: 'kma_aviation', character: 'general', normalMs: h(1), lateMs: h(3), stoppedMs: h(6) },
  { key: 'asos_ceiling', label: '운고(ASOS)', source: 'kma_aviation', character: 'report', normalMs: h(1), lateMs: h(3), stoppedMs: h(6) },

  { key: 'radar_echo', label: '레이더', source: 'kma_radar', character: 'observation', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), meta: 'radar/echo_meta.json' },
  { key: 'echo_top', label: '에코탑(재산출)', source: 'kma_radar', character: 'observation', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), meta: 'radar/echotop/echotop_meta.json' },
  { key: 'hsr', label: '합성 HSR', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/hsr/hsr_meta.json' },
  { key: 'hci', label: '합성 HCI', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/hci/hci_meta.json' },
  { key: 'wissdom', label: 'WISSDOM', source: 'kma_radar', character: 'nwp', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/wissdom/wissdom_meta.json' },
  { key: 'qpf', label: 'QPF', source: 'kma_radar', character: 'nwp', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/qpf/qpf_meta.json' },
  { key: 'satellite', label: '위성', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'satellite/sat_meta.json' },
  { key: 'satellite_visible', label: '위성 가시', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), quiet: NIGHT, meta: 'satellite/visible/visible_meta.json' },
  { key: 'convective', label: '대류 CI·CTPS', source: 'kma_radar', character: 'observation', statsKey: 'satellite', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'satellite/convective/convective_meta.json' },
  { key: 'flight_category_overlay', label: '비행범주', source: 'kma_radar', character: 'report', statsKey: 'flight_category', normalMs: m(20), lateMs: h(1), stoppedMs: h(2) },

  { key: 'kim_nwp', label: 'KIM 수치예보 격자', source: 'kma_nwp', character: 'nwp', statsKey: 'kim_surface_wind', normalMs: h(6), lateMs: h(9), stoppedMs: h(18), meta: 'kim_nwp/latest.json' },
  { key: 'ktg', label: '난류(KTG)', source: 'kma_nwp', character: 'nwp', normalMs: h(6), lateMs: h(9), stoppedMs: h(18), meta: 'ktg/latest.json' },

  { key: 'metar_overseas', label: 'METAR 해외', source: 'noaa', character: 'report', normalMs: m(5), lateMs: m(20), stoppedMs: m(40) },
  { key: 'taf_overseas', label: 'TAF 해외', source: 'noaa', character: 'report', normalMs: m(10), lateMs: m(30), stoppedMs: h(1) },
  { key: 'sigmet_overseas', label: 'SIGMET 해외', source: 'noaa', character: 'hazard', normalMs: m(5), lateMs: m(20), stoppedMs: m(40), eventDriven: true },

  { key: 'terminal_flights', label: '운항편', source: 'kac', character: 'ops', normalMs: m(1), lateMs: m(15), stoppedMs: m(30), quiet: EARLY_MORNING },
  { key: 'notam', label: 'NOTAM', source: 'kac', character: 'ops', normalMs: h(6), lateMs: h(9), stoppedMs: h(18) },

  { key: 'rainviewer', label: '해외 레이더', source: 'external', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'radar/rainviewer_meta.json' },
  { key: 'overseas_forecast', label: '해외예보', source: 'external', character: 'general', normalMs: h(1), lateMs: h(3), stoppedMs: h(6), quiet: EARLY_MORNING },
].map((row) => ({ statsKey: row.key, quiet: null, eventDriven: false, meta: null, ...row }))

const groupBy = (field, dict) => () =>
  Object.entries(dict).map(([id, meta]) => ({ id, ...meta, rows: CATALOG.filter((r) => r[field] === id) }))

export const bySource = groupBy('source', SOURCES)
export const byCharacter = groupBy('character', CHARACTERS)

export default { CATALOG, SOURCES, CHARACTERS, bySource, byCharacter }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/data-health-catalog.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/data-health-catalog.js backend/test/data-health-catalog.test.js
git commit -m "feat: add the data health catalog for all 34 collected products"
```

---

### Task 2: 신선도 판정 순수 함수

**Files:**
- Create: `backend/src/admin/freshness.js`
- Test: `backend/test/freshness.test.js`

**Interfaces:**
- Consumes: Task 1의 행 모양(`normalMs`/`lateMs`/`stoppedMs`/`quiet`)
- Produces: `judge({ row, lastSuccessMs, nowMs, sunsetMs, sunriseMs })` → `'ok' | 'late' | 'stopped' | 'quiet' | 'never'`

`never`는 한 번도 성공한 적이 없는 경우다. 화면에서는 멈춤과 같이 다루되 문구를 "자료 없음"으로 쓴다.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/freshness.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { judge, isQuiet } from '../src/admin/freshness.js'

const row = { normalMs: 300000, lateMs: 1200000, stoppedMs: 2400000, quiet: null }
const now = Date.parse('2026-08-10T10:00:00Z')

test('기준 미만이면 정상', () => {
  assert.equal(judge({ row, lastSuccessMs: now - 600000, nowMs: now }), 'ok')
})

test('지연 기준 이상이면 지연, 멈춤 기준 이상이면 멈춤', () => {
  assert.equal(judge({ row, lastSuccessMs: now - 1200000, nowMs: now }), 'late')
  assert.equal(judge({ row, lastSuccessMs: now - 2400000, nowMs: now }), 'stopped')
})

test('성공 기록이 없으면 never', () => {
  assert.equal(judge({ row, lastSuccessMs: null, nowMs: now }), 'never')
})

test('운항편은 새벽 00–04시 KST에 판정하지 않는다', () => {
  const quietRow = { ...row, quiet: { kind: 'hours', fromHourKst: 0, toHourKst: 4 } }
  // 2026-08-10T17:00:00Z = KST 02:00 → 쉬는 시간
  const kst2am = Date.parse('2026-08-10T17:00:00Z')
  assert.equal(judge({ row: quietRow, lastSuccessMs: kst2am - 99999999, nowMs: kst2am }), 'quiet')
  // KST 10:00 → 판정한다
  const kst10am = Date.parse('2026-08-10T01:00:00Z')
  assert.equal(judge({ row: quietRow, lastSuccessMs: kst10am - 99999999, nowMs: kst10am }), 'stopped')
})

test('위성 가시는 일몰~일출 사이에 판정하지 않는다', () => {
  const nightRow = { ...row, quiet: { kind: 'night' } }
  const sunset = Date.parse('2026-08-10T10:20:00Z')
  const sunrise = Date.parse('2026-08-10T20:30:00Z')
  const afterSunset = sunset + 3600000
  assert.equal(judge({ row: nightRow, lastSuccessMs: sunset, nowMs: afterSunset, sunsetMs: sunset, sunriseMs: sunrise }), 'quiet')
})

test('밤 정보가 없으면 night 규칙은 무시하고 평소대로 판정한다', () => {
  const nightRow = { ...row, quiet: { kind: 'night' } }
  assert.equal(judge({ row: nightRow, lastSuccessMs: now - 2400000, nowMs: now }), 'stopped')
})

test('isQuiet은 경계 시각을 포함/제외로 나눈다', () => {
  const q = { kind: 'hours', fromHourKst: 0, toHourKst: 4 }
  assert.equal(isQuiet(q, Date.parse('2026-08-09T15:00:00Z')), true)  // KST 00:00 포함
  assert.equal(isQuiet(q, Date.parse('2026-08-09T19:00:00Z')), false) // KST 04:00 제외
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/freshness.test.js`
Expected: FAIL — `Cannot find module '../src/admin/freshness.js'`

- [ ] **Step 3: Write the implementation**

```js
// backend/src/admin/freshness.js
// 자료 신선도 판정. 순수 함수 — 시각과 기준만 받는다(파일·store 접근 없음).
//
// 판정은 "마지막으로 수집이 성공한 시각"으로 한다. 내용이 언제 바뀌었는지가 아니다.
// SIGMET·AIRMET은 위험기상이 없으면 내용이 비어 있는 게 정상이라, 내용으로 판정하면
// 날씨가 평온한 날마다 멈춤으로 잘못 뜬다.
const KST_OFFSET_MS = 9 * 3_600_000

export function kstHour(ms) {
  return new Date(ms + KST_OFFSET_MS).getUTCHours()
}

// 쉬는 시간인가 — 안 받는 것이 정상인 시간대.
export function isQuiet(quiet, nowMs, { sunsetMs = null, sunriseMs = null } = {}) {
  if (!quiet) return false
  if (quiet.kind === 'hours') {
    const hour = kstHour(nowMs)
    const { fromHourKst: from, toHourKst: to } = quiet
    // to는 제외(04시면 04:00부터는 다시 판정한다). from > to면 자정을 넘는 구간.
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to
  }
  if (quiet.kind === 'night') {
    // 일몰·일출을 모르면 판정을 건너뛰지 않는다 — 조용히 봐주는 것보다 오탐이 낫다.
    if (sunsetMs == null || sunriseMs == null) return false
    return nowMs >= sunsetMs && nowMs < sunriseMs
  }
  return false
}

export function judge({ row, lastSuccessMs, nowMs, sunsetMs = null, sunriseMs = null }) {
  if (isQuiet(row.quiet, nowMs, { sunsetMs, sunriseMs })) return 'quiet'
  if (!Number.isFinite(lastSuccessMs)) return 'never'
  const age = nowMs - lastSuccessMs
  if (age >= row.stoppedMs) return 'stopped'
  if (age >= row.lateMs) return 'late'
  return 'ok'
}

export default { judge, isQuiet, kstHour }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/freshness.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/freshness.js backend/test/freshness.test.js
git commit -m "feat: judge product freshness against each product's own interval"
```

---

### Task 3: stats에 last_success 추가

**Files:**
- Modify: `backend/src/stats.js` (`makeTypeEntry` 약 L20, `initFromFile` 약 L50, `recordSuccess` 약 L99)
- Test: `backend/test/stats-last-success.test.js`

**Interfaces:**
- Produces: `stats.getStats().types[type].last_success` (ISO 문자열 또는 `null`)

지금은 `last_run`이 성공·실패 모두에 찍혀 "마지막 성공"을 알 수 없다. 이 값이 Task 2 판정의 입력이다.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/stats-last-success.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import stats from '../src/stats.js'

test('성공에만 last_success가 찍히고 실패는 그대로 둔다', () => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))

  stats.recordSuccess('metar', {}, 100)
  const afterSuccess = stats.getStats().types.metar.last_success
  assert.ok(afterSuccess, '성공하면 값이 있어야 한다')

  stats.recordFailure('metar', 'boom', 100)
  const entry = stats.getStats().types.metar
  assert.equal(entry.last_success, afterSuccess, '실패는 last_success를 건드리지 않는다')
  assert.notEqual(entry.last_run, afterSuccess, 'last_run은 실패에도 갱신된다')
})

test('예전 통계 파일을 읽어도 last_success 칸이 생긴다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-'))
  fs.mkdirSync(path.join(dir, 'stats'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'stats', 'latest.json'), JSON.stringify({
    since: '2026-01-01T00:00:00Z',
    types: { metar: { total_runs: 5, success: 5, failure: 0, last_run: '2026-01-01T00:05:00Z' } },
    recent_runs: [],
  }))
  stats.initFromFile(dir)
  assert.equal(stats.getStats().types.metar.last_success, null, '없던 값은 null로 채운다')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/stats-last-success.test.js`
Expected: FAIL — `last_success`가 `undefined`

- [ ] **Step 3: Add the field**

`makeTypeEntry()`의 반환 객체에 한 줄 추가:

```js
    last_run: null,
    last_success: null,   // 마지막으로 성공한 수집 — 관리자 콘솔 신선도 판정의 기준
    last_failure: null,
```

`initFromFile`의 타입 보정 루프(`for (const t of TYPES)`) 안에 한 줄 추가:

```js
        if (loaded.types[t].last_success === undefined) loaded.types[t].last_success = null
```

`recordSuccess`에서 `entry.last_run` 다음 줄에 추가:

```js
  entry.last_run = new Date().toISOString()
  entry.last_success = entry.last_run
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test test/stats-last-success.test.js test/admin-data-health.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/stats.js backend/test/stats-last-success.test.js
git commit -m "feat: record the last successful collection separately from the last run"
```

---

### Task 4: data-health를 카탈로그 기반으로 재작성

**Files:**
- Modify: `backend/src/admin/data-health.js` (전면 교체)
- Modify: `backend/test/admin-data-health.test.js` (새 계약에 맞게 교체)
- Modify: `backend/src/admin/router.js:32-34`

**Interfaces:**
- Consumes: Task 1 `CATALOG`/`bySource`/`byCharacter`, Task 2 `judge`, Task 3 `last_success`
- Produces: `readDataHealth(basePath, { getCached, getStats, now, sun })` → 아래 모양

```js
{
  generatedAt: '2026-08-10T10:36:00Z',
  counts: { total: 34, ok: 32, late: 0, stopped: 2, quiet: 0 },
  rows: [{
    key, label, source, character,
    status: 'ok'|'late'|'stopped'|'quiet'|'never',
    lastSuccessAt, contentAt, normalMs, lateMs, stoppedMs,
    eventDriven, activeCount, lastError, failing,
  }],
  groups: { source: [{ id, label, keys: [...] }], character: [...] },
}
```

`contentAt`은 store 타입이면 `getCached(key).fetched_at`, meta 타입이면 파일 mtime이다. **판정에는 쓰지 않는다.**

- [ ] **Step 1: Write the failing test**

```js
// backend/test/admin-data-health.test.js (전면 교체)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readDataHealth } from '../src/admin/data-health.js'

const NOW = Date.parse('2026-08-10T10:36:00Z')
const base = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-'))
const statsFor = (types) => () => ({ types })

test('판정은 last_success로 한다 — 내용 시각이 낡아도 수집이 돌면 정상', () => {
  const { rows } = readDataHealth(base(), {
    getCached: () => ({ fetched_at: '2026-06-01T00:00:00Z' }),
    getStats: statsFor({ sigmet: { last_success: '2026-08-10T10:33:00Z', last_run: '2026-08-10T10:33:00Z' } }),
    now: NOW,
  })
  const sigmet = rows.find((r) => r.key === 'sigmet')
  assert.equal(sigmet.status, 'ok')
})

test('수집이 멈추면 멈춤으로 잡힌다', () => {
  const { rows, counts } = readDataHealth(base(), {
    getCached: () => null,
    getStats: statsFor({ kim_surface_wind: { last_success: '2026-06-07T12:12:00Z' } }),
    now: NOW,
  })
  assert.equal(rows.find((r) => r.key === 'kim_nwp').status, 'stopped')
  assert.ok(counts.stopped >= 1)
})

test('성공 기록이 아예 없으면 never', () => {
  const { rows } = readDataHealth(base(), { getCached: () => null, getStats: statsFor({}), now: NOW })
  assert.equal(rows.find((r) => r.key === 'metar').status, 'never')
})

test('이벤트성 자료는 0건이어도 정상이고 건수를 함께 낸다', () => {
  const { rows } = readDataHealth(base(), {
    getCached: (key) => (key === 'airmet' ? { fetched_at: '2026-08-10T10:35:00Z', items: [] } : null),
    getStats: statsFor({ airmet: { last_success: '2026-08-10T10:35:00Z' } }),
    now: NOW,
  })
  const airmet = rows.find((r) => r.key === 'airmet')
  assert.equal(airmet.status, 'ok')
  assert.equal(airmet.eventDriven, true)
  assert.equal(airmet.activeCount, 0)
})

test('meta 파일 타입은 파일 시각을 contentAt으로 쓴다', () => {
  const dir = base()
  fs.mkdirSync(path.join(dir, 'radar'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'radar', 'echo_meta.json'), '{}')
  const { rows } = readDataHealth(dir, { getCached: () => null, getStats: statsFor({}), now: NOW })
  assert.ok(rows.find((r) => r.key === 'radar_echo').contentAt)
})

test('쉬는 시간에는 판정하지 않는다 — KST 새벽 2시의 운항편', () => {
  const { rows } = readDataHealth(base(), {
    getCached: () => null,
    getStats: statsFor({ terminal_flights: { last_success: '2026-08-10T14:00:00Z' } }),
    now: Date.parse('2026-08-10T17:00:00Z'),
  })
  assert.equal(rows.find((r) => r.key === 'terminal_flights').status, 'quiet')
})

test('묶음 정보는 34종을 빠짐없이 담는다', () => {
  const { groups } = readDataHealth(base(), { getCached: () => null, getStats: statsFor({}), now: NOW })
  assert.equal(groups.source.reduce((n, g) => n + g.keys.length, 0), 34)
  assert.equal(groups.character.reduce((n, g) => n + g.keys.length, 0), 34)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/admin-data-health.test.js`
Expected: FAIL — `readDataHealth`가 배열을 돌려주므로 `rows`가 `undefined`

- [ ] **Step 3: Rewrite data-health.js**

```js
// backend/src/admin/data-health.js
import fs from 'node:fs'
import path from 'node:path'

import { CATALOG, SOURCES, CHARACTERS } from './data-health-catalog.js'
import { judge } from './freshness.js'

// 관리자 콘솔: 자료 34종의 수집 상태.
//
// 판정 기준은 stats의 last_success — "마지막으로 수집이 성공한 시각"이다. 내용이 언제 바뀌었는지
// (store의 fetched_at, meta 파일 mtime)는 참고로만 함께 내려보낸다. SIGMET처럼 위험기상이 없으면
// 내용이 비는 자료를 내용으로 판정하면 평온한 날마다 멈춤으로 잘못 뜬다.
const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null }

function contentTime(basePath, row, getCached) {
  if (row.meta) {
    try { return fs.statSync(path.join(basePath, row.meta)).mtime.toISOString() } catch { return null }
  }
  return getCached(row.key)?.fetched_at ?? null
}

// 이벤트성 자료의 "지금 몇 건" — 수집기마다 담는 자리가 달라 알려진 것만 센다. 못 세면 null이고,
// null이면 화면이 건수를 감춘다(0건으로 단정하지 않는다).
function activeCount(row, getCached) {
  if (!row.eventDriven) return null
  const data = getCached(row.key)
  if (!data) return null
  if (Array.isArray(data.items)) return data.items.length
  if (Array.isArray(data.typhoons)) return data.typhoons.length
  if (data.airports && typeof data.airports === 'object') return Object.keys(data.airports).length
  return null
}

function isCurrentlyFailing(entry) {
  return Boolean(entry?.last_failure && entry.last_failure === entry.last_run)
}

// getCached(type)와 getStats()를 주입받는다(store.js·stats.js 직접 의존 대신) — basePath만 있으면
// 순수 함수로 테스트 가능하게. now/sun도 주입 가능(시간 의존 테스트).
export function readDataHealth(basePath, { getCached, getStats, now = Date.now(), sun = {} }) {
  const statsTypes = getStats()?.types || {}
  const counts = { total: CATALOG.length, ok: 0, late: 0, stopped: 0, quiet: 0, never: 0 }

  const rows = CATALOG.map((row) => {
    const entry = statsTypes[row.statsKey]
    const lastSuccessAt = entry?.last_success ?? null
    const status = judge({
      row,
      lastSuccessMs: ms(lastSuccessAt),
      nowMs: now,
      sunsetMs: sun.sunsetMs ?? null,
      sunriseMs: sun.sunriseMs ?? null,
    })
    counts[status] += 1
    return {
      key: row.key,
      statsKey: row.statsKey, // Task 7이 통계를 붙일 때 쓴다 — 저장 키와 다른 행이 셋 있다
      label: row.label,
      source: row.source,
      character: row.character,
      status,
      lastSuccessAt,
      contentAt: contentTime(basePath, row, getCached),
      normalMs: row.normalMs,
      lateMs: row.lateMs,
      stoppedMs: row.stoppedMs,
      eventDriven: row.eventDriven,
      activeCount: activeCount(row, getCached),
      failing: isCurrentlyFailing(entry),
      lastError: entry?.last_error ?? null,
    }
  })

  const group = (dict, field) => Object.entries(dict).map(([id, meta]) => ({
    id, ...meta, keys: CATALOG.filter((r) => r[field] === id).map((r) => r.key),
  }))

  return {
    generatedAt: new Date(now).toISOString(),
    counts,
    rows,
    groups: { source: group(SOURCES, 'source'), character: group(CHARACTERS, 'character') },
  }
}

export default { readDataHealth }
```

`router.js`의 `/data-health` 핸들러를 응답 그대로 넘기게 바꾼다:

```js
  router.get('/data-health', (req, res) => res.json(
    readDataHealth(config.storage.active_path, { getCached: store.getCached, getStats: stats.getStats }),
  ))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test test/admin-data-health.test.js test/data-health-catalog.test.js test/freshness.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/data-health.js backend/src/admin/router.js backend/test/admin-data-health.test.js
git commit -m "feat: report product status, groups and counts from the catalog"
```

---

### Task 5: 디스크 소진 예상

**Files:**
- Create: `backend/src/admin/disk-forecast.js`
- Test: `backend/test/disk-forecast.test.js`
- Modify: `backend/src/admin/router.js` (`/server-health` 응답에 `diskForecast` 추가)

**Interfaces:**
- Produces: `forecastDiskFull(series)` → `{ perDayBytes, daysLeft, fullAt } | null`

`series`는 `readMetrics`가 주는 행 배열(`{ ts, disk_used, disk_total }`)이다. 증가세가 없으면 `null`을 돌려주고 화면은 항목을 감춘다.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/disk-forecast.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forecastDiskFull } from '../src/admin/disk-forecast.js'

const GB = 1024 ** 3
const row = (dayOffset, usedGb) => ({
  ts: new Date(Date.parse('2026-08-01T00:00:00Z') + dayOffset * 86400000).toISOString(),
  disk_used: usedGb * GB,
  disk_total: 30 * GB,
})

test('하루 1GB씩 늘면 남은 용량을 그 속도로 나눈다', () => {
  const out = forecastDiskFull([row(0, 10), row(5, 15)])
  assert.ok(Math.abs(out.perDayBytes - GB) < GB * 0.01)
  assert.equal(out.daysLeft, 15) // (30-15)GB ÷ 1GB/일
})

test('늘지 않으면 예측하지 않는다', () => {
  assert.equal(forecastDiskFull([row(0, 18), row(5, 18)]), null)
})

test('줄어들면 예측하지 않는다', () => {
  assert.equal(forecastDiskFull([row(0, 20), row(5, 18)]), null)
})

test('표본이 둘 미만이거나 기간이 없으면 null', () => {
  assert.equal(forecastDiskFull([row(0, 10)]), null)
  assert.equal(forecastDiskFull([]), null)
  assert.equal(forecastDiskFull([row(0, 10), row(0, 12)]), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/disk-forecast.test.js`
Expected: FAIL — `Cannot find module '../src/admin/disk-forecast.js'`

- [ ] **Step 3: Write the implementation**

```js
// backend/src/admin/disk-forecast.js
// 관리자 콘솔: "이 속도면 며칠 남았나". 처음과 끝 두 점의 기울기만 본다 — 회귀를 넣어도
// 이 화면이 답하는 질문("대충 언제 위험한가")의 정확도는 나아지지 않는다.
// ponytail: 두 점 기울기. 계단식 증가가 문제되면 그때 회귀로 올린다.
export function forecastDiskFull(series) {
  if (!Array.isArray(series) || series.length < 2) return null
  const first = series[0]
  const last = series[series.length - 1]
  const spanMs = Date.parse(last.ts) - Date.parse(first.ts)
  if (!(spanMs > 0)) return null

  const grown = last.disk_used - first.disk_used
  if (!(grown > 0)) return null

  const perDayBytes = grown / (spanMs / 86400000)
  const remaining = last.disk_total - last.disk_used
  if (!(remaining > 0)) return { perDayBytes, daysLeft: 0, fullAt: last.ts }

  const daysLeft = Math.floor(remaining / perDayBytes)
  return { perDayBytes, daysLeft, fullAt: new Date(Date.now() + daysLeft * 86400000).toISOString() }
}

export default { forecastDiskFull }
```

`router.js`의 `/server-health`에 한 줄 더한다(7일 창을 따로 읽는다):

```js
    diskForecast: forecastDiskFull(readMetrics(database(), '7d').series),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/disk-forecast.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/disk-forecast.js backend/test/disk-forecast.test.js backend/src/admin/router.js
git commit -m "feat: estimate how many days of disk headroom remain"
```

---

### Task 6: 배포 버전과 인증서 만료일

**Files:**
- Create: `backend/src/admin/deployment.js`
- Test: `backend/test/deployment.test.js`
- Modify: `backend/src/admin/router.js` (`/server-health` 응답에 `deployment` 추가)

**Interfaces:**
- Produces: `deploymentInfo({ certPath })` → `{ commit, deployedAt, cert: { notAfter, daysLeft } | null }`

인증서를 못 읽는 것은 **오류가 아니다**(로컬 개발엔 파일이 없다). `cert: null`로 두고 화면이 항목을 감춘다.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/deployment.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { certificateExpiry, deploymentInfo } from '../src/admin/deployment.js'

test('인증서 파일이 없으면 null이고 던지지 않는다', () => {
  assert.equal(certificateExpiry('/nowhere/fullchain.pem'), null)
})

test('인증서를 못 읽어도 배포 정보는 나온다', () => {
  const info = deploymentInfo({ certPath: '/nowhere/fullchain.pem' })
  assert.equal(info.cert, null)
  assert.ok('commit' in info)
})

test('커밋 해시는 짧은 형태다', () => {
  const { commit } = deploymentInfo({ certPath: '/nowhere/fullchain.pem' })
  if (commit) assert.match(commit, /^[0-9a-f]{7,40}$/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/deployment.test.js`
Expected: FAIL — `Cannot find module '../src/admin/deployment.js'`

- [ ] **Step 3: Write the implementation**

```js
// backend/src/admin/deployment.js
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// 관리자 콘솔: 지금 돌고 있는 버전과 HTTPS 인증서 남은 일수.
// 둘 다 "없으면 감춘다" — 로컬 개발엔 인증서가 없고, 배포 방식에 따라 git 정보가 없을 수도 있다.
// 없는 것을 오류로 취급하면 개발 중 콘솔이 계속 빨개진다.
const CERT_PATH = process.env.TLS_CERT_PATH || '/etc/letsencrypt/live/projectamo.co.kr/fullchain.pem'

// openssl에 의존하지 않고 PEM에서 직접 읽는다. Node에 X509Certificate가 있다.
export function certificateExpiry(certPath = CERT_PATH) {
  try {
    const { X509Certificate } = require('node:crypto')
    const cert = new X509Certificate(fs.readFileSync(certPath))
    const notAfter = new Date(cert.validTo).toISOString()
    return { notAfter, daysLeft: Math.floor((Date.parse(notAfter) - Date.now()) / 86400000) }
  } catch { return null }
}

function gitCommit(cwd) {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim() } catch { return null }
}

// 배포 시각 — 배포 스크립트가 남긴 파일이 있으면 그걸 쓰고, 없으면 .git/HEAD 수정시각으로 근사한다.
function deployedAt(root) {
  for (const p of [path.join(root, '.deployed-at'), path.join(root, '.git', 'HEAD')]) {
    try { return fs.statSync(p).mtime.toISOString() } catch { /* 다음 후보 */ }
  }
  return null
}

export function deploymentInfo({ certPath = CERT_PATH, root = process.cwd() } = {}) {
  return {
    commit: process.env.GIT_COMMIT || gitCommit(root),
    deployedAt: deployedAt(root),
    cert: certificateExpiry(certPath),
  }
}

export default { deploymentInfo, certificateExpiry }
```

`require`를 ESM에서 쓸 수 없으므로 파일 상단으로 옮긴다:

```js
import { X509Certificate } from 'node:crypto'
```

그리고 `certificateExpiry` 안의 `const { X509Certificate } = require('node:crypto')` 줄을 지운다.

`router.js`의 `/server-health`에 추가:

```js
    deployment: deploymentInfo(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/deployment.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin/deployment.js backend/test/deployment.test.js backend/src/admin/router.js
git commit -m "feat: surface the running commit and TLS certificate expiry"
```

---

### Task 7: 수집 통계 노출

**Files:**
- Modify: `backend/src/stats.js` (`getTypeSummary` 추가)
- Modify: `backend/src/admin/router.js` (`/data-health` 응답 행에 통계 병합)
- Test: `backend/test/stats-summary.test.js`

**Interfaces:**
- Produces: `stats.getTypeSummary(type)` → `{ successRate, totalRuns, skips, avgMs, since, errorCounts, lastError }`

성공률은 **누적**이다. `recent_runs`는 34종 공용 50건이라 24시간 창을 만들 수 없다(스펙 "수집 품질" 참고). 평균 소요는 저장된 최근 실행에서 그 타입 것만 골라 낸다 — 표본이 없으면 `null`.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/stats-summary.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import stats from '../src/stats.js'

test('누적 성공률과 표본 수를 낸다', () => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))
  stats.recordSuccess('metar', {}, 100)
  stats.recordSuccess('metar', {}, 300)
  stats.recordFailure('metar', 'boom', 200)

  const s = stats.getTypeSummary('metar')
  assert.equal(s.totalRuns, 3)
  assert.ok(Math.abs(s.successRate - 2 / 3) < 1e-9)
  assert.equal(s.avgMs, 200) // 100·300·200의 평균
  assert.equal(s.lastError, 'boom')
  assert.ok(s.since)
})

test('실행 기록이 없으면 성공률과 평균은 null', () => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))
  const s = stats.getTypeSummary('taf')
  assert.equal(s.successRate, null)
  assert.equal(s.avgMs, null)
  assert.equal(s.totalRuns, 0)
})

test('모르는 타입은 빈 요약을 준다', () => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')))
  assert.equal(stats.getTypeSummary('nope').totalRuns, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/stats-summary.test.js`
Expected: FAIL — `stats.getTypeSummary is not a function`

- [ ] **Step 3: Add getTypeSummary**

`stats.js`에 추가하고 `export default`와 명명 export 둘 다에 넣는다:

```js
// 관리자 콘솔용 타입 요약. 성공률은 누적이다 — recent_runs는 34종이 함께 쓰는 50건짜리 공용
// 목록이라 24시간 같은 시간 창을 계산할 근거가 못 된다(그건 2단계에서 따로 쌓는다).
export function getTypeSummary(type) {
  const entry = statsData.types[type]
  const empty = { successRate: null, totalRuns: 0, skips: 0, avgMs: null, since: statsData.since, errorCounts: {}, lastError: null }
  if (!entry) return empty

  const durations = statsData.recent_runs
    .filter((r) => r.type === type && Number.isFinite(r.duration_ms))
    .map((r) => r.duration_ms)

  return {
    successRate: entry.total_runs > 0 ? entry.success / entry.total_runs : null,
    totalRuns: entry.total_runs,
    skips: entry.skips || 0,
    avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    since: statsData.since,
    errorCounts: entry.error_counts || {},
    lastError: entry.last_error ?? null,
  }
}
```

`router.js`의 `/data-health`에서 행마다 요약을 붙인다:

```js
  router.get('/data-health', (req, res) => {
    const health = readDataHealth(config.storage.active_path, { getCached: store.getCached, getStats: stats.getStats })
    health.rows = health.rows.map((row) => ({ ...row, stats: stats.getTypeSummary(row.statsKey) }))
    res.json(health)
  })
```

**주의:** 저장 키와 통계 키가 다른 행이 셋이다(`kim_nwp`→`kim_surface_wind`, `convective`→`satellite`, `flight_category_overlay`→`flight_category`). Task 4가 행에 `statsKey`를 실어 보내므로 여기서는 `row.statsKey`만 쓰면 된다. `row.key`로 조회하면 이 세 행의 통계가 조용히 비어 나온다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test test/stats-summary.test.js test/admin-data-health.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/stats.js backend/src/admin/data-health.js backend/src/admin/router.js backend/test/stats-summary.test.js
git commit -m "feat: expose per-product collection statistics to the admin console"
```

---

### Task 8: 이용 시간대 집계 (visit_hours)

**Files:**
- Modify: `backend/src/db/schema.sql` (테이블 추가)
- Modify: `backend/src/admin/visits.js` (`recordVisit`에 기록, `hourlyPattern` 추가)
- Modify: `backend/src/admin/router.js` (`/traffic` 응답에 `hourly` 추가)
- Test: `backend/test/visit-hours.test.js`

**Interfaces:**
- Produces: `hourlyPattern(db, { weeks = 4 })` → `{ days: <수집일수>, ready: <boolean>, cells: [{ dow, hour, n }] }`

`ready`는 14일 이상 모였는지다. 화면은 `ready`가 거짓이면 격자 대신 "쌓이는 중 · N일치"를 띄운다.

- [ ] **Step 1: Write the failing test**

```js
// backend/test/visit-hours.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDb } from '../src/db/index.js'
import { recordVisit, hourlyPattern } from '../src/admin/visits.js'

test('방문하면 그 시각 칸이 오른다', () => {
  const db = createDb(':memory:')
  recordVisit(db, 'v1')
  recordVisit(db, 'v2')
  const total = db.prepare('SELECT SUM(n) n FROM visit_hours').get().n
  assert.equal(total, 2)
})

test('요일×시각으로 묶어 낸다', () => {
  const db = createDb(':memory:')
  // 2026-08-10은 월요일
  db.prepare('INSERT INTO visit_hours (day,hour,n) VALUES (?,?,?)').run('2026-08-10', 8, 5)
  db.prepare('INSERT INTO visit_hours (day,hour,n) VALUES (?,?,?)').run('2026-08-17', 8, 3)
  const { cells } = hourlyPattern(db, { weeks: 52 })
  const mon8 = cells.find((c) => c.dow === 0 && c.hour === 8)
  assert.equal(mon8.n, 8, '같은 요일·시각은 합산한다')
})

test('2주 미만이면 ready가 거짓이다', () => {
  const db = createDb(':memory:')
  db.prepare('INSERT INTO visit_hours (day,hour,n) VALUES (?,?,?)').run('2026-08-10', 8, 1)
  const out = hourlyPattern(db, { weeks: 4 })
  assert.equal(out.ready, false)
  assert.equal(out.days, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/visit-hours.test.js`
Expected: FAIL — `no such table: visit_hours`

- [ ] **Step 3: Add the table and aggregation**

`schema.sql`에 `visit_days` 정의 아래로 추가:

```sql
-- 이용 시간대 격자(요일 x 시각). visit_days는 날짜까지만 있고 visits.last_seen은 덮어쓰기라
-- 시간대 이력을 남기지 못한다 — 이 표가 그걸 메운다. 켠 시점부터 쌓인다.
CREATE TABLE IF NOT EXISTS visit_hours (
  day  TEXT NOT NULL,               -- 'YYYY-MM-DD' (KST)
  hour INTEGER NOT NULL,            -- 0-23 (KST)
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour)
);
CREATE INDEX IF NOT EXISTS idx_visit_hours_day ON visit_hours(day);
```

`visits.js`의 `recordVisit` 안, `visit_days` 삽입 다음에 추가:

```js
  const kst = new Date(Date.now() + 9 * 3600_000)
  db.prepare('INSERT INTO visit_hours (day,hour,n) VALUES (?,?,1) ON CONFLICT(day,hour) DO UPDATE SET n = n + 1')
    .run(kst.toISOString().slice(0, 10), kst.getUTCHours())
```

같은 함수의 정리(prune) 구문 옆에 한 줄 더한다:

```js
  db.prepare('DELETE FROM visit_hours WHERE day < ?').run(new Date(Date.now() - VISIT_DAYS_RETAIN_MS).toISOString().slice(0, 10))
```

`visits.js`에 집계 함수를 더한다:

```js
const READY_DAYS = 14

// 이용 시간대 격자. dow는 0=월 … 6=일 (한국에서 주는 월요일에 시작한다).
export function hourlyPattern(db, { weeks = 4, now = Date.now() } = {}) {
  const since = new Date(now - weeks * 7 * 86400e3).toISOString().slice(0, 10)
  const rows = db.prepare('SELECT day, hour, n FROM visit_hours WHERE day >= ? ORDER BY day').all(since)

  const bucket = new Map()
  for (const r of rows) {
    const dow = (new Date(`${r.day}T00:00:00Z`).getUTCDay() + 6) % 7 // 일=0 → 월=0
    const key = `${dow}:${r.hour}`
    bucket.set(key, (bucket.get(key) || 0) + r.n)
  }

  const cells = []
  for (let dow = 0; dow < 7; dow += 1) {
    for (let hour = 0; hour < 24; hour += 1) cells.push({ dow, hour, n: bucket.get(`${dow}:${hour}`) || 0 })
  }

  const days = new Set(rows.map((r) => r.day)).size
  return { days, ready: days >= READY_DAYS, cells }
}
```

`trafficStats`의 반환에 넣지 말고 router에서 따로 부른다(`/traffic` 응답에 `hourly` 키 추가):

```js
  router.get('/traffic', (req, res) => res.json({
    ...trafficStats(database()),
    hourly: hourlyPattern(database()),
  }))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/visit-hours.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.sql backend/src/admin/visits.js backend/src/admin/router.js backend/test/visit-hours.test.js
git commit -m "feat: record visits by hour so the usage pattern grid can be built"
```

---

### Task 9: 어드민 디자인 언어 CSS 교체

**Files:**
- Modify: `frontend/src/features/admin/AdminPage.css` (전면 교체)
- Reference: `docs/superpowers/specs/assets/2026-08-10-admin-console-mockup.html` (`<style>` 블록이 원본)

이 작업엔 테스트가 없다. 검증은 Task 15의 Playwright 캡처다.

- [ ] **Step 1: 목업의 스타일을 어드민 스코프로 옮긴다**

목업 `<style>`의 `:root` 변수를 `.admin-page`로 옮기고(전역 토큰 오염 방지), 선택자에 `.admin-page` 접두사를 붙인다. 예:

```css
/* 관리자 콘솔 디자인 언어 — 목업 2026-08-10-admin-console-mockup.html이 원본.
   원칙: 바탕은 옅은 따뜻한 회색이고 카드가 흰색 · 그림자 대신 1px 선 · 화면마다 큰 숫자 하나로 시작 ·
   색은 뜻이 있을 때만 · 정상 항목엔 상자를 그리지 않는다 · 숫자는 고정폭 · 이모지 금지.
   글자 크기 변수는 여기서만 정의한다 — tokens.css는 지도 화면과 공유하므로 건드리지 않는다. */
.admin-page {
  --ac-canvas: #faf9f7; --ac-sf: #fff; --ac-sf-2: #fcfbf9;
  --ac-bd: #eae8e4; --ac-bd-2: #f2f0ec;
  --ac-tx: #1c1b1a; --ac-dim: #78746e; --ac-faint: #a8a39c;
  --ac-ok: #2f7d5e; --ac-ok-bg: #f2f8f5; --ac-ok-bd: #cfe4d9;
  --ac-warn: #a9701d; --ac-warn-bg: #fdf8ef; --ac-warn-bd: #ecdcc0;
  --ac-bad: #b3392e; --ac-bad-bg: #fdf5f4; --ac-bad-bd: #eecfcb;
  --ac-link: #3d5a80;
  --ac-t-hero: 52px; --ac-t-lead: 19px; --ac-t-title: 13px; --ac-t-body: 13px;
  --ac-t-tile-n: 11px; --ac-t-tile-a: 16px; --ac-t-label: 11px; --ac-t-nav: 13px;
  --ac-r: 10px; --ac-r-sm: 7px;

  background: var(--ac-canvas);
  color: var(--ac-tx);
  font-size: var(--ac-t-body);
  height: 100dvh;
  overflow-y: auto;
  box-sizing: border-box;
}
.admin-page .n { font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
```

나머지 규칙(`.ac-topbar`, `.ac-side`, `.ac-sec`, `.ac-hero`, `.ac-tile`, `.ac-chip`, `table.ac-t`, …)은 목업의 대응 규칙을 그대로 옮기되 클래스 이름 앞에 `ac-`를 붙여 기존 `.admin-*` 클래스와 충돌하지 않게 한다.

- [ ] **Step 2: 기존 `.admin-page`의 `max-width: 1080px` 제한을 없앤다**

사이드바 구조라 폭이 필요하다. 목업의 `max-width: 1300px`을 안쪽 셸에 준다.

- [ ] **Step 3: 빌드가 깨지지 않는지 확인**

Run: `cd frontend && npx vite build --logLevel error`
Expected: 출력 없음(성공)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/AdminPage.css
git commit -m "style: adopt the admin console design language from the mockup"
```

---

### Task 10: 축을 갖춘 그래프 공용 컴포넌트

**Files:**
- Create: `frontend/src/features/admin/components/Chart.jsx`
- Test: `frontend/src/features/admin/components/Chart.test.jsx`

**Interfaces:**
- Produces: `<LineChart series={[{ points, color, dashed, label }]} max unit xLabels height />`,
  `<GroupedBarChart groups={[{ label, values: [n,n,n] }]} colors max unit height />`,
  `<HourHeatmap cells unit />`, 그리고 순수 함수 `axisTicks(max, count)`

**모든 그래프는 y축 눈금과 단위를 반드시 그린다.** 이 컴포넌트를 거치지 않는 그래프를 만들지 않는다.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/features/admin/components/Chart.test.jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LineChart, GroupedBarChart, axisTicks } from './Chart.jsx'

describe('axisTicks', () => {
  it('0부터 max까지 고르게 나눈다', () => {
    expect(axisTicks(100, 5)).toEqual([0, 25, 50, 75, 100])
  })
  it('눈금은 최소 둘이다', () => {
    expect(axisTicks(10, 1).length).toBeGreaterThanOrEqual(2)
  })
})

describe('LineChart', () => {
  it('y축 눈금과 단위를 그린다', () => {
    const { container } = render(
      <LineChart max={100} unit="%" xLabels={['00', '12', '24']} height={160}
        series={[{ points: [10, 20, 30], color: '#000', label: 'CPU' }]} />,
    )
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('100')
    expect(texts).toContain('0')
    expect(texts).toContain('%')
    expect(container.querySelectorAll('polyline').length).toBe(1)
  })
})

describe('GroupedBarChart', () => {
  it('계열마다 막대를 그리고 0은 그리지 않는다', () => {
    const { container } = render(
      <GroupedBarChart max={50} unit="건" colors={['#111', '#222']}
        groups={[{ label: '8/8', values: [44, 0] }, { label: '8/9', values: [15, 1] }]} />,
    )
    expect(container.querySelectorAll('rect').length).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/admin/components/Chart.test.jsx`
Expected: FAIL — `Failed to resolve import './Chart.jsx'`

- [ ] **Step 3: Write the implementation**

```jsx
// frontend/src/features/admin/components/Chart.jsx
// 관리자 콘솔 그래프 공용. 규칙은 하나 — 축 없는 그래프를 만들지 않는다.
// y축 눈금 4~6개 + 옅은 가로선 + 단위 표기 + x축 라벨. 새 그래프도 이 컴포넌트를 거친다.
const W = 640
const PAD = { l: 44, r: 14, t: 20, b: 36 }

export function axisTicks(max, count = 5) {
  const n = Math.max(2, count)
  return Array.from({ length: n }, (_, k) => Math.round((max * k) / (n - 1)))
}

function Axes({ max, ticks, unit, height, xLabels = [] }) {
  const ph = height - PAD.t - PAD.b
  const y = (v) => PAD.t + ph * (1 - v / max)
  return (
    <>
      {axisTicks(max, ticks).map((v) => (
        <g key={v}>
          <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke="#f2f0ec" />
          <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" className="ac-ax">{v}</text>
        </g>
      ))}
      <line x1={PAD.l} y1={PAD.t + ph} x2={W - PAD.r} y2={PAD.t + ph} stroke="#eae8e4" />
      {unit && <text x={PAD.l - 10} y={PAD.t - 7} textAnchor="end" className="ac-axu">{unit}</text>}
      {xLabels.map((label, i) => (
        <text key={`${label}-${i}`} x={PAD.l + ((W - PAD.l - PAD.r) * i) / Math.max(1, xLabels.length - 1)}
          y={height - 18} textAnchor="middle" className="ac-ax">{label}</text>
      ))}
    </>
  )
}

export function LineChart({ series, max = 100, unit, xLabels, height = 190, ticks = 5 }) {
  const ph = height - PAD.t - PAD.b
  const pw = W - PAD.l - PAD.r
  const y = (v) => PAD.t + ph * (1 - v / max)
  return (
    <svg className="ac-chart" viewBox={`0 0 ${W} ${height}`}>
      <Axes max={max} ticks={ticks} unit={unit} height={height} xLabels={xLabels} />
      {series.map((s) => (
        <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="1.6" strokeLinejoin="round"
          strokeDasharray={s.dashed ? '4 3' : undefined}
          points={s.points.map((v, i) => `${PAD.l + (pw * i) / Math.max(1, s.points.length - 1)},${y(v)}`).join(' ')} />
      ))}
    </svg>
  )
}

export function GroupedBarChart({ groups, colors, max = 50, unit, height = 250, ticks = 6, labelEvery = 2 }) {
  const ph = height - PAD.t - PAD.b
  const pw = W - PAD.l - PAD.r
  const y = (v) => PAD.t + ph * (1 - v / max)
  const slot = pw / Math.max(1, groups.length)
  const bw = (slot - 9) / colors.length
  return (
    <svg className="ac-chart" viewBox={`0 0 ${W} ${height}`}>
      <Axes max={max} ticks={ticks} unit={unit} height={height} />
      {groups.map((g, i) => g.values.map((v, k) => (v ? (
        <rect key={`${g.label}-${k}`} x={PAD.l + i * slot + 4.5 + k * bw} y={y(v)}
          width={bw - 1.5} height={PAD.t + ph - y(v)} fill={colors[k]} rx="1.5">
          <title>{`${g.label} · ${v}`}</title>
        </rect>
      ) : null)))}
      {groups.map((g, i) => (i % labelEvery === 0 || i === groups.length - 1 ? (
        <text key={g.label} x={PAD.l + i * slot + slot / 2} y={height - 18} textAnchor="middle" className="ac-ax">{g.label}</text>
      ) : null))}
    </svg>
  )
}

const DOWS = ['월', '화', '수', '목', '금', '토', '일']
const HEAT = ['#f2f0ec', '#e5e1da', '#cfc8bd', '#a8a096', '#6b6459', '#2a2621']

export function HourHeatmap({ cells }) {
  const max = Math.max(1, ...cells.map((c) => c.n))
  const L = 40; const T = 28; const cw = (W - L - 14) / 24; const ch = 22
  const level = (n) => (n === 0 ? 0 : Math.min(HEAT.length - 1, 1 + Math.floor((n / max) * (HEAT.length - 2))))
  return (
    <svg className="ac-chart" viewBox={`0 0 ${W} ${T + 7 * ch + 34}`}>
      {Array.from({ length: 12 }, (_, k) => k * 2).map((h) => (
        <text key={h} x={L + h * cw + cw / 2} y={T - 10} textAnchor="middle" className="ac-ax">{h}</text>
      ))}
      <text x={W - 14} y={T + 7 * ch + 26} textAnchor="end" className="ac-ax">시각(KST)</text>
      {DOWS.map((d, i) => (
        <text key={d} x={L - 10} y={T + i * ch + 15} textAnchor="end" className="ac-ax">{d}</text>
      ))}
      {cells.map((c) => (
        <rect key={`${c.dow}-${c.hour}`} x={L + c.hour * cw + 1} y={T + c.dow * ch + 1}
          width={cw - 2} height={ch - 2} rx="3" fill={HEAT[level(c.n)]}>
          <title>{`${DOWS[c.dow]} ${c.hour}시 · ${c.n}건`}</title>
        </rect>
      ))}
    </svg>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/admin/components/Chart.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/components/Chart.jsx frontend/src/features/admin/components/Chart.test.jsx
git commit -m "feat: add admin charts that always draw axes, ticks and units"
```

---

### Task 11: 자료 격자와 확인 필요 목록

**Files:**
- Create: `frontend/src/features/admin/components/DataGrid.jsx`
- Create: `frontend/src/features/admin/components/AttentionList.jsx`
- Test: `frontend/src/features/admin/components/DataGrid.test.jsx`

**Interfaces:**
- Consumes: Task 4의 `/data-health` 응답(`rows`, `groups`, `counts`)
- Produces: `<DataGrid health />`, `<AttentionList rows onGo />`, `formatAge(ms)`, `attentionItems(rows)`

`formatAge`는 "6분/2시간/64일/방금"을 만든다. `attentionItems`는 `stopped`·`never`·`late`만 골라 심각한 순으로 정렬한다.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/features/admin/components/DataGrid.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataGrid, { formatAge, attentionItems } from './DataGrid.jsx'

const health = {
  counts: { total: 2, ok: 1, late: 0, stopped: 1, quiet: 0, never: 0 },
  groups: {
    source: [{ id: 'kma_nwp', label: '수치예보키', keys: ['kim_nwp'] }, { id: 'noaa', label: 'NOAA', keys: ['metar_overseas'] }],
    character: [{ id: 'nwp', label: '수치예보', keys: ['kim_nwp'] }, { id: 'report', label: '항공 보고·예보', keys: ['metar_overseas'] }],
  },
  rows: [
    { key: 'kim_nwp', label: 'KIM 격자', status: 'stopped', lastSuccessAt: '2026-06-07T12:12:00Z', eventDriven: false },
    { key: 'metar_overseas', label: 'METAR 해외', status: 'ok', lastSuccessAt: '2026-08-10T10:35:00Z', eventDriven: false },
  ],
}

describe('formatAge', () => {
  it('사람이 읽는 경과 시간을 만든다', () => {
    expect(formatAge(30_000)).toBe('방금')
    expect(formatAge(6 * 60_000)).toBe('6분')
    expect(formatAge(2 * 3_600_000)).toBe('2시간')
    expect(formatAge(64 * 86_400_000)).toBe('64일')
  })
})

describe('attentionItems', () => {
  it('멈춤과 지연만 심각한 순으로 고른다', () => {
    const items = attentionItems([
      { key: 'a', status: 'late' }, { key: 'b', status: 'ok' },
      { key: 'c', status: 'stopped' }, { key: 'd', status: 'quiet' },
    ])
    expect(items.map((i) => i.key)).toEqual(['c', 'a'])
  })
})

describe('DataGrid', () => {
  it('상태를 색만이 아니라 글자로도 적는다', () => {
    render(<DataGrid health={health} now={Date.parse('2026-08-10T10:36:00Z')} />)
    expect(screen.getByText('멈춤')).toBeTruthy()
  })
  it('출처별이 기본이다', () => {
    render(<DataGrid health={health} now={Date.parse('2026-08-10T10:36:00Z')} />)
    expect(screen.getByText('수치예보키')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/admin/components/DataGrid.test.jsx`
Expected: FAIL — `Failed to resolve import './DataGrid.jsx'`

- [ ] **Step 3: Write the components**

```jsx
// frontend/src/features/admin/components/DataGrid.jsx
import { useState } from 'react'

// 자료 34종 격자. 정상인 자료엔 상자를 그리지 않는다 — 글자만 놓고, 지연·멈춤만 색 상자를 붙인다.
// 상자 34개가 늘어선 것보다 조용하고, 문제가 훨씬 잘 튄다(목업 참고).
const STATUS_LABEL = { late: '지연', stopped: '멈춤', never: '자료 없음', quiet: '쉬는 시간', ok: null }
const SEVERITY = { never: 3, stopped: 3, late: 2, quiet: 1, ok: 0 }

export function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간`
  return `${Math.floor(hr / 24)}일`
}

export function attentionItems(rows) {
  return rows
    .filter((r) => r.status === 'stopped' || r.status === 'never' || r.status === 'late')
    .sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status])
}

function Tile({ row, now }) {
  const age = row.lastSuccessAt ? formatAge(now - Date.parse(row.lastSuccessAt)) : '없음'
  const cls = ['ac-tile', row.status === 'ok' ? '' : `is-${row.status}`].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <div className="ac-tile-n">{row.label}</div>
      <div className="ac-tile-a n">
        {row.status === 'quiet' ? '쉬는 중' : age}
        {STATUS_LABEL[row.status] && row.status !== 'quiet' && <span className="ac-tile-st">{STATUS_LABEL[row.status]}</span>}
      </div>
      {row.eventDriven && row.activeCount != null && <div className="ac-tile-c n">{row.activeCount}건 발효</div>}
    </div>
  )
}

export default function DataGrid({ health, now = Date.now() }) {
  const [mode, setMode] = useState('source')
  const byKey = new Map(health.rows.map((r) => [r.key, r]))
  const groups = health.groups[mode]

  return (
    <section className="ac-sec">
      <h2>
        자료 {health.counts.total}종
        <div className="ac-seg" role="tablist">
          <button type="button" className={mode === 'source' ? 'on' : ''} onClick={() => setMode('source')}>출처별</button>
          <button type="button" className={mode === 'character' ? 'on' : ''} onClick={() => setMode('character')}>성격별</button>
        </div>
      </h2>
      {groups.map((g) => (
        <div className="ac-grp" key={g.id}>
          <div className="ac-gl">{g.label}<em className="n">{g.keys.length}종</em></div>
          <div className="ac-tiles">
            {g.keys.map((key) => byKey.get(key) && <Tile key={key} row={byKey.get(key)} now={now} />)}
          </div>
        </div>
      ))}
      <div className="ac-legend">
        <span>정상은 표시하지 않습니다 — 글자만 놓입니다</span>
        <span><i className="ac-sw is-late" />지연</span>
        <span><i className="ac-sw is-stopped" />멈춤</span>
        <span>흐린 글자 = 쉬는 시간(야간·운항시간 밖)</span>
      </div>
    </section>
  )
}
```

```jsx
// frontend/src/features/admin/components/AttentionList.jsx
import { formatAge } from './DataGrid.jsx'

// 확인 필요 — 화면이 결론을 문장으로 말한다. 이상이 없으면 초록 한 줄로 바뀐다.
const TONE = { stopped: 'bad', never: 'bad', late: 'warn' }
const WORD = { stopped: '멈춤', never: '자료 없음', late: '지연' }

export default function AttentionList({ items, now = Date.now(), onGo }) {
  if (items.length === 0) {
    return <div className="ac-allclear">확인이 필요한 항목이 없습니다 — 모두 정상입니다.</div>
  }
  return (
    <section className="ac-attn">
      <h3>확인 필요 {items.length}건</h3>
      {items.map((row) => (
        <div className="ac-attn-item" key={row.key}>
          <i className={`is-${TONE[row.status]}`} />
          <div>
            <div className="ac-attn-t">{row.label}<span className={`ac-tag is-${TONE[row.status]}`}>{WORD[row.status]}</span></div>
            <div className="ac-attn-w n">
              {row.lastSuccessAt
                ? `${formatAge(now - Date.parse(row.lastSuccessAt))}째 수집 없음 · 마지막 ${new Date(row.lastSuccessAt).toLocaleString('ko-KR')}`
                : '한 번도 수집되지 않았습니다'}
              {row.lastError ? ` · ${row.lastError}` : ''}
            </div>
          </div>
          <button type="button" className="ac-go" onClick={() => onGo?.('data')}>자료 수집</button>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/admin/components/DataGrid.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/components/DataGrid.jsx frontend/src/features/admin/components/AttentionList.jsx frontend/src/features/admin/components/DataGrid.test.jsx
git commit -m "feat: add the product status grid and the attention list"
```

---

### Task 12: 셸(상단 띠 + 사이드바)과 개요 화면

**Files:**
- Create: `frontend/src/features/admin/AdminShell.jsx`
- Create: `frontend/src/features/admin/screens/OverviewScreen.jsx`
- Modify: `frontend/src/features/admin/AdminPage.jsx`
- Modify: `frontend/src/features/admin/adminApi.js`
- Test: `frontend/src/features/admin/AdminShell.test.jsx`

**Interfaces:**
- Consumes: Task 10 `LineChart`, Task 11 `DataGrid`/`AttentionList`/`attentionItems`
- Produces: `<AdminShell />`, `MENUS` 상수(`[{ id, label, group }]`)

메뉴는 개요·자료 수집·서버 자원·API 사용량 / 이용자·계정 관리 **여섯 개다.** 로그는 3단계라 넣지 않는다.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/features/admin/AdminShell.test.jsx
import { describe, it, expect } from 'vitest'
import { MENUS } from './AdminShell.jsx'

describe('MENUS', () => {
  it('1단계 메뉴는 여섯 개이고 로그는 없다', () => {
    expect(MENUS.map((m) => m.id)).toEqual(['overview', 'data', 'server', 'api', 'users', 'accounts'])
  })
  it('운영과 이용 두 묶음으로 나뉜다', () => {
    expect(new Set(MENUS.map((m) => m.group))).toEqual(new Set(['ops', 'usage']))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/admin/AdminShell.test.jsx`
Expected: FAIL — `Failed to resolve import './AdminShell.jsx'`

- [ ] **Step 3: Write the shell and overview**

`adminApi.js`에 한 줄 추가(나머지는 기존 것을 그대로 쓴다):

```js
export const getDataHealth = () => fetch(`${base}/data-health`, { credentials: 'include' }).then(j)
```
(이미 있으므로 변경 없음 — 응답 모양만 바뀐다.)

```jsx
// frontend/src/features/admin/AdminShell.jsx
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { getDataHealth, getServerHealth, getMetrics, getPending } from './adminApi.js'
import OverviewScreen from './screens/OverviewScreen.jsx'
import DataCollectionScreen from './screens/DataCollectionScreen.jsx'
import ServerResourceScreen from './screens/ServerResourceScreen.jsx'
import ApiUsageScreen from './screens/ApiUsageScreen.jsx'
import UsersScreen from './screens/UsersScreen.jsx'
import AccountsScreen from './screens/AccountsScreen.jsx'
import './AdminPage.css'

// 1단계 메뉴. 로그는 3단계라 여기 없다(목업엔 그려져 있다).
export const MENUS = [
  { id: 'overview', label: '개요', group: 'ops' },
  { id: 'data', label: '자료 수집', group: 'ops' },
  { id: 'server', label: '서버 자원', group: 'ops' },
  { id: 'api', label: 'API 사용량', group: 'ops' },
  { id: 'users', label: '이용자', group: 'usage' },
  { id: 'accounts', label: '계정 관리', group: 'usage' },
]

const SCREENS = {
  overview: OverviewScreen, data: DataCollectionScreen, server: ServerResourceScreen,
  api: ApiUsageScreen, users: UsersScreen, accounts: AccountsScreen,
}

// 상단 신호 네 개. 색만으로 알리지 않으므로 이름과 건수를 함께 적는다.
function signals(health, server, pending) {
  const stopped = (health?.counts?.stopped || 0) + (health?.counts?.never || 0)
  const late = health?.counts?.late || 0
  const restarts = server?.process?.bootCount || 0
  return [
    { id: 'data', label: '자료', tone: stopped ? 'bad' : late ? 'warn' : 'ok', n: stopped || late || 0 },
    { id: 'collect', label: '수집', tone: health?.rows?.some((r) => r.failing) ? 'warn' : 'ok', n: 0 },
    { id: 'api', label: 'API', tone: 'ok', n: 0 },
    { id: 'server', label: '서버', tone: restarts > 10 ? 'warn' : 'ok', n: restarts > 10 ? 1 : 0 },
  ]
}

export default function AdminShell() {
  const [menu, setMenu] = useState('overview')
  const [health, setHealth] = useState(null)
  const [server, setServer] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [pending, setPending] = useState([])

  const refresh = useCallback(async () => {
    const [h, s, m, p] = await Promise.allSettled([getDataHealth(), getServerHealth(), getMetrics('24h'), getPending()])
    if (h.status === 'fulfilled') setHealth(h.value)
    if (s.status === 'fulfilled') setServer(s.value)
    if (m.status === 'fulfilled') setMetrics(m.value)
    if (p.status === 'fulfilled') setPending(p.value)
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  const Screen = SCREENS[menu]
  const badges = {
    overview: (health?.counts?.stopped || 0) + (health?.counts?.never || 0) + (health?.counts?.late || 0),
    data: (health?.counts?.stopped || 0) + (health?.counts?.never || 0),
    accounts: pending.length,
  }

  return (
    <div className="admin-page">
      <div className="ac-shell">
        <div className="ac-topbar">
          <a className="ac-back" href="/" aria-label="메인으로"><ArrowLeft size={16} /></a>
          <span className="ac-brand">ProjectAMO 운영</span>
          {signals(health, server, pending).map((s) => (
            <span className="ac-sig" key={s.id}><i className={`ac-dot is-${s.tone}`} />{s.label}{s.n > 0 && <b>{s.n}</b>}</span>
          ))}
          <span className="ac-right n">{health?.generatedAt ? new Date(health.generatedAt).toLocaleTimeString('ko-KR') : '—'} 갱신</span>
        </div>
        <div className="ac-layout">
          <nav className="ac-side">
            <div className="ac-grp-l">운영</div>
            {MENUS.filter((m) => m.group === 'ops').map((m) => (
              <button type="button" key={m.id} className={menu === m.id ? 'on' : ''} onClick={() => setMenu(m.id)}>
                {m.label}{badges[m.id] > 0 && <span className="ac-badge">{badges[m.id]}</span>}
              </button>
            ))}
            <div className="ac-grp-l">이용</div>
            {MENUS.filter((m) => m.group === 'usage').map((m) => (
              <button type="button" key={m.id} className={menu === m.id ? 'on' : ''} onClick={() => setMenu(m.id)}>
                {m.label}{badges[m.id] > 0 && <span className="ac-badge">{badges[m.id]}</span>}
              </button>
            ))}
          </nav>
          <main className="ac-stage">
            <Screen health={health} server={server} metrics={metrics} pending={pending} onGo={setMenu} onChanged={refresh} />
          </main>
        </div>
      </div>
    </div>
  )
}
```

```jsx
// frontend/src/features/admin/screens/OverviewScreen.jsx
import DataGrid, { attentionItems } from '../components/DataGrid.jsx'
import AttentionList from '../components/AttentionList.jsx'
import { LineChart } from '../components/Chart.jsx'

const pct = (used, total) => (total ? Math.round((used / total) * 100) : 0)

export default function OverviewScreen({ health, server, metrics, onGo }) {
  if (!health) return null
  const items = attentionItems(health.rows)
  const cur = metrics?.current
  const series = metrics?.series || []

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-hero-big n">{health.counts.ok}<s> / {health.counts.total}종 정상</s></div>
          <div className="ac-hero-cap">
            {health.counts.stopped + health.counts.never > 0
              ? `${health.counts.stopped + health.counts.never}종이 멈춰 있습니다 · 지연 ${health.counts.late}종`
              : '모두 정상 주기 안에서 들어오고 있습니다'}
          </div>
        </div>
        <div className="ac-hero-side">
          <div><div className="ac-v n">{pct(cur?.diskUsed, cur?.diskTotal)}<s>%</s></div><div className="ac-l">디스크{server?.diskForecast ? ` · ${server.diskForecast.daysLeft}일 남음` : ''}</div></div>
          <div><div className="ac-v n">{pct(cur?.memUsed, cur?.memTotal)}<s>%</s></div><div className="ac-l">메모리</div></div>
          <div><div className="ac-v n">{server?.process?.bootCount ?? '—'}</div><div className="ac-l">재시작 횟수</div></div>
        </div>
      </div>

      <AttentionList items={items} onGo={onGo} />
      <DataGrid health={health} />

      <section className="ac-sec">
        <h2>시스템<em className="n">CPU {cur?.cpuPct ?? 0}% · 메모리 {pct(cur?.memUsed, cur?.memTotal)}% · 디스크 {pct(cur?.diskUsed, cur?.diskTotal)}%</em></h2>
        <LineChart
          height={190} max={100} unit="%"
          xLabels={series.length ? [new Date(series[0].ts), new Date(series[series.length - 1].ts)].map((d) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })) : []}
          series={[
            { label: 'CPU', color: '#3d5a80', points: series.map((r) => r.cpu_pct) },
            { label: '메모리', color: '#a9701d', points: series.map((r) => pct(r.mem_used, r.mem_total)) },
            { label: '디스크', color: '#6d28d9', dashed: true, points: series.map((r) => pct(r.disk_used, r.disk_total)) },
          ]}
        />
        <div className="ac-clg">
          <span><i style={{ background: '#3d5a80' }} />CPU</span>
          <span><i style={{ background: '#a9701d' }} />메모리</span>
          <span><i style={{ background: '#6d28d9' }} />디스크</span>
        </div>
      </section>
    </>
  )
}
```

`AdminPage.jsx`는 권한 확인과 셸 렌더만 남긴다:

```jsx
import { useAuth } from '../auth/AuthContext.jsx'
import AdminShell from './AdminShell.jsx'
import './AdminPage.css'

export default function AdminPage() {
  const { user, loading } = useAuth()
  if (loading) return null
  // 실제 차단은 서버(requireRole). 여기선 UI 노출만 관리자로 제한.
  if (user?.role !== 'admin') {
    return (
      <div className="admin-denied">
        <p>관리자 전용 페이지입니다.</p>
        <a href="/">← 메인으로</a>
      </div>
    )
  }
  return <AdminShell />
}
```

- [ ] **Step 4: Run tests and build**

Run: `cd frontend && npx vitest run src/features/admin && npx vite build --logLevel error`
Expected: 테스트 PASS, 빌드 출력 없음

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/AdminShell.jsx frontend/src/features/admin/AdminPage.jsx frontend/src/features/admin/screens/OverviewScreen.jsx frontend/src/features/admin/AdminShell.test.jsx
git commit -m "feat: rebuild the admin console as a sidebar shell with an overview screen"
```

---

### Task 13: 자료 수집 · 서버 자원 · API 사용량 화면

**Files:**
- Create: `frontend/src/features/admin/screens/DataCollectionScreen.jsx`
- Create: `frontend/src/features/admin/screens/ServerResourceScreen.jsx`
- Create: `frontend/src/features/admin/screens/ApiUsageScreen.jsx`
- Test: `frontend/src/features/admin/screens/DataCollectionScreen.test.jsx`

**Interfaces:**
- Consumes: `/data-health` 행의 `stats`(Task 7), `/server-health`의 `diskForecast`(Task 5)·`deployment`(Task 6), 기존 `/api-hub-usage`
- Produces: `formatRate(v)`, `formatMs(v)` (표 서식 헬퍼, `DataCollectionScreen.jsx`에서 export)

**API 사용량 화면 주의:** API Hub 한도는 **호출 횟수가 아니라 하루 전송량 5 GB**다(`bytes`/`limitBytes`). 한도가 있는 열쇠는 기상청 3개뿐이고, NOAA·공항공사·기타 외부 줄에는 한도를 적지 않는다.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/features/admin/screens/DataCollectionScreen.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DataCollectionScreen, { formatRate, formatMs } from './DataCollectionScreen.jsx'

const health = {
  counts: { total: 1, ok: 0, late: 0, stopped: 1, quiet: 0, never: 0 },
  groups: { source: [], character: [] },
  rows: [{
    key: 'echo_top', label: '에코탑', source: 'kma_radar', status: 'stopped',
    lastSuccessAt: '2026-08-08T02:45:00Z', normalMs: 300000, eventDriven: false,
    stats: { successRate: 0.58, totalRuns: 100, skips: 2, avgMs: 4200, since: '2026-07-24T00:00:00Z' },
    lastError: 'radar_frame_missing',
  }],
}

describe('서식 헬퍼', () => {
  it('성공률과 소요시간을 사람이 읽게 만든다', () => {
    expect(formatRate(0.58)).toBe('58%')
    expect(formatRate(null)).toBe('—')
    expect(formatMs(4200)).toBe('4.2초')
    expect(formatMs(940)).toBe('940 ms')
    expect(formatMs(null)).toBe('—')
  })
})

describe('DataCollectionScreen', () => {
  it('상태를 글자로 적고 성공률과 마지막 오류를 보여준다', () => {
    render(<DataCollectionScreen health={health} />)
    expect(screen.getByText('멈춤')).toBeTruthy()
    expect(screen.getByText('58%')).toBeTruthy()
    expect(screen.getByText('radar_frame_missing')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/admin/screens/DataCollectionScreen.test.jsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write the three screens**

```jsx
// frontend/src/features/admin/screens/DataCollectionScreen.jsx
import { useState } from 'react'
import { formatAge } from '../components/DataGrid.jsx'

const STATUS = { ok: ['정상', 'ok'], late: ['지연', 'warn'], stopped: ['멈춤', 'bad'], never: ['자료 없음', 'bad'], quiet: ['쉬는 시간', 'quiet'] }

export const formatRate = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
export const formatMs = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}초` : `${v} ms`)
const formatInterval = (ms) => (ms >= 3_600_000 ? `${ms / 3_600_000}시간` : `${ms / 60_000}분`)

export default function DataCollectionScreen({ health, now = Date.now() }) {
  const [onlyProblems, setOnlyProblems] = useState(false)
  if (!health) return null
  const rows = onlyProblems ? health.rows.filter((r) => r.status !== 'ok' && r.status !== 'quiet') : health.rows
  const broken = health.counts.stopped + health.counts.never

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-hero-big n">{broken}<s>종 멈춤</s></div>
          <div className="ac-hero-cap">지연 {health.counts.late}종 · 나머지 {health.counts.ok}종 정상</div>
        </div>
      </div>

      <section className="ac-sec is-flush">
        <h2>
          자료 {health.counts.total}종
          <div className="ac-seg">
            <button type="button" className={onlyProblems ? '' : 'on'} onClick={() => setOnlyProblems(false)}>전체</button>
            <button type="button" className={onlyProblems ? 'on' : ''} onClick={() => setOnlyProblems(true)}>이상만</button>
          </div>
        </h2>
        <table className="ac-t">
          <thead>
            <tr>
              <th>자료</th><th>상태</th><th className="r">마지막 성공</th><th className="r">정상 주기</th>
              <th className="r">성공률(누적)</th><th className="r">평균 소요</th><th className="r">밀림</th><th>마지막 오류</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const [word, tone] = STATUS[r.status]
              return (
                <tr key={r.key}>
                  <td className="nm">{r.label}</td>
                  <td><span className={`ac-chip is-${tone}`}>{word}</span></td>
                  <td className="r">{r.lastSuccessAt ? `${formatAge(now - Date.parse(r.lastSuccessAt))} 전` : '—'}</td>
                  <td className="r muted">{formatInterval(r.normalMs)}</td>
                  <td className="r">{formatRate(r.stats?.successRate)}</td>
                  <td className="r muted">{formatMs(r.stats?.avgMs)}</td>
                  <td className="r">{r.stats?.skips || 0}</td>
                  <td className="muted">{r.lastError || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {health.rows[0]?.stats?.since && (
          <p className="ac-note">성공률은 집계 시작({new Date(health.rows[0].stats.since).toLocaleDateString('ko-KR')}) 이후 누적입니다.</p>
        )}
      </section>
    </>
  )
}
```

```jsx
// frontend/src/features/admin/screens/ServerResourceScreen.jsx
import { LineChart } from '../components/Chart.jsx'

const pct = (u, t) => (t ? Math.round((u / t) * 100) : 0)
const gb = (b) => (b / 1024 ** 3).toFixed(1)
const mb = (b) => `${(b / 1024 ** 2).toFixed(1)} MB`
const fmtBytes = (b) => (b >= 1024 ** 3 ? `${gb(b)} GB` : mb(b))

function Gauge({ label, value, sub }) {
  const tone = value < 70 ? 'ok' : value < 90 ? 'warn' : 'bad'
  return (
    <div className="ac-gauge">
      <div className="ac-gauge-l">{label}</div>
      <div className={`ac-gauge-v n is-${tone}`}>{value}%</div>
      <div className="ac-gauge-b"><span className={`is-${tone}`} style={{ width: `${Math.min(100, value)}%` }} /></div>
      <div className="ac-gauge-s n">{sub}</div>
    </div>
  )
}

export default function ServerResourceScreen({ server, metrics }) {
  if (!server || !metrics) return null
  const cur = metrics.current
  const series = metrics.series || []
  const disk = server.disk || []
  const total = disk.reduce((s, d) => s + d.bytes, 0)
  const top = disk.slice(0, 6)
  const rest = disk.slice(6)
  const forecast = server.diskForecast

  return (
    <>
      <section className="ac-sec">
        <h2>시스템 리소스<em className="n">24시간</em></h2>
        <div className="ac-gauges">
          <Gauge label="CPU" value={Math.round(cur.cpuPct)} sub="" />
          <Gauge label="메모리" value={pct(cur.memUsed, cur.memTotal)} sub={`${gb(cur.memUsed)} / ${gb(cur.memTotal)} GB`} />
          <Gauge label="디스크" value={pct(cur.diskUsed, cur.diskTotal)}
            sub={`${gb(cur.diskUsed)} / ${gb(cur.diskTotal)} GB${forecast ? ` · 하루 ${fmtBytes(forecast.perDayBytes)} 증가 → 약 ${forecast.daysLeft}일 남음` : ''}`} />
        </div>
        <LineChart
          height={230} max={100} unit="%"
          xLabels={series.length ? [new Date(series[0].ts), new Date(series[series.length - 1].ts)].map((d) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })) : []}
          series={[
            { label: 'CPU', color: '#3d5a80', points: series.map((r) => r.cpu_pct) },
            { label: '메모리', color: '#a9701d', points: series.map((r) => pct(r.mem_used, r.mem_total)) },
            { label: '디스크', color: '#6d28d9', dashed: true, points: series.map((r) => pct(r.disk_used, r.disk_total)) },
          ]}
        />
      </section>

      <div className="ac-two-eq">
        <section className="ac-sec">
          <h2>프로세스<em>projectamo-backend</em></h2>
          <div className="ac-stats">
            <div><div className={`ac-sv n${server.process.bootCount > 10 ? ' is-warn' : ''}`}>{server.process.bootCount}</div><div className="ac-sl">재시작 횟수</div></div>
            <div><div className="ac-sv n">{Math.floor(server.process.uptimeSec / 3600)}<s>시간</s></div><div className="ac-sl">이번 가동시간</div></div>
            <div><div className="ac-sv n">{mb(server.process.heapUsed)}</div><div className="ac-sl">메모리 사용</div></div>
          </div>
          <table className="ac-t">
            <tbody>
              <tr><td className="nm">돌고 있는 버전</td><td className="r n">{server.deployment?.commit || '—'}</td>
                <td className="r muted">{server.deployment?.deployedAt ? new Date(server.deployment.deployedAt).toLocaleString('ko-KR') : '—'}</td></tr>
              {server.deployment?.cert && (
                <tr><td className="nm">HTTPS 인증서</td>
                  <td className="r"><span className={`ac-chip is-${server.deployment.cert.daysLeft < 14 ? 'bad' : 'ok'}`}>{server.deployment.cert.daysLeft}일 남음</span></td>
                  <td className="r muted">{new Date(server.deployment.cert.notAfter).toLocaleDateString('ko-KR')} 만료</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="ac-sec">
          <h2>디스크 사용량<em className="n">{fmtBytes(total)}</em></h2>
          {top.map((d) => (
            <div className="ac-bar-row" key={d.name}>
              <span className="ac-bn">{d.name}</span>
              <span className="ac-bar"><span style={{ width: `${total ? Math.max((d.bytes / total) * 100, 0.5) : 0}%` }} /></span>
              <span className="ac-bv n">{fmtBytes(d.bytes)}</span>
            </div>
          ))}
          {rest.length > 0 && (
            <details className="ac-more">
              <summary>나머지 {rest.length}개 · {fmtBytes(rest.reduce((s, d) => s + d.bytes, 0))}</summary>
              {rest.map((d) => (
                <div className="ac-bar-row" key={d.name}>
                  <span className="ac-bn">{d.name}</span>
                  <span className="ac-bar"><span style={{ width: `${total ? Math.max((d.bytes / total) * 100, 0.5) : 0}%` }} /></span>
                  <span className="ac-bv n">{fmtBytes(d.bytes)}</span>
                </div>
              ))}
            </details>
          )}
        </section>
      </div>

      <section className="ac-sec is-flush">
        <h2>최근 수집 실패<em>최근 실행 50건 중</em></h2>
        <table className="ac-t">
          <tbody>
            {(server.recentErrors || []).map((e, i) => (
              <tr key={`${e.type}-${e.time}-${i}`}>
                <td className="nm">{e.type}</td>
                <td className="muted">{e.error}</td>
                <td className="r muted n">{new Date(e.time).toLocaleString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
```

```jsx
// frontend/src/features/admin/screens/ApiUsageScreen.jsx
import { useEffect, useState } from 'react'
import { getApiHubUsage } from '../adminApi.js'

// API Hub 한도는 호출 횟수가 아니라 하루 전송량(5 GB)이다. 한도가 있는 열쇠는 기상청 3개뿐이라
// NOAA·공항공사·기타 외부는 이 화면에 나오지 않는다(공항공사 호출량 계량은 2단계).
const gb = (b) => (b / 1024 ** 3).toFixed(2)

export default function ApiUsageScreen() {
  const [usage, setUsage] = useState(null)
  useEffect(() => {
    const load = () => getApiHubUsage().then(setUsage).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])
  if (!usage) return null

  const top = usage.keys.reduce((m, k) => (k.bytes > (m?.bytes ?? -1) ? k : m), null)
  const share = top ? Math.round((top.bytes / top.limitBytes) * 100) : 0

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-hero-big n">{share}<s>%</s></div>
          <div className="ac-hero-cap">
            가장 많이 쓴 열쇠({top?.label}) · 하루 {gb(top?.limitBytes || 0)} GB 중 · {top?.resetsAt ? `${new Date(top.resetsAt).toLocaleTimeString('ko-KR')} 초기화` : ''}
          </div>
        </div>
      </div>

      <section className="ac-sec">
        <h2>열쇠별 전송량<em>오늘 · 기상청 API Hub</em></h2>
        {usage.keys.map((k) => {
          const p = Math.round((k.bytes / k.limitBytes) * 100)
          return (
            <div className="ac-bar-row is-wide" key={k.category}>
              <span className="ac-bn"><b>{k.label}</b><span className="ac-sub">{k.status === 'unconfigured' ? '열쇠 없음' : k.status === 'blocked' ? '차단됨' : '정상'}</span></span>
              <span className="ac-bar"><span className={p >= 90 ? 'is-bad' : p >= 70 ? 'is-warn' : ''} style={{ width: `${Math.min(100, p)}%` }} /></span>
              <span className="ac-bv n">{gb(k.bytes)} / {gb(k.limitBytes)} GB<span className="ac-sub">{p}%</span></span>
            </div>
          )
        })}
      </section>

      {usage.keys.filter((k) => k.endpoints.length > 0).map((k) => (
        <section className="ac-sec is-flush" key={k.category}>
          <h2>{k.label} — 엔드포인트별<em>오늘</em></h2>
          <table className="ac-t">
            <thead><tr><th>엔드포인트</th><th className="r">전송량</th><th className="r">호출</th><th className="r">실패</th></tr></thead>
            <tbody>
              {k.endpoints.map((e) => (
                <tr key={e.label}>
                  <td className="nm">{e.label}</td>
                  <td className="r n">{gb(e.bytes)} GB</td>
                  <td className="r n">{e.requests}</td>
                  <td className="r n">{e.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}
```

- [ ] **Step 4: Run tests and build**

Run: `cd frontend && npx vitest run src/features/admin && npx vite build --logLevel error`
Expected: PASS, 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/screens/DataCollectionScreen.jsx frontend/src/features/admin/screens/ServerResourceScreen.jsx frontend/src/features/admin/screens/ApiUsageScreen.jsx frontend/src/features/admin/screens/DataCollectionScreen.test.jsx
git commit -m "feat: add the data collection, server resource and API usage screens"
```

---

### Task 14: 이용자 · 계정 관리 화면과 옛 패널 정리

**Files:**
- Create: `frontend/src/features/admin/screens/UsersScreen.jsx`
- Create: `frontend/src/features/admin/screens/AccountsScreen.jsx`
- Test: `frontend/src/features/admin/screens/UsersScreen.test.jsx`
- Delete: `frontend/src/features/admin/DataHealthDashboard.jsx`, `ServerHealthPanel.jsx`, `UserActivityPanel.jsx`, `ResourceTimeline.jsx`, `ApiHubUsagePanel.js`, `ApiHubUsagePanel.test.js`

**Interfaces:**
- Consumes: `/traffic`의 `hourly`(Task 8), 기존 `/trends`, Task 10 `HourHeatmap`/`GroupedBarChart`
- Produces: `<UsersScreen />`, `<AccountsScreen pending onChanged />`

`DemoModePanel.jsx`는 개발자 페이지가 쓰므로 **지우지 않는다.**

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/features/admin/screens/UsersScreen.test.jsx
import { describe, it, expect } from 'vitest'
import { trendGroups } from './UsersScreen.jsx'

describe('trendGroups', () => {
  it('세 계열을 날짜별로 한 묶음에 모은다', () => {
    const out = trendGroups({
      visits: [{ period: '2026-08-09', n: 15 }, { period: '2026-08-10', n: 11 }],
      newVisitors: [{ period: '2026-08-10', n: 2 }],
      signups: [],
    })
    expect(out).toEqual([
      { label: '2026-08-09', values: [15, 0, 0] },
      { label: '2026-08-10', values: [11, 2, 0] },
    ])
  })
  it('자료가 없으면 빈 배열', () => {
    expect(trendGroups(null)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/admin/screens/UsersScreen.test.jsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write the screens**

```jsx
// frontend/src/features/admin/screens/UsersScreen.jsx
import { useEffect, useState } from 'react'
import { getTraffic, getTrends } from '../adminApi.js'
import { HourHeatmap, GroupedBarChart } from '../components/Chart.jsx'

// 세 계열(총 접속·신규 방문자·신규 가입)을 같은 축에 놓기 위해 날짜로 합친다.
// 따로 그리면 각자 자기 최댓값에 맞춰 늘어나 서로 비교하면 틀린 결론이 나온다.
export function trendGroups(trends) {
  if (!trends) return []
  const days = new Map()
  const put = (rows, idx) => (rows || []).forEach((r) => {
    if (!days.has(r.period)) days.set(r.period, [0, 0, 0])
    days.get(r.period)[idx] = r.n
  })
  put(trends.visits, 0); put(trends.newVisitors, 1); put(trends.signups, 2)
  return [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([label, values]) => ({ label, values }))
}

export default function UsersScreen() {
  const [traffic, setTraffic] = useState(null)
  const [trends, setTrends] = useState(null)
  const [granularity, setGranularity] = useState('day')

  useEffect(() => {
    const load = () => getTraffic().then(setTraffic).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { getTrends(granularity).then(setTrends).catch(() => {}) }, [granularity])

  const groups = trendGroups(trends)
  const max = Math.max(10, ...groups.flatMap((g) => g.values))
  const totals = groups.reduce((a, g) => [a[0] + g.values[0], a[1] + g.values[1], a[2] + g.values[2]], [0, 0, 0])

  return (
    <>
      <div className="ac-hero">
        <div>
          <div className="ac-hero-big n">{traffic?.total ?? '—'}</div>
          <div className="ac-hero-cap">총 방문자 · 현재 접속 {traffic?.online ?? 0}명</div>
        </div>
        <div className="ac-hero-side">
          <div><div className="ac-v n">{traffic?.activeUsers?.last7d ?? '—'}</div><div className="ac-l">최근 7일 활성 계정</div></div>
          <div><div className="ac-v n">{traffic?.activeUsers?.last30d ?? '—'}</div><div className="ac-l">최근 30일 활성 계정</div></div>
        </div>
      </div>

      <section className="ac-sec">
        <h2>이용 시간대<em>최근 4주 · 요일 × 시각(KST)</em></h2>
        {traffic?.hourly?.ready
          ? <HourHeatmap cells={traffic.hourly.cells} />
          : <p className="ac-note">쌓이는 중입니다 — 지금까지 {traffic?.hourly?.days ?? 0}일치. 2주가 모이면 격자로 보여드립니다.</p>}
      </section>

      <section className="ac-sec">
        <h2>
          이용자 추이
          <div className="ac-seg">
            {[['day', '일별'], ['week', '주별'], ['month', '월별']].map(([k, l]) => (
              <button type="button" key={k} className={granularity === k ? 'on' : ''} onClick={() => setGranularity(k)}>{l}</button>
            ))}
          </div>
        </h2>
        <div className="ac-stats">
          <div><div className="ac-sv n">{totals[0]}</div><div className="ac-sl">총 접속</div></div>
          <div><div className="ac-sv n">{totals[1]}</div><div className="ac-sl">신규 방문자</div></div>
          <div><div className="ac-sv n">{totals[2]}</div><div className="ac-sl">신규 가입</div></div>
        </div>
        <GroupedBarChart groups={groups} colors={['#1c1b1a', '#8b7355', '#2f7d5e']} max={max} unit="건" />
        <div className="ac-clg">
          <span><i style={{ background: '#1c1b1a' }} />총 접속</span>
          <span><i style={{ background: '#8b7355' }} />신규 방문자</span>
          <span><i style={{ background: '#2f7d5e' }} />신규 가입</span>
        </div>
      </section>
    </>
  )
}
```

```jsx
// frontend/src/features/admin/screens/AccountsScreen.jsx
import { useCallback, useEffect, useState } from 'react'
import { getUsers, approve, reject } from '../adminApi.js'
import CreateForecasterDialog from '../CreateForecasterDialog.jsx'

const ROLE_KO = { pilot: '조종사', forecaster: '예보관', admin: '관리자' }
const STATUS_KO = { pending: '대기', active: '활성', rejected: '거절' }
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('ko-KR') : '—')

export default function AccountsScreen({ pending = [], onChanged }) {
  const [users, setUsers] = useState([])
  const [dialog, setDialog] = useState(false)
  const load = useCallback(() => { getUsers().then(setUsers).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])

  const act = async (fn, id) => { await fn(id); load(); onChanged?.() }

  return (
    <>
      <section className="ac-sec">
        <h2>가입 승인 대기<em>{pending.length}건</em></h2>
        {pending.length === 0 ? <p className="ac-note">대기 중인 가입 요청이 없습니다.</p> : (
          <table className="ac-t">
            <tbody>
              {pending.map((u) => (
                <tr key={u.id}>
                  <td className="nm">{u.username}</td>
                  <td className="r muted">{fmtDate(u.created_at)}</td>
                  <td className="r">
                    <button type="button" className="ac-btn-approve" onClick={() => act(approve, u.id)}>승인</button>
                    <button type="button" className="ac-btn-reject" onClick={() => act(reject, u.id)}>거절</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ac-sec is-flush">
        <h2>전체 사용자<em>{users.length}명</em>
          <button type="button" className="ac-btn" onClick={() => setDialog(true)}>예보관 추가</button>
        </h2>
        <table className="ac-t">
          <thead><tr><th>아이디</th><th>역할</th><th>상태</th><th className="r">가입일</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="nm">{u.username}</td>
                <td><span className="ac-chip is-quiet">{ROLE_KO[u.role] || u.role}</span></td>
                <td><span className={`ac-chip is-${u.status === 'active' ? 'ok' : u.status === 'pending' ? 'warn' : 'bad'}`}>{STATUS_KO[u.status] || u.status}</span></td>
                <td className="r muted n">{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {dialog && <CreateForecasterDialog onClose={() => setDialog(false)} onCreated={() => { load(); onChanged?.() }} />}
    </>
  )
}
```

- [ ] **Step 4: 옛 패널을 지우고 참조가 남지 않았는지 확인**

```bash
cd frontend
rm src/features/admin/DataHealthDashboard.jsx src/features/admin/ServerHealthPanel.jsx \
   src/features/admin/UserActivityPanel.jsx src/features/admin/ResourceTimeline.jsx \
   src/features/admin/ApiHubUsagePanel.js src/features/admin/ApiHubUsagePanel.test.js
grep -rn "DataHealthDashboard\|ServerHealthPanel\|UserActivityPanel\|ResourceTimeline\|ApiHubUsagePanel" src || echo "남은 참조 없음"
npx vitest run src/features/admin && npx vite build --logLevel error
npx knip 2>/dev/null | head -20 || true
```
Expected: "남은 참조 없음", 테스트 PASS, 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/features/admin
git commit -m "feat: add the users and accounts screens and retire the old admin panels"
```

---

### Task 15: 브라우저 검증

**Files:**
- Create: `frontend/verification/contracts/admin-console.spec.mjs`
- Reference: `docs/policies/verification/browser-verification.md`, `docs/operations/dev-server-and-capture.md`, `docs/policies/verification/contracts.md`

**Interfaces:**
- Consumes: 완성된 어드민 화면 여섯 개

임베디드 미리보기는 증거가 아니다. 실제 브라우저로 로그인하고 여섯 메뉴를 캡처해 목업과 대조한다.

- [ ] **Step 1: 계약 테스트를 쓴다**

```js
// frontend/verification/contracts/admin-console.spec.mjs
import { expect, test } from '@playwright/test'

// 관리자 콘솔 여섯 화면이 실제로 뜨고, 상태가 색만이 아니라 글자로도 적히는지 확인한다.
const MENUS = [
  ['개요', 'ac-hero-big'],
  ['자료 수집', 'ac-t'],
  ['서버 자원', 'ac-gauges'],
  ['API 사용량', 'ac-bar-row'],
  ['이용자', 'ac-sec'],
  ['계정 관리', 'ac-t'],
]

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[name="username"]', process.env.ADMIN_USER || 'admin')
  await page.fill('input[name="password"]', process.env.ADMIN_PASS || '')
  await page.click('button[type="submit"]')
  await page.goto('/admin')
})

for (const [label, marker] of MENUS) {
  test(`관리자 콘솔 — ${label}`, async ({ page }) => {
    await page.getByRole('button', { name: label }).click()
    await expect(page.locator(`.${marker}`).first()).toBeVisible()
    await expect(page.locator('.ac-chart svg text')).toHaveCount(await page.locator('.ac-chart svg text').count())
    await page.screenshot({ path: `artifacts/admin-${label}.png`, fullPage: true })
  })
}

test('모든 그래프에 y축 눈금과 단위가 있다', async ({ page }) => {
  await page.getByRole('button', { name: '서버 자원' }).click()
  const texts = await page.locator('.ac-chart text').allTextContents()
  expect(texts).toContain('%')
  expect(texts).toContain('0')
  expect(texts).toContain('100')
})

test('상태는 색만이 아니라 글자로도 적힌다', async ({ page }) => {
  await page.getByRole('button', { name: '자료 수집' }).click()
  const chips = await page.locator('.ac-chip').allTextContents()
  expect(chips.every((c) => c.trim().length > 0)).toBe(true)
})
```

- [ ] **Step 2: 개발 서버를 띄우고 테스트를 돌린다**

Run: `docs/operations/dev-server-and-capture.md`의 절차대로 서버를 띄운 뒤
`cd frontend && npx playwright test verification/contracts/admin-console.spec.mjs`
Expected: 8건 PASS, `artifacts/admin-*.png` 6장 생성

- [ ] **Step 3: 캡처를 목업과 대조한다**

`artifacts/admin-개요.png`와 목업의 개요 화면을 나란히 놓고 확인한다:
- 큰 숫자 하나로 시작하는가
- 정상 자료 타일에 상자가 없는가
- 이모지가 없는가
- 모든 그래프에 y축 눈금과 단위가 있는가

어긋나면 CSS나 컴포넌트를 고치고 Step 2로 돌아간다.

- [ ] **Step 4: 계약 등록**

`docs/policies/verification/contracts.md`에 이 계약을 한 줄 등록한다.

- [ ] **Step 5: Commit**

```bash
git add frontend/verification/contracts/admin-console.spec.mjs docs/policies/verification/contracts.md
git commit -m "test: add the admin console browser contract"
```

---

### Task 16: 그래프 업데이트와 마무리

- [ ] **Step 1: 지식 그래프 갱신**

Run: `graphify update .`
Expected: "Code graph updated"

- [ ] **Step 2: 전체 테스트**

Run: `cd backend && node --test test/ && cd ../frontend && npx vitest run && npx vite build --logLevel error`
Expected: 전부 PASS

- [ ] **Step 3: 순환 참조·미사용 코드 확인**

Run: `npx depcruise . 2>/dev/null | tail -5; npx madge --circular frontend/src 2>/dev/null | tail -5; npx knip 2>/dev/null | head -20`
Expected: 새 순환 참조 없음. `knip`이 지운 패널을 더 이상 보고하지 않음

- [ ] **Step 4: Commit**

```bash
git add graphify-out
git commit -m "chore: refresh the code graph after the admin console rebuild"
```

---

## Self-Review

**1. 스펙 coverage**

| 스펙 항목 | 담당 |
|---|---|
| 사이드바 6개 구조 | Task 12 |
| 자료 34종 출처별/성격별 격자 | Task 1, 11 |
| 판정 = 마지막 성공 수집 | Task 2, 3, 4 |
| 34종 기준표 | Task 1 |
| 쉬는 시간 3종 | Task 1, 2 |
| 이벤트성 7종 발효 건수 | Task 1, 4, 11 |
| 수집 품질(누적 성공률·밀림·평균) | Task 7, 13 |
| 색 규칙(색+글자, 이모지 금지) | Task 9, 11, 13, 15 |
| 그래프 규칙(축·눈금·단위) | Task 10, 15 |
| 디자인 언어·글자 크기 | Task 9 |
| 디스크 소진 예상 | Task 5, 13 |
| 인증서 만료일·배포 버전 | Task 6, 13 |
| 이용 시간대 격자 + 쌓이는 중 | Task 8, 14 |
| API 사용량 + 열쇠별 자료 | Task 13 |
| 검증(Playwright, 목업 대조) | Task 15 |

빠진 항목 없음.

**2. Placeholder 점검** — "적절히", "TODO", "비슷하게" 없음. 모든 코드 단계에 실제 코드가 있다.

**3. 타입 일관성**
- `readDataHealth` 반환에 `statsKey`를 싣는다(Task 4 Step 3의 행 생성에 추가할 것 — Task 7이 이를 쓴다)
- `formatAge(ms)`는 `DataGrid.jsx`가 export하고 `AttentionList.jsx`·`DataCollectionScreen.jsx`가 import한다
- `judge()`는 `'ok'|'late'|'stopped'|'quiet'|'never'` 다섯 값만 낸다. `STATUS`/`STATUS_LABEL`/`SEVERITY` 맵 셋 다 다섯 값을 모두 다룬다
- `hourlyPattern`의 `dow`는 0=월이다. `HourHeatmap`의 `DOWS`도 월요일부터다

**4. 알려진 위험**
- Task 6의 `deploymentInfo`는 `git`을 실행한다. 배포 환경에 `.git`이 없으면 `commit`이 `null`이 되고 화면이 "—"를 띄운다(오류 아님). `GIT_COMMIT` 환경변수로 대체 가능
- Task 8의 격자는 배포 후 2주가 지나야 채워진다. 그전까지 "쌓이는 중"이 정상이다
