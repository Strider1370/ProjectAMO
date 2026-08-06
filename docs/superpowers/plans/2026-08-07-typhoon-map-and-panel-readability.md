# 태풍 지도·패널 판독성 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 복수 태풍을 식별 가능한 고대비 지도 심볼·영향반경으로 표시하고, 탭형 패널에서 선택 태풍의 현재·예보 정보를 정렬된 형태로 읽게 한다.

**Architecture:** 태풍 원천 데이터와 기하 계산은 바꾸지 않는다. `weather-overlays` 안에서 순수 표시 모델(popup, 패널 행)을 테스트하고, `typhoonLayers`가 Mapbox 소스·선/면·canvas 강도 심볼 레이어, 키보드 전용 DOM focus proxy, popup 수명주기를 함께 소유한다. `typhoonOverlaySync`는 기존 fetch·React 선택 상태만 유지한다. `TyphoonPanel`은 선택된 태풍을 탭으로 정하고 패널 행을 기존 선택 계약으로 연결하며, `MapView`는 현재와 같이 합성만 한다.

**Tech Stack:** React 18, Mapbox GL JS, Vite, Node built-in test runner, Playwright contracts, CSS custom properties.

## Global Constraints

- `MapView.jsx`는 태풍 데이터 변환·레이어·이벤트를 소유하지 않고 조합만 한다.
- 태풍 고유색은 안정적 번호 배정을 유지하되 파랑·청록 계열을 사용하지 않는다.
- 실황은 실선, 예보는 점선이며 양쪽 모두 같은 선명도의 강도 심볼을 표시한다.
- 강풍·폭풍반경에는 모두 같은 태풍 고유색의 반투명 fill과 불투명 outline을 설치한다.
- 예보 오차영역은 바람 영향반경과 별개인 점선 outline/낮은 불투명도 fill로 유지한다.
- popup에는 번호·이름, 실황/예보, KST·UTC 유효시각, 위치, 진행방향·속도, 강도, 최대풍속, 중심기압을 표시한다. 심볼 hover/focus에서 열고, 포인터가 심볼 또는 popup에 있는 동안 유지하며 blur에서 닫는다.
- 패널의 예보 행은 `시각 · 강도 · 풍속 · 기압 · 위치`를 생략하지 않는다. 데스크톱은 공통 grid 열, 모바일은 위치를 다음 줄로 재배치한다.
- 한국어 UTF-8 파일은 `apply_patch`로만 편집하고 Node UTF-8 읽기로 검증한다.
- 브라우저 변경 전에는 desktop·iPad landscape·mobile의 현재 태풍 화면을 캡처하고 `artifacts/responsive-screenshots/typhoon-map-panel/<timestamp>/review/issues.md`에 현재 가시성/정렬 문제를 적는다. 변경 후 같은 상태를 다시 캡처한다.
- 검증은 최소화한다: 기존 `typhoonColors.test.js`, `typhoonListModel.test.js`, `typhoonLayers.test.js`에 필요한 사례만 추가하고, 기존 `typhoon` Playwright 계약 하나에 지도·popup·탭 변경 단언을 합친다. 별도 테스트 파일·별도 회귀 매트릭스는 만들지 않는다.
- 브라우저 변경은 수정된 `typhoon` Playwright 계약을 desktop, iPad landscape, mobile 전부에서 한 번 실행한다.

---

## File structure

