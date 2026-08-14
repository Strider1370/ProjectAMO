# 국내 기상 래스터 전환·레이더 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 국내 레이더·위성 시간 프레임을 끊김 없이 전환하고, HSR 기반 레이더 UX·가로 범례·자료 가능 타임라인 표시로 정리한다.

**Architecture:** `weather-overlays/lib`에 프레임 존재 여부와 이미지 이중 버퍼 전환을 둔다. Mapbox 이미지 소스는 새 프레임이 로드된 뒤에만 200ms 크로스페이드하고, stale 완료·실패는 현재 정상 프레임을 바꾸지 않는다. `MapView`는 파생 모델을 조합하며, 타임라인은 기존 눈금 띠 안에 자료 있음 표시만 그린다.

**Tech Stack:** React, Mapbox GL JS, Node built-in test runner, Playwright, Express/node-cron.

## Global Constraints

- RainViewer 해외 레이더는 전환 로직에서 제외한다.
- 원시 BIN `radar_echo` 수집만 중단하며 기존 파일을 삭제하지 않는다.
- HSR/HCI 범례는 KMA 세로 원본의 확인된 색·구간을 가로 UI로만 렌더한다.
- 자료 있음 표시는 타임라인 기존 눈금 띠 안에서만 렌더하고 높이·상하 패딩·별도 행을 추가하지 않는다.
- 새 지도 리소스와 상태는 `weather-overlays`가 소유하고, `MapView`에는 새 bare effect를 만들지 않는다.
- 스타일/베이스맵 재적용 뒤 현재 토글·프레임·경계색을 복구한다.
- KMA/KIM 키는 브라우저·메타·fixture·로그에 노출하지 않는다.

---

## File Structure

- Modify: `frontend/src/features/map/imageOverlay.js` — stateless image-coordinate/resource helpers만 유지.
- Create: `frontend/src/features/weather-overlays/lib/rasterFrameTransition.js` — preload, 두 이미지 버퍼, 취소 토큰, 크로스페이드와 정리.
- Create: `frontend/src/features/weather-overlays/lib/rasterFrameTransition.test.js` — 전환 성공/취소/Mapbox 실패/스타일 교체 단위 테스트.
- Create: `frontend/src/features/weather-overlays/lib/rasterLegendModel.js` — HSR/HCI 가로 범례 상수와 표시 조건 순수 모델.
- Create: `frontend/src/features/weather-overlays/lib/rasterLegendModel.test.js` — KMA 확인값과 범례 표시 조건 테스트.
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` — HSR을 레이더 기준 프레임으로 삼고 WISSDOM·범례·자료 가능 프레임을 파생.
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js` — 레이더/WISSDOM 연동과 자료 가능 시각 합집합 테스트.
- Modify: `frontend/src/features/weather-overlays/lib/kmaCompositeLayers.js` — HSR/HCI/가시영상에 공통 전환 어댑터 사용.
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` — 적외/WISSDOM/QPF의 공통 전환 사용과 이미지 실패 보존.
- Modify: `frontend/src/features/weather-overlays/lib/lightningLayers.js` — 최신 선택 generation만 커밋하는 낙뢰 GeoJSON 준비/교체.
- Modify: `frontend/src/features/weather-overlays/lib/lightningLayers.test.js` — 늦은 낙뢰 결과와 빈 다음 결과가 현재 프레임을 지우지 않는지 검증.
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx` — HSR·HCI·WISSDOM 가로 범례 렌더.
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.test.js` — 원본 세로 `<img>` 미사용과 가로 범례 조건 테스트.
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` — BIN radar 숨김, HSR 이름 변경, WISSDOM 별도 제어 제거.
- Modify: `frontend/src/features/weather-overlays/lib/useRadarWindOverlay.js`, `metLayerVisibility.js` 및 테스트 — HSR 자동 WISSDOM·HSR/해외레이더 상호배타로 legacy radar 의미 이전.
- Modify: `frontend/src/features/monitoring/MonitoringMap.jsx` — legacy radar 기본 활성화 제거.
- Modify: `frontend/src/features/map/lib/baseMapLayers.js` — HSR/HCI 포함 경계 가시성 및 위성 우선 노랑 색상 정책.
- Modify: `frontend/src/features/map/MapView.jsx` — 기존 모델 조합 지점에서 새 경계/범례 입력을 전달.
- Modify: `frontend/src/features/weather-overlays/lib/timelineRailModel.js` — 활성 레이어 프레임 합집합과 `hasDataAtTick` 순수 함수.
- Modify: `frontend/src/features/weather-overlays/TimelineRail.jsx` — 기존 눈금 내부 자료 있음 표시.
- Modify: `frontend/src/features/map/MapView.css` — 높이를 바꾸지 않는 TimelineRail 자료 있음 표시 스타일.
- Modify: `backend/src/index.js` — `radar_echo` 시작/cron 등록 중단.
- Modify: 관련 `layerActions`/테스트 및 Playwright 계약 — 숨긴 레이어가 검색/공유 진입점에서 노출되지 않는지, 전환/스타일 복구를 검증.

