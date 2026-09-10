# Weather Layer Timestamp Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show issued/valid times for Wind, Temp, Cloud, Icing, Turbulence, and 비행기상구역 layers in a compact strip at the top of the map when each layer is toggled on.

**Architecture:** Add three new optional inputs (`nwpSelection`, `ktgGrid`, `flightCategoryGeojson`) to `buildWeatherOverlayModel` which compute five new label fields. A new `WeatherLayerTimestampBar` component reads those labels from MapView and renders them as a top-positioned strip.

**Tech Stack:** React (JSX), `node:test` for unit tests, existing `formatSigwxStamp` / `parseSigwxTmfcToMs` utilities.

---

## File Map

| File | Change |
|---|---|
| `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` | Add 3 inputs + 5 output labels |
| `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js` | New test cases for new labels |
| `frontend/src/features/weather-overlays/WeatherLayerTimestampBar.jsx` | New component (create) |
| `frontend/src/features/map/MapView.jsx` | Pass new inputs, destructure labels, mount bar |
| `frontend/src/features/map/MapView.css` | Add `.layer-timestamp-bar` styles |

---

## Task 1: Extend `buildWeatherOverlayModel` with timestamp labels

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Test: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`

### Step 1: Write failing tests

Add at the bottom of `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`:

```js
test('buildWeatherOverlayModel computes nwp issue and valid labels from nwpSelection', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null, satMeta: null, lightningData: null,
    sigwxLowData: null, sigwxLowHistoryData: [], sigmetData: null, airmetData: null,
    visibility: { wind: true },
    weatherTimelineIndex: -1, sigwxHistoryIndex: 0,
    sigwxFilter: {}, hiddenAdvisoryKeys: {},
    selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: 0, blinkLightning: false, lightningBlinkOff: false,
    nwpSelection: { tmfc: '202606090600', hf: 3 },
    tz: 'KST',
  })
  assert.equal(model.nwpIssueLabel, '06/09 06:00 KST')
  assert.equal(model.nwpValidLabel, '06/09 09:00 KST')
})

test('buildWeatherOverlayModel computes ktg issue and valid labels from ktgGrid', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null, satMeta: null, lightningData: null,
    sigwxLowData: null, sigwxLowHistoryData: [], sigmetData: null, airmetData: null,
    visibility: { turbulence: true },
    weatherTimelineIndex: -1, sigwxHistoryIndex: 0,
    sigwxFilter: {}, hiddenAdvisoryKeys: {},
    selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: 0, blinkLightning: false, lightningBlinkOff: false,
    ktgGrid: { tmfc: '202606090300', validTime: '2026-06-09T06:00:00.000Z' },
    tz: 'KST',
  })
  assert.equal(model.ktgIssueLabel, '06/09 03:00 KST')
  assert.equal(model.ktgValidLabel, '06/09 15:00 KST')
})

test('buildWeatherOverlayModel computes flightCategory issue label from fetched_at', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null, satMeta: null, lightningData: null,
    sigwxLowData: null, sigwxLowHistoryData: [], sigmetData: null, airmetData: null,
    visibility: { flightCategory: true },
    weatherTimelineIndex: -1, sigwxHistoryIndex: 0,
    sigwxFilter: {}, hiddenAdvisoryKeys: {},
    selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: 0, blinkLightning: false, lightningBlinkOff: false,
    flightCategoryGeojson: { fetched_at: '2026-06-09T00:50:00.000Z' },
    tz: 'KST',
  })
  assert.equal(model.flightCategoryIssueLabel, '06/09 09:50 KST')
})