| 파일 | 역할 |
| --- | --- |
| Create: `frontend/src/features/weather-overlays/lib/typhoonPointMarkers.css` | Mapbox 심볼을 가리지 않고 pointer event를 가로채지 않는 44px 키보드 focus proxy 스타일. |
| Modify: `frontend/src/features/weather-overlays/lib/typhoonColors.js` | cyan을 대비가 높은 비청색 색으로 교체. 번호 기반 안정 배정 알고리즘은 보존. |
| Modify: `frontend/src/features/weather-overlays/lib/typhoonColors.test.js` | 팔레트가 blue/cyan을 포함하지 않으며 기존 안정성·고유성 계약을 지키는지 검증. |
| Modify: `frontend/src/features/weather-overlays/lib/typhoonListModel.js` | 탭·현재 상태·예보 행과 popup 표시 줄을 만드는 순수 모델. |
| Modify: `frontend/src/features/weather-overlays/lib/typhoonListModel.test.js` | 현재 요약, 5개 예보 열, UTC/KST·결측 popup 값을 검증. |
| Modify: `frontend/src/features/weather-overlays/lib/typhoonLayers.js` | 모든 지점 GeoJSON 속성, 세 outline 레이어, DOM `Marker` 심볼·hover/focus popup 수명주기를 소유. |
| Modify: `frontend/src/features/weather-overlays/lib/typhoonLayers.test.js` | Mapbox symbol 속성, 세 outline ID, 모든 분석/예보 지점, 선택 시 반경 갱신용 속성을 검증. |
| Modify: `frontend/src/features/weather-overlays/lib/typhoonOverlaySync.js` | 기존 fetch·선택 상태와 `typhoonLayers` 동기화 호출만 소유. |
| Modify: `frontend/src/features/weather-overlays/TyphoonPanel.jsx` | 태풍 탭과 선택된 태풍의 현재·예보·지난 관측 표현. |
| Modify: `frontend/src/features/weather-overlays/TyphoonPanel.css` | 절제된 태풍색 표식, grid 정렬, 모바일 행 재배치. |
| Modify: `frontend/verification/contracts/typhoon.spec.mjs` | 지도 심볼·outline·popup과 탭형 패널의 사용자 계약을 검증. |

## Task 1: 사전 캡처와 표시 모델·대비 팔레트·DOM 심볼

**Files:**
- Create: `frontend/public/Symbols/typhoon-td.svg`
- Create: `frontend/public/Symbols/typhoon-1.svg`
- Create: `frontend/public/Symbols/typhoon-2.svg`
- Create: `frontend/public/Symbols/typhoon-3.svg`
- Create: `frontend/public/Symbols/typhoon-4.svg`
- Create: `frontend/public/Symbols/typhoon-5.svg`
- Create: `frontend/src/features/weather-overlays/lib/typhoonPointMarkers.css`
- Modify: `frontend/src/features/weather-overlays/lib/typhoonColors.js`
- Modify: `frontend/src/features/weather-overlays/lib/typhoonColors.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/typhoonListModel.js`
- Modify: `frontend/src/features/weather-overlays/lib/typhoonListModel.test.js`

**Interfaces:**
- Consumes: KMA-normalized row fields `validAt`, `forecast`, `lat`, `lon`, `dir`, `speedKmh`, `maxWindMs`, `pressureHpa`, `location`; existing `intensityOf()` and `formatTrackTime()` from `typhoonListModel.js`.
- Produces: `buildTyphoonPopupModel({ typhoon, row }): { title, status, validKst, validUtc, location, movement, intensity, wind, pressure, ariaLabel }`; `symbolIdForIntensity(intensity): 'typhoon-td' | …`; list item `currentRow` and `forecastRows` retaining both display fields and `validAt`/`row` selection fields.

- [ ] **Step 0: Capture the current panel in each required viewport and record the baseline issues.**

Create the ignored `artifacts/responsive-screenshots/typhoon-map-panel/<YYYY-MM-DD_HHMM>_baseline/capture.mjs`. It must import `chromium` from `frontend/node_modules/playwright`, route `/api/typhoon` to `frontend/verification/contracts/fixtures/typhoon-snapshot.json`, suppress the tour/release-note local-storage keys, open the weather panel and 태풍 tile, then save desktop (1440×900), iPad landscape (1180×820), and mobile (390×844) PNG screenshots in that same directory. Start the managed local server first, run the script, then stop the server. Create `review/issues.md` in the same directory with these observed issues: blue/cyan radius can merge with sea, no radius outline, permanent current-only text label, all typhoons expanded together, compressed row spacing, and unaligned location values.

