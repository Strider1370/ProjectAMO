# KIM Surface Pressure Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KIM 해면기압(PRMSL) 일기도의 등압선·H/L 중심을 메인 Mapbox 지도에, 기존 NWP 3시간 타임라인과 동기화해 제공한다.

**Architecture:** 백엔드의 독립 KIM 그래픽 수집기가 `retModelImgUrl`의 동아시아 PRMSL PNG를 KIM NWP 키로 받아 검증·알파 정규화·LCC→Web Mercator 재표본화한 뒤, 완전한 7프레임 런만 원자적으로 발행한다. `weather-overlays`는 그 메타데이터에서 선택 시각의 프레임을 골라 Mapbox image source를 소유하며, `MapView`는 기존 모델·스타일 복원·공통 시각 표시 조합만 수행한다.

**Tech Stack:** Node.js ES modules, Express, Sharp, KMA API Hub `retModelImgUrl`, React 19, Mapbox GL JS, Node test runner, Playwright.

## Global Constraints

- KIM만 사용한다: `GDAPS_KIM / UNIS_SFC / PRMSL / lev=0`; UM `retComposite2ImgUrl`과 강수 음영은 범위 밖이다.
- 요청 영역은 `EASIA`; 발표 시각·유효 시각은 UTC epoch milliseconds로 저장하고 KST/UTC 표시는 기존 formatter만 사용한다.
- 한 런의 +0~+18시간 3시간 간격 7장이 모두 유효할 때만 최신 런으로 교체한다. 실패·빈 10×10 이미지·투영 검증 실패는 마지막 정상 런을 유지한다.
- KMA 키는 서버 환경변수 `KMA_AVIATION_AUTH_KEY`에서만 읽는다. 이 키에는 수치모델 그래픽 API 활용 권한이 활성화되어 있어야 하며, KIM 격자 수집 키(`KMA_KIM_NWP_AUTH_KEY`)는 사용하지 않는다. URL·메타데이터·클라이언트 번들·테스트 fixture에 절대 남기지 않는다.
- KMA가 응답에 픽셀 지오리퍼런스를 주지 않으므로, 요청 bbox의 네 모서리를 KMA 공개 LCC 정의로 변환한 사각형을 원본 transform으로 쓴다. 같은 요청의 KMA 해안선/경위도선과 Mapbox 기준선을 비교하는 회귀 검증을 통과해야 프레임을 발행한다.
- Mapbox source/layer와 동기화 코드는 `frontend/src/features/weather-overlays/lib/`에 둔다. `MapView.jsx`에는 새 bare effect나 레이어 ID를 추가하지 않는다.
- 신규 한국어 파일/문구 편집은 `apply_patch` 후 Node UTF-8 읽기로 확인한다.

---

## File Map

| File | Responsibility |
| --- | --- |
| `backend/src/lib/kma-model-graphics.js` | KIM PRMSL 요청, UTC compact time, LCC source transform/재투영 검증, 이미지 유효성 순수 계약 |
| `backend/src/processors/kim-surface-pressure-processor.js` | 7개 프레임 수집·정규화·원자적 런 발행·보존 |
| `backend/src/config.js` | KIM 그래픽 endpoint, bbox, lead times, timeout, schedule, 보존 설정 |
| `backend/src/index.js` | KIM 키 guarded scheduler와 startup collector 등록 |
| `backend/server.js` | 정적 cache header와 snapshot-meta KIM 압력 메타 source |
| `backend/src/dev/snapshot-store.js` | 활성 KIM 지상기압 런 디렉터리의 capture·readiness·restore ownership |
| `backend/test/kma-model-graphics.test.js` | 요청·시간·bbox LCC transform·PNG 거부·알파/정합 순수 테스트 |
| `backend/test/kim-surface-pressure-processor.test.js` | 완전 런 원자 교체·실패 보존·키 누출 없음 테스트 |
| `frontend/src/api/weatherApi.js`, `frontend/src/app/snapshotMeta.js` | 초기/증분 메타 fetch 계약 |
| `frontend/src/features/weather-overlays/lib/surfacePressureLayers.js` | Mapbox source/layer ID, frame pick, visibility/style sync |
| `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` | 미래 프레임 선택·NWP 타임라인 tick·발표/유효 label |
| `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` | 새 overlay ownership IDs 및 MET 정의 |
| `frontend/src/features/map/layerActions.js` | 검색·공유 레이어 등록 |
| `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` | MET 토글 문구 `지상기압` |
| `frontend/src/features/map/MapView.jsx` | prop/model/style-sync 조합과 공통 시각 entry만 연결 |
| `frontend/verification/contracts/surface-pressure.fixture.mjs` | key-free seven-frame meta, two WebP bytes, and Playwright route stubs owned by the surface-pressure browser contract |
| `frontend/verification/contracts/surface-pressure.spec.mjs` | 토글, 3시간 전환, 과거 숨김, 2회 basemap 복구 브라우저 계약 |
| `docs/policies/verification/contracts.md`, `Architecture.md` | 검증 계약과 새 파일 ownership 기록 |