test('buildWeatherOverlayModel returns dash labels when nwpSelection is null', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: null, satMeta: null, lightningData: null,
    sigwxLowData: null, sigwxLowHistoryData: [], sigmetData: null, airmetData: null,
    visibility: {},
    weatherTimelineIndex: -1, sigwxHistoryIndex: 0,
    sigwxFilter: {}, hiddenAdvisoryKeys: {},
    selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: 0, blinkLightning: false, lightningBlinkOff: false,
    tz: 'KST',
  })
  assert.equal(model.nwpIssueLabel, '-')
  assert.equal(model.nwpValidLabel, '-')
  assert.equal(model.ktgIssueLabel, '-')
  assert.equal(model.ktgValidLabel, '-')
  assert.equal(model.flightCategoryIssueLabel, '-')
})
```

### Step 2: Run tests — expect failures

```bash
cd frontend && node --test src/features/weather-overlays/lib/weatherOverlayModel.test.js
```

Expected: 4 new failures (TypeError or assertion errors on undefined properties).

### Step 3: Implement new logic in `weatherOverlayModel.js`

**3a.** Add a private helper just before `buildWeatherOverlayModel`:

```js
function nwpValidIso(tmfc, hf) {
  const base = parseSigwxTmfcToMs(tmfc)
  if (!Number.isFinite(base) || !Number.isFinite(Number(hf))) return null
  return new Date(base + Number(hf) * 3600000).toISOString()
}
```

**3b.** Add three new optional parameters to `buildWeatherOverlayModel`'s destructured input (add after the existing params, before the closing `}`):

```js
export function buildWeatherOverlayModel({
  // ...existing params...
  lightningReferenceTimeMs,
  blinkLightning,
  lightningBlinkOff,
  nwpSelection = null,
  ktgGrid = null,
  flightCategoryGeojson = null,
  tz = 'KST',
}) {
```

**3c.** Add five new fields to the return object, after `sigwxValidLabel`:

```js
    sigwxIssueLabel: formatSigwxStamp(selectedSigwxEntry?.fetched_at, tz),
    sigwxValidLabel: formatSigwxStamp(selectedSigwxEntry?.tmfc, tz),
    nwpIssueLabel: formatSigwxStamp(nwpSelection?.tmfc ?? null, tz),
    nwpValidLabel: formatSigwxStamp(nwpValidIso(nwpSelection?.tmfc, nwpSelection?.hf), tz),
    ktgIssueLabel: formatSigwxStamp(ktgGrid?.tmfc ?? null, tz),
    ktgValidLabel: formatSigwxStamp(ktgGrid?.validTime ?? null, tz),
    flightCategoryIssueLabel: formatSigwxStamp(flightCategoryGeojson?.fetched_at ?? null, tz),
    blinkLightning,
```

### Step 4: Run tests — expect all pass

```bash
cd frontend && node --test src/features/weather-overlays/lib/weatherOverlayModel.test.js
```

Expected output:
```
# tests 9
# pass 9
# fail 0
```

### Step 5: Commit

```bash
git add frontend/src/features/weather-overlays/lib/weatherOverlayModel.js \
        frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js
git commit -m "feat(overlay-model): add nwp/ktg/flightCategory timestamp labels"
```

---

## Task 2: Create `WeatherLayerTimestampBar` component

**Files:**
- Create: `frontend/src/features/weather-overlays/WeatherLayerTimestampBar.jsx`

### Step 1: Create the component file

```jsx
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

/**
 * Shows issued/valid time for active weather layers at the top of the map.
 *
 * @param {{ entries: Array<{ key: string, label: string, issueLabel: string, validLabel?: string }> }} props
 */
function WeatherLayerTimestampBar({ entries = [] }) {
  const validEntries = entries.filter((e) => e.issueLabel && e.issueLabel !== '-')
  if (validEntries.length === 0) return null

  return (
    <div className="layer-timestamp-bar" aria-label="레이어 발표·유효 시간">
      {validEntries.map((entry) => (
        <div key={entry.key} className="layer-timestamp-entry">
          <span className="layer-timestamp-name">{entry.label}</span>
          <span className="layer-timestamp-time">발표 {entry.issueLabel}</span>
          {entry.validLabel && entry.validLabel !== '-' && (
            <span className="layer-timestamp-time">유효 {entry.validLabel}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default WeatherLayerTimestampBar
```

(No unit test — pure display component with no logic beyond filtering `-` labels.)

### Step 2: Commit

```bash
git add frontend/src/features/weather-overlays/WeatherLayerTimestampBar.jsx
git commit -m "feat: add WeatherLayerTimestampBar component"
```

---

## Task 3: Wire into `MapView.jsx`

**Files:**
- Modify: `frontend/src/features/map/MapView.jsx`

### Step 1: Add import at the top (with other weather-overlay imports)

Find the block of weather-overlay imports (around line 17–22) and add:

```js
import WeatherLayerTimestampBar from '../weather-overlays/WeatherLayerTimestampBar.jsx'
```

### Step 2: Pass new inputs into `buildWeatherOverlayModel`

Find the `buildWeatherOverlayModel({...})` call (around line 289). Add three new entries to **both** the call object and the `useMemo` dependency array:

```js
  const weatherOverlayModel = useMemo(() => buildWeatherOverlayModel({
    echoMeta,
    satMeta,
    lightningData,
    sigwxLowData,
    sigwxLowHistoryData,
    sigmetData,
    airmetData,
    visibility: metVisibility,
    weatherTimelineIndex,
    sigwxHistoryIndex,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta,
    selectedSigwxCloudMeta,
    lightningReferenceTimeMs,
    nwpSelection,           // ← add
    ktgGrid,                // ← add
    flightCategoryGeojson,  // ← add
    tz,
  }), [
    echoMeta,
    satMeta,
    lightningData,
    sigwxLowData,
    sigwxLowHistoryData,
    sigmetData,
    airmetData,
    metVisibility,
    weatherTimelineIndex,
    sigwxHistoryIndex,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta,
    selectedSigwxCloudMeta,
    lightningReferenceTimeMs,
    nwpSelection,           // ← add
    ktgGrid,                // ← add
    flightCategoryGeojson,  // ← add
    tz,
  ])
```

### Step 3: Destructure new label fields from the model

Find the existing destructure block (after `const weatherOverlayModel = ...`). Add the five new fields alongside `sigwxIssueLabel`:

```js
  const {
    // ...existing fields...
    sigwxIssueLabel,
    sigwxValidLabel,
    nwpIssueLabel,          // ← add
    nwpValidLabel,          // ← add
    ktgIssueLabel,          // ← add
    ktgValidLabel,          // ← add
    flightCategoryIssueLabel, // ← add
  } = weatherOverlayModel
```

### Step 4: Build the `timestampEntries` memo

Add this `useMemo` after the `advisoryPanelItems` memo (around line 348):

```js
  const timestampEntries = useMemo(() => {
    const entries = []
    if (enableWindOverlay && metVisibility.wind)
      entries.push({ key: 'wind', label: 'Wind', issueLabel: nwpIssueLabel, validLabel: nwpValidLabel })
    if (enableWindOverlay && metVisibility.temp)
      entries.push({ key: 'temp', label: 'Temp', issueLabel: nwpIssueLabel, validLabel: nwpValidLabel })
    if (enableWindOverlay && metVisibility.cloud)
      entries.push({ key: 'cloud', label: 'Moisture', issueLabel: nwpIssueLabel, validLabel: nwpValidLabel })
    if (enableWindOverlay && metVisibility.icing)
      entries.push({ key: 'icing', label: 'Icing', issueLabel: nwpIssueLabel, validLabel: nwpValidLabel })
    if (enableWindOverlay && metVisibility.turbulence)
      entries.push({ key: 'turbulence', label: 'Turbulence', issueLabel: ktgIssueLabel, validLabel: ktgValidLabel })
    if (metVisibility.flightCategory)
      entries.push({ key: 'flightCategory', label: '비행기상구역', issueLabel: flightCategoryIssueLabel })
    return entries
  }, [
    enableWindOverlay,
    metVisibility.wind, metVisibility.temp, metVisibility.cloud,
    metVisibility.icing, metVisibility.turbulence, metVisibility.flightCategory,
    nwpIssueLabel, nwpValidLabel, ktgIssueLabel, ktgValidLabel, flightCategoryIssueLabel,
  ])
```

### Step 5: Mount the component in the JSX

Find the `{error && <div className="map-view-error" ...>}` line (around line 1018). Add the bar directly after it:

```jsx
      {error && <div className="map-view-error" role="alert">{error}</div>}

      <WeatherLayerTimestampBar entries={timestampEntries} />
```

### Step 6: Commit

```bash
git add frontend/src/features/map/MapView.jsx
git commit -m "feat(map): wire WeatherLayerTimestampBar into MapView"
```

---

## Task 4: Style the timestamp bar

**Files:**
- Modify: `frontend/src/features/map/MapView.css`

### Step 1: Add CSS at the end of the file

```css
/* ── Weather Layer Timestamp Bar ───────────────────────────── */
.layer-timestamp-bar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 10px;
  border: 1px solid rgba(17, 24, 39, 0.14);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
  pointer-events: none;
}

.layer-timestamp-entry {
  display: flex;
  align-items: baseline;
  gap: 8px;
  white-space: nowrap;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 10px;
  line-height: 1.3;
}

.layer-timestamp-name {
  color: #94a3b8;
  font-weight: 800;
  min-width: 72px;
  font-variant-numeric: tabular-nums;
}

.layer-timestamp-time {
  color: #e2e8f0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

### Step 2: Verify visually

Start the dev server:

```bash
cd frontend && npm run dev
```

Open the app, toggle on Wind/Temp/Turbulence/비행기상구역 layers. Confirm:
- Bar appears at top-center of the map
- Each active layer shows its own row with 발표 time
- NWP layers (Wind/Temp/Cloud/Icing) also show 유효 time
- Turbulence shows 발표 + 유효
- 비행기상구역 shows 발표 only
- Toggling a layer off removes its row; bar disappears when all are off
- KST/UTC toggle (if present in the UI) updates the displayed times

### Step 3: Commit

```bash
git add frontend/src/features/map/MapView.css
git commit -m "style: add layer-timestamp-bar styles for top-of-map time strip"
```

---

## Self-Review

**Spec coverage:**
- ✅ Wind/Temp/Cloud/Icing — separate rows, shared nwp time
- ✅ Turbulence (KTG) — separate row with ktgGrid.tmfc + validTime
- ✅ 비행기상구역 — separate row, fetched_at only (no valid time)
- ✅ KST/UTC consistent via formatSigwxStamp + tz param
- ✅ Top-of-map placement
- ✅ Test coverage for new model fields
- ✅ `-` labels filtered out (no stale row shown when data is unavailable)

**Placeholder scan:** None found.

**Type consistency:**
- `nwpValidIso` defined in Task 1, used only within Task 1 (private helper)
- `nwpIssueLabel`, `nwpValidLabel`, `ktgIssueLabel`, `ktgValidLabel`, `flightCategoryIssueLabel` — same names throughout Tasks 1, 3
- `entries` prop shape `{ key, label, issueLabel, validLabel? }` — consistent between Task 2 (component) and Task 3 (MapView builder)