```bash
npm run dev:serve
node artifacts/responsive-screenshots/typhoon-map-panel/<YYYY-MM-DD_HHMM>_baseline/capture.mjs
```

Expected: all three PNGs and `review/issues.md` exist; the capture records the pre-change visual state without changing source code. Stop the bounded development server after capture using its owning process from `ss -ltnp`.

- [ ] **Step 1: Add failing model and palette tests.**

```js
test('popup 모델은 실황 행의 KST·UTC와 운항 판단 필드를 모두 보낸다', () => {
  const model = buildTyphoonPopupModel({ typhoon: { number: 13, name: '돌핀' }, row: currentRow })
  assert.equal(model.status, '현재')
  assert.equal(model.validKst, '7일 15시 KST')
  assert.equal(model.validUtc, '7일 06:00 UTC')
  assert.equal(model.movement, '북서 18 km/h')
  assert.equal(model.pressure, '955 hPa')
  assert.match(model.ariaLabel, /13호.*7일 15시.*강도 3/)
})

test('태풍 팔레트에는 파랑 또는 청록 계열이 없다', () => {
  assert.deepEqual(TYPHOON_PALETTE, ['#dc2626', '#d97706', '#7c3aed', '#65a30d', '#be185d', '#a16207'])
})

test('예보 행은 시각·강도·풍속·기압·위치를 모두 보존한다', () => {
  const [item] = buildTyphoonListItems([typhoonWithForecast])
  assert.deepEqual(pick(item.forecastRows[0], ['timeLabel', 'intensity', 'windLabel', 'pressureLabel', 'location']), {
    timeLabel: '7일 09시', intensity: '3', windLabel: '40 m/s', pressureLabel: '955 hPa',
    location: '일본 오키나와 동북동쪽 약 120 km 부근 해상',
  })
  assert.equal(item.forecastRows[0].validAt, forecastRow.validAt)
  assert.equal(item.forecastRows[0].row, forecastRow)
})
```

- [ ] **Step 2: Run the focused tests and confirm failure.**

Run:

```bash
npm --prefix frontend test -- src/features/weather-overlays/lib/typhoonColors.test.js src/features/weather-overlays/lib/typhoonListModel.test.js
```

Expected: FAIL because `buildTyphoonPopupModel`, `symbolIdForIntensity`, and the new list-item fields do not exist.

- [ ] **Step 3: Implement the smallest display-only modules.**

```js
// typhoonListModel.js
export function symbolIdForIntensity(intensity) {
  const level = ['TD', '1', '2', '3', '4', '5'].includes(intensity) ? String(intensity).toLowerCase() : 'td'
  return `typhoon-${level}`
}

export function buildTyphoonPopupModel({ typhoon, row }) {
  return {
    title: typhoon.name ? `${typhoon.number}호 태풍 ${typhoon.name}` : `${typhoon.number}호 태풍`,
    status: row.forecast ? '예상' : '현재',
    validKst: formatPopupKst(row.validAt), validUtc: formatPopupUtc(row.validAt),
    location: row.location || '자료 없음',
    movement: row.dir && Number.isFinite(row.speedKmh) ? `${directionLabel(row.dir)} ${row.speedKmh} km/h` : '—',
    intensity: intensityOf(row.maxWindMs) ?? 'TD',
    wind: Number.isFinite(row.maxWindMs) ? `${row.maxWindMs} m/s` : '—',
    pressure: Number.isFinite(row.pressureHpa) ? `${row.pressureHpa} hPa` : '—',
    ariaLabel: `${typhoon.number}호${typhoon.name ? ` 태풍 ${typhoon.name}` : ''}, ${formatPopupKst(row.validAt)}, 강도 ${intensityOf(row.maxWindMs) ?? 'TD'}`,
  }
}
```