### Task 1: 프레임/범례 파생 모델을 TDD로 고정

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/rasterLegendModel.js`
- Create: `frontend/src/features/weather-overlays/lib/rasterLegendModel.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`

**Interfaces:**
- Reuses the existing verified `RADAR_RAINRATE_LEGEND` from `weatherOverlayLayers.js`; it contains KMA HSR thresholds `0.0 … 90, 110, 150` and their exact colors.
- Produces `HCI_LEGEND` and `buildRasterLegendModel({ visibility, hsrFrame, hciFrame, wissdomFrame })` returning `{ hsrVisible, hciVisible, wissdomVisible }`.
- Produces source-aware availability entries `{ ms, cadenceMs }`, not a flattened list, so mixed radar/위성/NWP cadences remain correct.
- `buildWeatherOverlayModel` exposes `radarFrame` from HSR when `visibility.radarHsr` is true and derives WISSDOM from that exact HSR timestamp.

- [ ] **Step 1: Write failing legend and frame-union tests**

```js
test('HSR reuses every verified KMA rain-rate legend band', () => {
  assert.deepEqual(RADAR_RAINRATE_LEGEND.map(({ label }) => label), ['0.0', '0.1', '0.5', '1.0', '2', '3', '4', '5', '6', '7', '8', '9', '10', '15', '20', '25', '30', '40', '50', '60', '70', '80', '90', '110', '150'])
  assert.deepEqual(HCI_LEGEND.map(({ label }) => label), ['우박', '비', '눈', '빙정', '비강수없음'])
})

test('active-frame union includes enabled observations and future QPF only once', () => {
  assert.deepEqual(collectActiveFrameTimes({
    visibility: { radarHsr: true, radarHci: false, satellite: true, qpf: true },
    hsrFrames: [{ timeMs: 1000 }], hciFrames: [{ timeMs: 2000 }],
    satelliteFrames: [{ timeMs: 1000 }, { timeMs: 3000 }], satelliteVisibleFrames: [],
    lightningFrames: [], wissdomFrames: [], qpfFrames: [{ validTimeMs: 5000 }], nwpTimes: [],
  }), [1000, 3000, 5000])
})
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `cd frontend && node --test src/features/weather-overlays/lib/rasterLegendModel.test.js src/features/weather-overlays/lib/weatherOverlayModel.test.js`

Expected: FAIL because the module and exported union function do not exist.

- [ ] **Step 3: Implement only verified KMA legend constants and pure derivation**

```js
export const HCI_LABELS = Object.freeze(['우박', '비', '눈', '빙정', '비강수없음'])

export function collectActiveFrameTimes({ visibility = {}, hsrFrames = [], qpfFrames = [] }) {
  const values = []
  if (visibility.radarHsr) values.push(...hsrFrames.map((frame) => frame.timeMs))
  if (visibility.qpf) values.push(...qpfFrames.map((frame) => frame.validTimeMs))
  return [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b)
}
```

Import the existing verified HSR constant instead of retranscribing its colors. Transcribe only HCI’s five colors/labels from the saved KMA artifact and assert the full array; add no source image URL to exported data.

- [ ] **Step 4: Update weather model semantics**