### Task 1: Lock the KIM PRMSL source and georeferencing contract

**Files:**
- Create: `backend/src/lib/kma-model-graphics.js`
- Create: `backend/test/kma-model-graphics.test.js`
- Modify: `backend/src/config.js`

**Interfaces:**
- Produces `buildKimSurfacePressureRequest({ analysisTime, validTime }): URLSearchParams`.
- Produces `parseUtcCompactTime('YYYYMMDDHHmm'): number | null`.
- Produces `deriveLccViewport(bbox): [startX, startY, endX, endY]` and `reprojectKimGraphic(buffer, viewport): Promise<{ image, bounds }>`.

- [ ] **Step 1: Add key-free fixtures and failing request/transform tests.**

  Use a captured non-empty `retModelImgUrl` PRMSL PNG and same-request KMA coast/grid images as fixtures. Assert exact fixed parameters and seven valid times:

  ```js
  const query = buildKimSurfacePressureRequest({ analysisTime: '202305150000', validTime: '202305150600' })
  assert.equal(query.get('modl'), 'GDAPS_KIM')
  assert.equal(query.get('varGrp'), 'UNIS_SFC')
  assert.equal(query.get('var'), 'PRMSL')
  assert.equal(query.get('mapRange'), 'EASIA')
  assert.equal(parseUtcCompactTime('202305150600'), Date.UTC(2023, 4, 15, 6))
  ```

  Assert malformed time, HTML/error response, non-PNG bytes, and 10×10 response are rejected. Assert LCC viewport derives min/max coordinates from all four bbox corners, not merely NW/SE. Reproject the coast fixture and assert known coast/grid control points stay within the approved pixel tolerance against a checked-in expected transform fixture.

- [ ] **Step 2: Run the focused test red.**

  Run: `node --test backend/test/kma-model-graphics.test.js`
  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure source contract.**

  Add a product constant for `GDAPS_KIM/UNIS_SFC/PRMSL/0`, fixed EASIA bbox, `PROJ=LCC`, presentation settings, and an endpoint from `config.api.kim_graphics_url`. Use the existing WGS84 LCC utilities in `kma-graphics-projection.js`; extend their plausibility policy through an explicit EASIA option rather than weakening Korea radar validation. Decode with Sharp, turn declared black background transparent, reproject with nearest-neighbour sampling, and return only an output with non-empty alpha coverage.

- [ ] **Step 4: Run the focused test green.**

  Run: `node --test backend/test/kma-model-graphics.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add backend/src/lib/kma-model-graphics.js backend/src/lib/kma-graphics-projection.js backend/src/config.js backend/test/kma-model-graphics.test.js
  git commit -m "feat: define KIM surface-pressure graphic contract"
  ```

### Task 2: Collect and atomically publish complete KIM pressure runs

**Files:**
- Create: `backend/src/processors/kim-surface-pressure-processor.js`
- Create: `backend/test/kim-surface-pressure-processor.test.js`
- Modify: `backend/src/index.js`
- Modify: `backend/server.js`

**Interfaces:**
- Produces `kim_surface_pressure/latest.json` with `{ analysisTimeMs, frames: [{ analysisTimeMs, validTimeMs, path, bounds, source }] }`.
- Exports `processKimSurfacePressure({ now, deps, signal } = {}): Promise<{ saved: boolean, analysisTimeMs?: number }>`.

- [ ] **Step 1: Write failing transactional collector tests.**

  Inject fetch/clock/storage dependencies and assert a 00Z run asks for valid times 00,03,06,09,12,15,18Z; every frame carries that run's `analysisTimeMs`; it writes seven images before `latest.json`; and only then replaces the active run. Set `kim_surface_pressure.retry_count: 1`, fail a single +9h request twice, and assert byte-for-byte preservation of the old manifest/images; separately fail once then succeed and assert exactly two attempts. Abort an in-flight fetch and assert the `signal.reason` propagates with no staging/current mutation. Assert 10×10, HTML, bad projection, and all-transparent output never enter a manifest. Assert stored paths are key-free and retention removes only superseded completed-run files.

- [ ] **Step 2: Run red.**

  Run: `node --test backend/test/kim-surface-pressure-processor.test.js`
  Expected: FAIL because the collector does not exist.