Define `formatPopupKst`, `formatPopupUtc`, and `directionLabel` in the same module, export them only if tests need direct coverage, and use `—` for every unavailable popup value. Do not create SVG assets. Task 2 will draw the flat cyclone path and black `TD`/`1`–`5` text into Mapbox-compatible canvas `ImageData`; use no gradients and a white outline where it must separate from a dark map. Create CSS for a 44×44px, transparent, `pointer-events:none` keyboard focus proxy so it never blocks map pan or visible-symbol pointer interaction. Change only the cyan palette entry to `#a16207`; preserve sorted-number collision resolution. Extend `buildTyphoonListItems()` with `currentRow` and `forecastRows`, reusing `buildTrackRows()` and retaining `validAt` plus `row`.

- [ ] **Step 4: Run the focused tests and color linter.**

Run:

```bash
npm --prefix frontend test -- src/features/weather-overlays/lib/typhoonColors.test.js src/features/weather-overlays/lib/typhoonListModel.test.js
npm --prefix frontend run lint:colors
```

Expected: all named tests PASS and the color linter exits 0.

- [ ] **Step 5: Commit the independently tested model change.**

```bash
git add frontend/src/features/weather-overlays/lib/typhoonPointMarkers.css frontend/src/features/weather-overlays/lib/typhoonColors.* frontend/src/features/weather-overlays/lib/typhoonListModel.*
git commit -m "feat: add readable typhoon display models"
```

## Task 2: Mapbox layers, impact outlines, and popup interaction

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/typhoonLayers.js`
- Modify: `frontend/src/features/weather-overlays/lib/typhoonLayers.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/typhoonOverlaySync.js`

**Interfaces:**
- Consumes: `symbolIdForIntensity()` and `buildTyphoonPopupModel()` from Task 1; Mapbox `addImage` with canvas `ImageData`, `Marker`, `Popup`, GeoJSON source APIs, and `selected = { number, validAt, row?, pinned? }`.
- Produces: `registerTyphoonSymbolImages(map): void`; `createTyphoonFocusProxies(map, { typhoons, visible, onSelect }): { updateSelected(selected): void, destroy(): void }`; `buildTyphoonGeoJson()` point properties `symbolId`, `name`, `location`, `dir`, `speedKmh`, `maxWindMs`, and `pressureHpa`; installed `typhoon-cone-outline`, `typhoon-gale-outline`, `typhoon-storm-outline`, and `typhoon-points-symbol` layers.

- [ ] **Step 1: Add failing layer tests.**

```js
test('모든 분석·예보 지점에 canvas 심볼 ID와 popup 원천 값이 있다', () => {
  const { points } = buildTyphoonGeoJson(TYPHOONS)
  assert.deepEqual(points.features.map((f) => f.properties.symbolId), [
    'typhoon-5', 'typhoon-5', 'typhoon-5', 'typhoon-5',
  ])
  assert.equal(points.features[0].properties.name, '힌남노')
})

test('오차·강풍·폭풍 영역에 fill과 outline 레이어가 모두 있다', () => {
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-cone-fill'))
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-cone-outline'))
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-gale-fill'))
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-gale-outline'))
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-storm-fill'))
  assert.ok(TYPHOON_LAYER_IDS.includes('typhoon-storm-outline'))
})