Make `radarHsr` the selected domestic radar frame for WISSDOM matching, radar reference time, and horizontal legend visibility. Preserve HCI as independent. Preserve current QPF future replacement behavior without re-enabling BIN radar.

- [ ] **Step 5: Run focused tests and commit**

Run: `cd frontend && node --test src/features/weather-overlays/lib/rasterLegendModel.test.js src/features/weather-overlays/lib/weatherOverlayModel.test.js`

Expected: PASS.

```bash
git add frontend/src/features/weather-overlays/lib/rasterLegendModel.js frontend/src/features/weather-overlays/lib/rasterLegendModel.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js
git commit -m "feat: derive HSR radar timeline state"
```

### Task 2: Mapbox 이미지 이중 버퍼 전환을 TDD로 구현

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/rasterFrameTransition.js`
- Create: `frontend/src/features/weather-overlays/lib/rasterFrameTransition.test.js`

**Interfaces:**
- Produces `createRasterFrameTransition(map, options)` returning `{ sync(frame, visible), cancel(), dispose() }`.
- `sync` returns immediately with current visibility; only its internal latest generation may commit a preloaded frame.
- The owning style-synced effect returns `dispose` as cleanup. Map style change, visibility false, or next sync invalidates pending preload immediately.

- [ ] **Step 1: Add failing controller tests**

```js
test('keeps old image visible until the incoming frame and Mapbox source load', async () => {
  const map = createMap({ preload: deferredPreload })
  await syncImageOverlay(map, oldOptions)
  const pending = syncImageOverlay(map, { ...oldOptions, frame: newFrame })
  assert.equal(map.getLayer('radar-layer').paint['raster-opacity'], 0.88)
  deferredPreload.resolve()
  await pending
  map.emitSourceData('radar-layer--incoming')
  assert.equal(map.getLayer('radar-layer--incoming').paint['raster-opacity'], 0.88)
})

test('a stale preload cannot replace a newer selection', async () => {
  const first = deferred(), second = deferred()
  const map = createMap({ preload: ({ url }) => url.endsWith('a.png') ? first.promise : second.promise })
  const a = syncImageOverlay(map, { ...options, frame: frameA })
  const b = syncImageOverlay(map, { ...options, frame: frameB })
  second.resolve(); await b; first.resolve(); await a
  assert.match(map.getLayer('radar-layer').source, /b/)
})
```

- [ ] **Step 2: Run focused test and confirm failure**

Run: `cd frontend && node --test src/features/map/imageOverlay.test.js`

Expected: FAIL because `syncImageOverlay` and preload behavior are absent.

- [ ] **Step 3: Implement the smallest two-buffer controller**

Use a `WeakMap<Map, Map<sourceId, state>>` containing generation number, active source/layer IDs, incoming IDs, abort controller, source-error cleanup, and cleanup timer. Preload with `Image`; after `onload`, install incoming source/layer at opacity 0, wait for its Mapbox source load, then animate both raster opacity values over 200ms. On abort, image error, source error, or style cleanup, remove only incoming resources and leave active state untouched.

- [ ] **Step 4: Cover style restoration and same-frame idempotence**

Add tests that unchanged frames add no source, a style change during preload cannot commit, a Mapbox source error retains the old frame, style recreation installs only the active image, and cleanup retains sibling layer order.

- [ ] **Step 5: Run tests and commit**

Run: `cd frontend && node --test src/features/map/imageOverlay.test.js`

Expected: PASS.

```bash
git add frontend/src/features/weather-overlays/lib/rasterFrameTransition.js frontend/src/features/weather-overlays/lib/rasterFrameTransition.test.js
git commit -m "feat: crossfade weather image frames"
```

### Task 3: 국내 래스터 어댑터와 가로 범례를 연결

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/kmaCompositeLayers.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.test.js`
- Modify: `frontend/src/features/map/MapView.jsx`

**Interfaces:**
- Consumes `syncImageOverlay`, weather-model `radarFrame`/`hciFrame`/`wissdomFrame`, and `buildRasterLegendModel`.
- `WeatherLegends` receives `{ hsrLegendVisible, hciLegendVisible, wissdomLegendVisible, hsrLegend, hciLegend }`.