- [ ] **Step 3: Implement the collector.**

  Select the latest eligible 00/06/12/18 UTC model cycle, build the seven calls, and request with `config.api.auth_key` only server-side (its environment source is `KMA_AVIATION_AUTH_KEY`). Before registration, make one key-free health call in the collector test to prove this credential is authorized for `retModelImgUrl`; if authorization fails, do not schedule the collector. Add `config.kim_surface_pressure.retry_count` with fixed default `1`; pass `signal` into every timeout/fetch; rethrow aborts; retry only transport/non-OK responses one additional time; and retain the last complete run for exhausted retries or validation failures. Stage normalized WebP frames under a unique temporary run directory; write the manifest last; rename the complete directory/current pointer atomically. Keep exactly the latest completed run and retain the previous one until the new pointer is switched. Register an aviation-key-gated startup call and schedule in `backend/src/index.js`; add a distinct lock/stat key. Add immutable cache headers for versioned frames and a `SNAPSHOT_SOURCES` entry keyed by `kimSurfacePressure`.

- [ ] **Step 3a: Add demo snapshot ownership and scheduler/server tests.**

  Extend `backend/src/dev/snapshot-store.js` so `kim_surface_pressure` is a full-directory capture type and readiness requires a valid `latest.json` whose seven referenced frame paths exist. Add `backend/test/kim-scheduler.test.js`, `backend/test/snapshot-meta-cache.test.js`, `backend/test/api-cache-policy.test.js`, and `backend/test/collector-cancellation.test.js` cases proving all four UTC cycles are scheduled with the aviation-key gate, active data-view restoration keeps the image directory with its manifest, changed mtime updates `kimSurfacePressure`, versioned WebP is immutable while `latest.json` is no-cache, and an abort leaves the active run unchanged.

- [ ] **Step 4: Run focused collector/scheduler tests.**

  Run: `node --test backend/test/kma-model-graphics.test.js backend/test/kim-surface-pressure-processor.test.js backend/test/kim-scheduler.test.js backend/test/snapshot-meta-cache.test.js backend/test/api-cache-policy.test.js backend/test/collector-cancellation.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add backend/src/processors/kim-surface-pressure-processor.js backend/src/index.js backend/server.js backend/src/dev/snapshot-store.js backend/test/kim-surface-pressure-processor.test.js backend/test/kim-scheduler.test.js backend/test/snapshot-meta-cache.test.js backend/test/api-cache-policy.test.js backend/test/collector-cancellation.test.js
  git commit -m "feat: collect KIM surface-pressure chart runs"
  ```

### Task 3: Extend the frontend polling and timeline model

**Files:**
- Modify: `frontend/src/api/weatherApi.js`
- Modify: `frontend/src/app/snapshotMeta.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/useTimelineRail.js`
- Modify: `frontend/src/features/weather-overlays/lib/useTimelineRail.test.js`

**Interfaces:**
- Consumes `weatherData.kimSurfacePressureMeta` with one complete active run.
- Produces `surfacePressureFrame`, `surfacePressureFrames`, and `surfacePressureIssueLabel`/`surfacePressureValidLabel`.

- [ ] **Step 1: Write failing selection and polling tests.**

  Add two same-valid-time frames with different per-frame analysis times and assert the newer analysis wins. Assert `selectedWeatherTimeMs` at a +3h tick selects that frame; selections between ticks choose the nearest 3-hour frame, with an exactly equidistant midpoint choosing the earlier frame; a time before the first forecast and every past timeline tick select `null`. Assert snapshot change fetches `/data/kim_surface_pressure/latest.json` and a failed changed fetch preserves old metadata. Assert the seven valid times participate in timeline playback ordering without creating a second rail. Assert issue/valid labels for one frame in both `KST` and `UTC`.

- [ ] **Step 2: Run red.**

  Run: `node --test frontend/src/app/snapshotMeta.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/useTimelineRail.test.js`
  Expected: FAIL because the pressure metadata/model key is absent.

- [ ] **Step 3: Implement metadata and derived state.**

  Add initial and changed-data fetches, snapshot hash comparison, validated complete-run normalization, future tick union, and nearest 3-hour valid-time selection (earlier on a tie). Deduplicate same valid time by descending per-frame `analysisTimeMs`. Format issue/valid labels with the existing epoch formatter and selected `tz`; do not parse source times in React. Return `null` rather than falling back to a future/past pressure frame outside the future NWP window.

- [ ] **Step 4: Run green and commit.**

  ```bash
  node --test frontend/src/app/snapshotMeta.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/useTimelineRail.test.js
  git add frontend/src/api/weatherApi.js frontend/src/app/snapshotMeta.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/weather-overlays/lib/useTimelineRail.js frontend/src/features/weather-overlays/lib/*.test.js
  git commit -m "feat: synchronize surface pressure with timeline"
  ```