test('outline paint는 cone만 점선이고 fill보다 불투명하다', () => {
  const layers = []
  addTyphoonLayers(fakeMapCollecting(layers))
  const byId = Object.fromEntries(layers.map((layer) => [layer.id, layer]))
  assert.deepEqual(byId['typhoon-cone-outline'].paint['line-dasharray'], [2, 2])
  assert.equal(byId['typhoon-gale-outline'].paint['line-dasharray'], undefined)
  assert.equal(byId['typhoon-storm-outline'].paint['line-dasharray'], undefined)
  assert.equal(byId['typhoon-track-line'].paint['line-dasharray'], undefined)
  assert.deepEqual(byId['typhoon-forecast-track-line'].paint['line-dasharray'], [2, 2])
  assert.ok(byId['typhoon-cone-fill'].paint['fill-opacity'] < byId['typhoon-cone-outline'].paint['line-opacity'])
  assert.ok(byId['typhoon-gale-fill'].paint['fill-opacity'] < byId['typhoon-gale-outline'].paint['line-opacity'])
  assert.ok(byId['typhoon-storm-fill'].paint['fill-opacity'] < byId['typhoon-storm-outline'].paint['line-opacity'])
})
```

- [ ] **Step 2: Run the layer test and confirm failure.**

Run:

```bash
npm --prefix frontend test -- src/features/weather-overlays/lib/typhoonLayers.test.js
```

Expected: FAIL because point properties have no `symbolId` and the three outline layer IDs are absent.

- [ ] **Step 3: Install the map representation and interactions.**

```js
// typhoonLayers.js
registerTyphoonSymbolImages(map) // map.hasImage(id) guard + canvas ImageData only
add({ id: 'typhoon-cone-outline', type: 'line', source: 'typhoon-cone',
  paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 1, 'line-dasharray': [2, 2] } })
add({ id: 'typhoon-gale-outline', type: 'line', source: 'typhoon-gale',
  paint: { 'line-color': ['get', 'color'], 'line-width': 2.25, 'line-opacity': 1 } })
add({ id: 'typhoon-storm-outline', type: 'line', source: 'typhoon-storm',
  paint: { 'line-color': ['get', 'color'], 'line-width': 2.75, 'line-opacity': 1 } })
add({ id: 'typhoon-points-symbol', type: 'symbol', source: 'typhoon-points',
  layout: { 'icon-image': ['get', 'symbolId'], 'icon-size': 1, 'icon-allow-overlap': true } })