- [ ] **Step 1: Write failing adapter and component tests**

```js
test('HSR, HCI, visible satellite, WISSDOM and QPF pass 200ms transition options', () => {
  assert.match(compositeSource, /transitionMs:\s*200/)
  assert.match(weatherOverlaySource, /transitionMs:\s*200/)
})

test('horizontal HSR and HCI legends never render KMA legend image URLs', () => {
  assert.match(legendSource, /HSR_LEGEND/)
  assert.match(legendSource, /HCI_LEGEND/)
  assert.doesNotMatch(legendSource, /hsrLegendPath|hciLegendPath/)
})
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `cd frontend && node --test src/features/weather-overlays/WeatherLegends.test.js src/features/weather-overlays/lib/weatherOverlayLayers.test.js`

Expected: FAIL because transition options and horizontal legend props are absent.

- [ ] **Step 3: Route every included domestic image layer through the controller**

Replace direct immediate image replacement in composite and weather adapters with `syncImageOverlay`. Pass HSR, HCI, WISSDOM, QPF, IR, and visible satellite; do not call it from `rainviewerLayers.js`.

- [ ] **Step 4: Render compact horizontal legend blocks**

Reuse `HLegend` or introduce a small local horizontal chip component in `WeatherLegends.jsx`. Render HSR `mm/h`, HCI classification chips, and WISSDOM `m/s` only under their model-provided visibility flags. Keep the mobile legend path functionally equivalent.

- [ ] **Step 5: Compose the new props without new MapView ownership**

Pass derived legend state from the existing `weatherOverlayModel` composition to `WeatherLegends`; keep source/layer writes inside weather-overlays adapters.

- [ ] **Step 6: Run tests and commit**

Run: `cd frontend && node --test src/features/weather-overlays/WeatherLegends.test.js src/features/weather-overlays/lib/weatherOverlayLayers.test.js src/features/weather-overlays/lib/weatherOverlayModel.test.js`

Expected: PASS.

```bash
git add frontend/src/features/weather-overlays/lib/kmaCompositeLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/WeatherLegends.jsx frontend/src/features/weather-overlays/WeatherLegends.test.js frontend/src/features/map/MapView.jsx
git commit -m "feat: animate domestic raster overlays"
```

### Task 4: 레이더 UX·경계 정책·BIN 수집 중단

**Files:**
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/weather-overlays/lib/useRadarWindOverlay.js`
- Modify: `frontend/src/features/weather-overlays/lib/metLayerVisibility.js`
- Modify: their existing tests
- Modify: `frontend/src/features/monitoring/MonitoringMap.jsx`
- Modify: `frontend/src/features/map/layerActions.js`
- Modify: `frontend/src/features/map/layerActions.test.js`
- Modify: `frontend/src/features/map/lib/baseMapLayers.js`
- Modify: relevant base-map tests
- Modify: `backend/src/index.js`
- Modify: `backend/test/kim-scheduler.test.js` or the existing scheduler test owning `radar_echo` assertions

**Interfaces:**
- `shouldShowGeoBoundaries({ basemapId, metVisibility, enableWindOverlay })` recognizes HSR/HCI.
- New `geoBoundaryPresentation(...)` returns `{ visible, color }`, where `satellite || satelliteVisible` selects yellow and otherwise uses the standard boundary color.

- [ ] **Step 1: Write failing policy tests**