### Task 4: Add the owned Mapbox layer, toggle, and timestamp disclosure

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/surfacePressureLayers.js`
- Create: `frontend/src/features/weather-overlays/lib/surfacePressureLayers.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/map/layerActions.js`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/app/App.jsx`

**Interfaces:**
- Owns `KIM_SURFACE_PRESSURE_SOURCE = 'kim-surface-pressure-overlay'` and `KIM_SURFACE_PRESSURE_LAYER = 'kim-surface-pressure-overlay'`.
- Exports `syncSurfacePressureLayer(map, { frame, visible }): void`.

- [ ] **Step 1: Write failing layer and registry tests.**

  Assert a visible frame calls `addOrUpdateImageOverlay` with the frame bounds and a documented opacity; `visible:false` hides the layer; style re-entry with the same frame is idempotent; and switching frames removes the obsolete source. Extend the layer-action registry test so a `surfacePressure` MET definition must have a search/toggle action. Add a MapView unit/contract assertion that the timestamp panel includes `{ key: 'surfacePressure', label: '지상기압' }` only when toggle and selected frame are both present.

- [ ] **Step 2: Run red.**

  Run: `node --test frontend/src/features/weather-overlays/lib/surfacePressureLayers.test.js frontend/src/features/map/layerActions.test.js`
  Expected: FAIL because the layer and registry entry are absent.

- [ ] **Step 3: Implement feature-owned map wiring.**

  Add the `surfacePressure` MET definition and panel control. Pass `kimSurfacePressureMeta` from `App` to `MapView`; compose it in `buildWeatherOverlayModel`; invoke `syncSurfacePressureLayer` through `useStyleSyncedEffect`. Add its source/layer IDs to weather-overlay ownership arrays and `layerActions`. Add a timestamp entry exactly when the layer is visible, with `지상기압  발표 … · 유효 …`; no separate legend or time slider is created.

- [ ] **Step 4: Run green and commit.**

  ```bash
  node --test frontend/src/features/weather-overlays/lib/surfacePressureLayers.test.js frontend/src/features/map/layerActions.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js
  git add frontend/src/features/weather-overlays/lib/surfacePressureLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/map/layerActions.js frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/features/map/MapView.jsx frontend/src/app/App.jsx
  git commit -m "feat: show KIM surface pressure chart on map"
  ```

### Task 5: Verify the complete browser contract and document ownership

**Files:**
- Create: `frontend/verification/contracts/surface-pressure.fixture.mjs`
- Create: `frontend/verification/contracts/surface-pressure.spec.mjs`
- Modify: `docs/policies/verification/contracts.md`
- Modify: `Architecture.md`

- [ ] **Step 1: Add a deterministic fixture.**

  In `surface-pressure.fixture.mjs`, export `surfacePressureMeta`, `surfacePressureImage`, and `installSurfacePressureRoutes(page)`. The installer must intercept `/data/kim_surface_pressure/latest.json` and the two referenced WebP paths with `content-type: application/json`/`image/webp`, no key-bearing query strings, and a seven-frame manifest. Include one past, one exact future tick, and one midpoint selection time so browser assertions can distinguish hidden, exact, and nearest-frame rendering.

- [ ] **Step 2: Write the browser contract.**

  At the registered desktop and iPad-landscape viewports: open MET, enable `지상기압`, assert the image layer and `기상자료 시각` entry appear; scrub +3h and assert the image source changes; scrub the midpoint and assert the earlier source is selected; scrub a past observation tick and assert it hides; switch basemap twice and assert the selected image/toggle restore. Check browser console for image/CORS errors and capture screenshots in an ignored timestamped `artifacts/` folder.

- [ ] **Step 3: Run complete verification.**

  ```bash
  npm test
  npm run build
  npm run dev:contract -- surface-pressure
  graphify update .
  ```

  Expected: all commands exit 0; browser output includes the two basemap-restoration screenshots and no API key in requests, DOM, or fixture body.

- [ ] **Step 4: Commit.**

  ```bash
  git add frontend/verification/contracts/surface-pressure.spec.mjs docs/policies/verification/contracts.md Architecture.md
  git commit -m "test: verify KIM surface pressure overlay"
  ```

## Self-review

- KIM-only data source, EASIA scope, 4 daily runs, seven 3-hour frames, complete-run retention, cancellation/retry failure preservation, demo snapshot ownership, transparency, projection calibration, nearest-frame timeline behavior, KST/UTC issue-valid disclosure, and style restoration each map to Tasks 1–5.
- The plan deliberately excludes UM, precipitation shading, and automated front/trough/ridge diagnosis.
- All later interface names (`kimSurfacePressureMeta`, `surfacePressureFrame`, `syncSurfacePressureLayer`) are introduced before consumption; no placeholder tasks remain.