```

Add `name: '힌남노'` to the in-file `TYPHOONS` unit fixture before asserting the copied point property. Replace circle and current-only text-label layers with the Mapbox `typhoon-points-symbol` layer. `registerTyphoonSymbolImages()` draws six 40×40 canvas `ImageData` sprites and adds each only if `map.hasImage(id)` is false, so every style reload re-registers its missing images safely.

Create an invisible DOM `Marker` button per source point only as a keyboard focus proxy. It has `var(--touch-min)` geometry, `pointer-events:none`, `aria-label` from the popup model, no visible child artwork, and a visible `:focus-visible` ring; hence visible symbols remain Mapbox layers and mouse/touch map interaction is unchanged. The proxy receives only `focus`/`blur`; `typhoon-points-symbol` owns `mouseenter`/`mouseleave`.

`typhoonLayers.js` owns one `mapboxgl.Popup`, map-layer pointer handlers, and the focus-proxy collection. In `useTyphoonOverlay`, create the proxy controller in a **separate** effect whose dependencies are only map/style readiness/revision, snapshot, visible, and stable `select`; do not include `selected`. A second small effect calls `controller.updateSelected(selected)` to change only proxy classes/attributes in place. This prevents pointer or keyboard focus from being destroyed when marker activation selects its radius.

On `typhoon-points-symbol` pointer enter or a focus-proxy focus, the controller calls `onSelect({ number, validAt, row })`, sets the map cursor for pointer entry, and mounts a semantic `<section role="region" aria-label="태풍 상세 — ${ariaLabel}">` using `document.createElement()` and `textContent` for every upstream value. The popup root handles pointerenter/pointerleave: leaving the map symbol starts a zero-delay close timer, entering the popup cancels it, and leaving both calls `onSelect(null)` then closes it. Focus-proxy blur follows the same rule only when focus is not moving to another proxy. There is no map click-to-pin behavior. Cleanup removes proxies, popup, timers, cursor changes, and every map/DOM listener. `typhoonOverlaySync` otherwise keeps fetch/React selection state.

Use the exact same feature color for a storm's fill and outline, keep fill opacity lower than outline opacity, and preserve the selected-radius update. Assert a focused marker remains the active DOM element after its selection state updates, and after two basemap/style reloads marker controls still exist and are correctly positioned. DOM markers must be synchronized on style/data/visibility changes, but only destroyed when those stable inputs change.

- [ ] **Step 4: Run layer/model tests and the production build.**

Run:

```bash
npm --prefix frontend test -- src/features/weather-overlays/lib/typhoonLayers.test.js src/features/weather-overlays/lib/typhoonListModel.test.js
npm --prefix frontend run build
```

Expected: all tests PASS; Vite production build exits 0 without Mapbox image-loader errors.

- [ ] **Step 5: Commit map layer behavior.**

```bash
git add frontend/src/features/weather-overlays/lib/typhoonLayers.js frontend/src/features/weather-overlays/lib/typhoonLayers.test.js frontend/src/features/weather-overlays/lib/typhoonOverlaySync.js
git commit -m "feat: render typhoon symbols and visible radii"
```

## Task 3: Tabbed, aligned typhoon panel

**Files:**
- Modify: `frontend/src/features/weather-overlays/TyphoonPanel.jsx`
- Modify: `frontend/src/features/weather-overlays/TyphoonPanel.css`
- Modify: `frontend/src/features/weather-overlays/lib/typhoonListModel.test.js`

**Interfaces:**
- Consumes: Task 1 list item `{ number, title, color, analyzedAt, currentRow, forecastRows, pastRows, center }`; `selected`, `onSelect`, `onFocus`, and `onClose` props already supplied by `MapView`.
- Produces: one `role="tablist"` with tab accessible names such as `19호 솔릭`; one selected detail section; keyboard-focusable forecast/past rows that continue to call `onSelect({ number, validAt, row, pinned? })`.

- [ ] **Step 1: Add the failing browser assertions to the typhoon contract.**

```js
test('태풍 패널은 탭으로 한 태풍만 상세 표시하고 예보의 다섯 열을 유지한다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const panel = page.getByLabel('활성 태풍 목록')
  const tabs = panel.getByRole('tab')
  await expect(tabs).toHaveCount(2)
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('columnheader', { name: '기압' })).toBeVisible()
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByText(`${snapshot.typhoons[1].number}호 태풍`)).toBeVisible()
  await expect.poll(async () => (await page.evaluate(() => window.__map?.getCenter().lng))).toBeCloseTo(snapshot.typhoons[1].current.lon, 0)
})
```

- [ ] **Step 2: Run the single contract test and confirm failure.**

Run:

```bash
npm --prefix frontend run dev:contract -- contracts/typhoon.spec.mjs -g "태풍 패널은 탭으로"
```

Expected: FAIL because the current panel has no tabs or columnheader roles.

- [ ] **Step 3: Replace the multi-item table markup with selected-tab detail markup.**

```jsx
<div className="typhoon-tabs" role="tablist" aria-label="표시할 태풍 선택">
  {items.map((item) => (
    <button role="tab" id={`typhoon-tab-${item.number}`} aria-selected={item.number === activeNumber}
      aria-controls={`typhoon-panel-${item.number}`} tabIndex={item.number === activeNumber ? 0 : -1}
      onClick={() => { setActiveNumber(item.number); onFocus?.(item) }}>
      <span className="typhoon-tab__dot" style={{ backgroundColor: item.color }} />
      {item.number}호 {item.name ?? '태풍'}
    </button>
  ))}
</div>
<section id={`typhoon-panel-${active.number}`} role="tabpanel" aria-labelledby={`typhoon-tab-${active.number}`} className="typhoon-tabpanel" style={{ '--typhoon-color': active.color }}>
  <div className="typhoon-current">
  <h2 id={`typhoon-${active.number}`}>{active.title}</h2>
  <CurrentSummary row={active.currentRow} analyzedAt={active.analyzedAt} />
  </div>
<TrackGrid rows={active.forecastRows} label="예상 경로" onSelect={onSelect} onBlur={() => onSelect?.(null)} />
  <details><summary>지난 관측 {active.pastRows.length}개</summary><TrackGrid rows={active.pastRows} ... /></details>