```js
test('HSR or HCI shows common boundaries and any satellite selects yellow', () => {
  assert.equal(geoBoundaryPresentation({ metVisibility: { radarHsr: true } }).visible, true)
  assert.equal(geoBoundaryPresentation({ metVisibility: { satelliteVisible: true } }).color, '#facc15')
})

test('MET panel exposes HSR as 레이더 and hides raw radar', () => {
  assert.match(panelSource, /radarHsr: '레이더'/)
  assert.doesNotMatch(observationIds, /'radar'/)
})

test('scheduler does not register radar_echo but keeps HSR/HCI graphics jobs', () => {
  assert.doesNotMatch(indexSource, /radar_echo.*cron\.schedule/)
  assert.match(indexSource, /runWithLock\('hsr'/)
  assert.match(indexSource, /runWithLock\('hci'/)
})
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `cd frontend && node --test src/features/map/layerActions.test.js` and `cd backend && node --test test/kim-scheduler.test.js`

Expected: FAIL because raw radar remains exposed/scheduled and the boundary color policy is static.

- [ ] **Step 3: Implement policy changes**

Remove `radar` from panel group IDs and shared actions, rename `radarHsr`, and remove its independent WISSDOM on/off action while retaining height selection. Make `useRadarWindOverlay` derive effective visibility from `radarHsr`; migrate MapView defaults and monitoring defaults away from legacy `radar`; make `radarHsr` and `radarOverseas` mutually exclusive in `metLayerVisibility`. Stop only `radar_echo` startup/cron registration; retain HSR/HCI/WISSDOM/QPF collectors. Change base boundary paint using the policy result during the existing style-synced effect.

- [ ] **Step 4: Run focused tests and commit**

Run: `cd frontend && node --test src/features/map/layerActions.test.js src/features/map/lib/baseMapLayers.test.js` and `cd backend && node --test test/kim-scheduler.test.js`

Expected: PASS.

```bash
git add frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/features/map/layerActions.js frontend/src/features/map/layerActions.test.js frontend/src/features/map/lib/baseMapLayers.js frontend/src/features/map/lib/baseMapLayers.test.js backend/src/index.js backend/test/kim-scheduler.test.js
git commit -m "feat: promote KMA image radar"
```

### Task 5: 낙뢰 최신 선택 가드

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/lightningLayers.js`
- Modify: `frontend/src/features/weather-overlays/lib/lightningLayers.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`

**Interfaces:**
- Produces `createLightningFrameSync(map)` returning `{ sync({ geojson, visible, frameKey }), cancel() }`.
- A frameKey generation may call `setData` only if it is still the latest visible generation and GeoJSON is valid.

- [ ] **Step 1: Write failing stale-result tests**

```js
test('an older delayed lightning frame cannot overwrite a newer frame', async () => {
  const sync = createLightningFrameSync(map)
  const old = sync.sync({ geojson: oldGeojson, visible: true, frameKey: 'old' })
  await sync.sync({ geojson: newGeojson, visible: true, frameKey: 'new' })
  await old
  assert.deepEqual(map.getSource(LIGHTNING_SOURCE).data, newGeojson)
})
```

- [ ] **Step 2: Run focused test and confirm failure**

Run: `cd frontend && node --test src/features/weather-overlays/lib/lightningLayers.test.js`

Expected: FAIL because no generation-aware sync exists.

- [ ] **Step 3: Implement the latest-generation guard and availability input**

Prepare/validate the next feature collection before replacing the source. Ignore stale or invalid/empty replacement results while retaining the last valid visible data. Include the selected valid lightning frame in source-aware availability entries.

- [ ] **Step 4: Run test and commit**

Run: `cd frontend && node --test src/features/weather-overlays/lib/lightningLayers.test.js`

Expected: PASS.

```bash
git add frontend/src/features/weather-overlays/lib/lightningLayers.js frontend/src/features/weather-overlays/lib/lightningLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js
git commit -m "fix: guard stale lightning timeline frames"
```