</section>
```

Use `activeNumber` initialized from the first item and reset it to the first available item if polling removes the selected typhoon. Implement the standard roving-tab behavior: ArrowLeft/ArrowRight chooses the adjacent enabled tab, moves focus, sets `activeNumber`, and calls `onFocus(item)`; Home/End choose first/last. Every tab has at least `var(--touch-min)` height/width and `var(--space-s)` separation. Forecast/past rows call `onSelect(payload)` on hover/focus and `onSelect(null)` on mouseleave/blur; the existing selector preserves a click-pinned row.

Keep the desktop grid template identical for header and rows: `minmax(5.25rem, 0.9fr) minmax(3rem, 0.55fr) minmax(4.5rem, 0.75fr) minmax(4.5rem, 0.75fr) minmax(0, 2.5fr)`. The minimums are text-content widths (Korean date, strength, `40 m/s`, `955 hPa`) rather than arbitrary pixel layout widths. Apply left/center/right/left alignment respectively. Set row block padding to `var(--space-m)` and a single neutral divider. On mobile, make the fifth location cell `grid-column: 1 / -1` in a second row; do not add horizontal page or panel scrolling. Use a color dot, active-tab underline, and a 3px current-summary leading rule only; do not use tinted cards, colored body text, gradients, or pill badges.

- [ ] **Step 4: Run the focused contract and responsive lint/test checks.**

Run:

```bash
npm --prefix frontend run dev:contract -- contracts/typhoon.spec.mjs -g "태풍 패널은 탭으로"
npm --prefix frontend test -- src/features/weather-overlays/lib/typhoonListModel.test.js
npm --prefix frontend run lint:colors
```

Expected: focused contract passes on desktop, iPad landscape, and mobile; unit tests and color lint pass.

- [ ] **Step 5: Commit the panel refactor.**

```bash
git add frontend/src/features/weather-overlays/TyphoonPanel.jsx frontend/src/features/weather-overlays/TyphoonPanel.css frontend/src/features/weather-overlays/lib/typhoonListModel.test.js frontend/verification/contracts/typhoon.spec.mjs
git commit -m "feat: simplify typhoon panel navigation"
```

## Task 4: Full contract, visual evidence, and graph refresh

**Files:**
- Modify: `frontend/verification/contracts/typhoon.spec.mjs`
- Create: `artifacts/responsive-screenshots/typhoon-map-panel/<timestamp>/manifest.md` (ignored evidence)
- Modify: `graphify-out/` only through `graphify update .` if the repository hook has not already updated it.

**Interfaces:**
- Consumes: completed Tasks 1–3 and the fixed `/api/typhoon` fixture in `frontend/verification/contracts/fixtures/typhoon-snapshot.json`.
- Produces: a passing complete `typhoon` contract and Linux browser screenshots proving the visual states.

- [ ] **Step 1: Add failing end-to-end assertions for the map-visible contract.**

```js
test('태풍 지도는 모든 시점 강도 심볼, 반경 윤곽선, hover 상세를 보인다', async ({ page }, testInfo) => {
  await openTyphoon(page, testInfo, snapshot)
  const layerIds = await page.evaluate(typhoonLayerIds)
  expect(layerIds).toContain('typhoon-cone-outline')
  expect(layerIds).toContain('typhoon-gale-outline')
  expect(layerIds).toContain('typhoon-storm-outline')
  const point = await page.evaluate(() => {
    const row = window.__map.getSource('typhoon-points').serialize().data.features.find((f) => f.properties.number === 19)
    return window.__map.project(row.geometry.coordinates)
  })
  await page.mouse.move(point.x, point.y)
  await expect(page.getByRole('region', { name: /태풍 상세.*19호/ })).toContainText('중심기압')
  const proxy = page.getByRole('button', { name: /19호.*강도 3/ }).first()
  await proxy.focus()
  await expect(page.getByRole('region', { name: /태풍 상세.*19호/ })).toContainText('유효시각')
})
```

Use `map.project()` to calculate the pointer coordinate from the fixture rather than fixed pixels, and use the accessible DOM proxy only for focus. Assert proxy count equals fixture analysis+forecast row count, tab focus opens the correct map center, and after two basemap switches the `typhoon-points-symbol` layer, its six `map.hasImage()` entries, and focus proxies still exist. At zoom 4 and zoom 7, compare `map.project(feature.coordinates)` with the proxy button bounding-box centre within 2px. Drag across a proxy point and assert the map center changes to prove transparent proxies do not intercept pan. Move the pointer from map symbol to popup root and assert it remains visible, then leave the popup and assert it closes. Focus then blur a forecast panel row and assert `getSource('typhoon-points').serialize().data` has no `isSelected` feature. Scope popup assertions by `role="region"` and an accessible name beginning `태풍 상세 —`; do not use a generic Mapbox-popup selector.

- [ ] **Step 2: Run the new focused contract and confirm failure before final adjustments.**

Run:

```bash
npm --prefix frontend run dev:contract -- contracts/typhoon.spec.mjs -g "태풍 지도는 모든 시점"
```

Expected: FAIL until the popup root and all named layers are present.

- [ ] **Step 3: Make only contract-required final adjustments.**

```js
// popup root built by typhoonLayers.js
const root = document.createElement('section')
root.setAttribute('role', 'region')
root.setAttribute('aria-label', `태풍 상세 — ${model.ariaLabel}`)
const title = document.createElement('strong')
title.textContent = model.title
root.append(title, makeDetailList(model))
popup.setDOMContent(root)
```

`makeDetailList()` must create `dt`/`dd` nodes with `textContent`; no upstream name or location enters `innerHTML`. Add a stable `data-testid` only if a role/label/text locator cannot identify a required control. Keep source-data assertions on `getSource(id).serialize().data`, not `querySourceFeatures`.

- [ ] **Step 4: Run the complete verification set and capture Linux evidence.**

Run:

```bash
npm --prefix frontend test -- src/features/weather-overlays/lib/typhoonColors.test.js src/features/weather-overlays/lib/typhoonListModel.test.js src/features/weather-overlays/lib/typhoonLayers.test.js
npm --prefix frontend run lint:colors
npm --prefix frontend run build
npm --prefix frontend run dev:contract -- contracts/typhoon.spec.mjs
graphify update .
```

In the contract, save and attach screenshots for: desktop two-typhoon map with outlines, desktop hover popup, iPad tabbed panel, and mobile reflow. Put the command, commit, viewport, and screenshot paths in the ignored `manifest.md`.

Expected: all unit tests, color lint, production build, and the full typhoon contract pass; screenshots are Linux `*-linux.png` artifacts.

- [ ] **Step 5: Commit verification-only changes.**

```bash
git add frontend/verification/contracts/typhoon.spec.mjs
git commit -m "test: verify readable typhoon map and panel"
```

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover contrast palette, all-point intensity symbols, outlines, uncertainty distinction, and hover data; Task 3 covers tab selection, current-summary restraint, five fields, spacing, grid alignment, past observations, and mobile reflow; Task 4 covers browser evidence and graph refresh.
- **No invented product decisions:** The only implementation-level choices are canvas image IDs, transparent accessibility proxies, grid dimensions, and a non-blue palette replacement; they realize approved behavior without changing data or forecast meaning.
- **Type consistency:** Task 1 defines `buildTyphoonPopupModel()`/`symbolIdForIntensity()` and Task 2 consumes those exact names. Task 1 defines `currentRow`/`forecastRows` with their selection fields; Task 3 consumes those exact fields. `selected` retains its existing `{ number, validAt, row, pinned? }` shape.
- **Scope:** Backend collection, geometry, route exposure, and `MapView` remain untouched. The plan has no placeholders or deferred implementation steps.