### Task 6: 기존 타임라인 눈금 내부 자료 있음 표시

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/timelineRailModel.js`
- Modify: `frontend/src/features/weather-overlays/lib/timelineRailModel.test.js`
- Modify: `frontend/src/features/weather-overlays/TimelineRail.jsx`
- Modify: `frontend/src/features/map/MapView.css`
- Modify: `frontend/src/features/map/MapView.jsx`

**Interfaces:**
- `hasDataAtTick(entries, tickMs)` returns a boolean using each `{ ms, cadenceMs }` entry’s own tolerance.
- `TimelineRail` accepts `availableFrameEntries = []` and decorates only existing tick markup with `timeline-rail__tick--has-data`.

- [ ] **Step 1: Write failing pure-model tests**

```js
test('marks a ruler tick with mixed source cadences', () => {
  assert.equal(hasDataAtTick([{ ms: Date.UTC(2026, 7, 15, 0, 5), cadenceMs: 5 * 60_000 }], Date.UTC(2026, 7, 15, 0, 0)), true)
  assert.equal(hasDataAtTick([], Date.UTC(2026, 7, 15, 0, 0)), false)
})
```

- [ ] **Step 2: Run focused test and confirm failure**

Run: `cd frontend && node --test src/features/weather-overlays/lib/timelineRailModel.test.js`

Expected: FAIL because `hasDataAtTick` is not exported.

- [ ] **Step 3: Implement model and existing-markup decoration**

Merge model observation/QPF entries with enabled NWP `sliderTimes` in MapView before the existing TimelineRail call; exclude disabled NWP layers. Add only a modifier class to the existing `timeline-rail__tick`; do not add siblings, new rows, labels, or padding.

- [ ] **Step 4: Add layout-preservation test and CSS**

Use a visual/unit source test to assert that the new class is on `.timeline-rail__tick` and no `timeline-rail__availability` child/row exists. Style the modifier as a short, monochrome vertical inset drawn inside the tick-mark box; do not alter rail height, tick label position, or bottom/ top offsets.

- [ ] **Step 5: Run focused tests and commit**

Run: `cd frontend && node --test src/features/weather-overlays/lib/timelineRailModel.test.js`

Expected: PASS.

```bash
git add frontend/src/features/weather-overlays/lib/timelineRailModel.js frontend/src/features/weather-overlays/lib/timelineRailModel.test.js frontend/src/features/weather-overlays/TimelineRail.jsx frontend/src/features/map/MapView.css frontend/src/features/map/MapView.jsx
git commit -m "feat: mark available weather timeline frames"
```

### Task 7: 계약 검증과 회귀 확인

**Files:**
- Modify: `frontend/verification/contracts/radar-wissdom-qpf.spec.mjs`
- Create or modify: nearest registered Playwright contract for satellite/timeline state.

- [ ] **Step 1: Write failing browser assertions**

```js
await page.getByRole('button', { name: '레이더' }).click()
await expect(page.locator('.timeline-rail__tick--has-data')).toHaveCountGreaterThan(0)
await expect(page.getByText('WISSDOM · m/s')).toBeVisible()
await page.getByRole('button', { name: '강수 형태' }).click()
await expect(page.getByText('강수 형태')).toBeVisible()
```

Add a rapid pointer drag across three timeline positions, wait for the final selected frame, switch basemap twice, and assert one active HSR source/layer family remains with no blank state. Capture the rail before/after and assert its bounding-box height is unchanged.

- [ ] **Step 2: Run targeted Playwright contract and confirm failure**

Run: `npm run dev:contract -- --grep "radar-wissdom-qpf"`

Expected: FAIL before implementation because labels, automatic WISSDOM, and in-rail availability marker are absent.

- [ ] **Step 3: Make only deterministic test fixture changes needed by the new contract**

Keep KMA keys absent from fixtures. Use local frame paths and snapshot metadata only.

- [ ] **Step 4: Run all required verification**

Run:

```bash
npm test
npm run build
 npm run dev:contract -- --grep "radar-wissdom-qpf"
cd .. && graphify update .
```

Expected: every command exits 0; Playwright evidence shows no blank transition and no timeline height change.

- [ ] **Step 5: Commit final test/contract changes**

```bash
git add frontend/verification/contracts
git commit -m "test: cover raster timeline transitions"
```

## Plan Self-Review

- Spec coverage: Tasks 1–3 cover all domestic transition targets and horizontal legends; Task 4 covers HSR promotion, WISSDOM linkage, boundaries, and BIN collection stop; Task 5 covers the in-rail availability mark; Task 6 covers browser/style/fast-drag verification.
- Placeholder scan: no deferred implementation markers or unnamed interfaces remain; KMA legend colors are explicitly constrained to the already saved official artifact and must be transcribed before code.
- Type consistency: `activeFrameTimesMs` is produced by the model, passed by `MapView`, consumed by `TimelineRail`; `syncImageOverlay` is produced by `imageOverlay.js` and consumed only by domestic raster adapters.
