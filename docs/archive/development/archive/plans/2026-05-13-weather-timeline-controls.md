# Weather Timeline Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared bottom timeline for RADAR, SATELLITE, and LIGHTNING playback, show SIGMET/AIRMET valid times on advisory badges/details, and show ADS-B display reference time without adding new backend data.

**Architecture:** Keep backend data shape unchanged. Add small frontend-only utilities for time parsing and frame selection, add focused display components, then wire them into `MapView.jsx`. Use the selected timeline time to pick the nearest previous available frame for each enabled loop layer.

**Tech Stack:** React 19, Vite, Mapbox GL, existing Node test runner where practical, frontend build verification.

---

### Task 1: Add Time And Frame Selection Helpers

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/weatherTimeline.js`

- [ ] **Step 1: Write helper module**

```js
export function parseKstTmToMs(value) {
  const raw = String(value || '').trim()
  if (!/^\d{12}$/.test(raw)) return null
  return Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)) - 9,
    Number(raw.slice(10, 12)),
  )
}

export function formatKstMinute(valueMs) {
  if (!Number.isFinite(valueMs)) return '--:--'
  const kst = new Date(valueMs + 9 * 60 * 60 * 1000)
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hour = String(kst.getUTCHours()).padStart(2, '0')
  const minute = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${month}/${day} ${hour}:${minute} KST`
}

export function normalizeFrame(frame) {
  const timeMs = parseKstTmToMs(frame?.tm)
  return Number.isFinite(timeMs) ? { ...frame, timeMs } : null
}

export function normalizeFrames(frames) {
  return (Array.isArray(frames) ? frames : [])
    .map(normalizeFrame)
    .filter(Boolean)
    .sort((a, b) => a.timeMs - b.timeMs)
}

export function pickNearestPreviousFrame(frames, selectedTimeMs) {
  if (!frames.length || !Number.isFinite(selectedTimeMs)) return null
  let selected = null
  for (const frame of frames) {
    if (frame.timeMs <= selectedTimeMs) selected = frame
    else break
  }
  return selected || frames[0]
}

export function buildTimelineTicks(layerFrames) {
  const values = new Set()
  layerFrames.forEach((frames) => frames.forEach((frame) => values.add(frame.timeMs)))
  return [...values].sort((a, b) => a - b)
}
```

- [ ] **Step 2: Verify helper syntax**

Run: `node --check frontend/src/features/weather-overlays/lib/weatherTimeline.js`

Expected: exit 0.

### Task 2: Add Bottom Weather Timeline Component

**Files:**
- Create: `frontend/src/features/weather-overlays/WeatherTimelineBar.jsx`
- Modify: `frontend/src/features/map/MapView.css`

- [ ] **Step 1: Create component**

```jsx
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import { formatKstMinute } from './lib/weatherTimeline.js'

function WeatherTimelineBar({
  isVisible,
  isPlaying,
  selectedIndex,
  tickCount,
  selectedTimeMs,
  activeFrameLabels,
  onPlayPause,
  onIndexChange,
  onStep,
}) {
  if (!isVisible || tickCount <= 0) return null

  return (
    <section className="weather-timeline-bar" aria-label="Weather playback timeline">
      <button type="button" className="weather-timeline-icon" onClick={() => onStep(-1)} aria-label="Previous frame">
        <SkipBack size={16} />
      </button>
      <button type="button" className="weather-timeline-play" onClick={onPlayPause} aria-label={isPlaying ? 'Pause weather loop' : 'Play weather loop'}>
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <input
        className="weather-timeline-slider"
        type="range"
        min="0"
        max={Math.max(0, tickCount - 1)}
        value={selectedIndex}
        onChange={(event) => onIndexChange(Number(event.target.value))}
        aria-label="Weather frame time"
      />
      <div className="weather-timeline-time">{formatKstMinute(selectedTimeMs)}</div>
      <div className="weather-timeline-status">
        {activeFrameLabels.map((item) => (
          <span key={item.key}>{item.label}</span>
        ))}
      </div>
      <button type="button" className="weather-timeline-icon" onClick={() => onStep(1)} aria-label="Next frame">
        <SkipForward size={16} />
      </button>
      <RotateCcw className="weather-timeline-loop" size={14} aria-hidden="true" />
    </section>
  )
}

export default WeatherTimelineBar
```

- [ ] **Step 2: Add CSS**

Append styles for `.weather-timeline-bar`, icon buttons, slider, time, status chips. Place at bottom center, `bottom: 18px`, `z-index: 5`, with translucent white background, blur, subtle border, and responsive width `min(760px, calc(100% - 48px))`.

- [ ] **Step 3: Verify component syntax**

Run: `node --check frontend/src/features/weather-overlays/WeatherTimelineBar.jsx`

Expected: exit 0.

### Task 3: Wire Timeline State Into MapView

**Files:**
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Import helpers and component**

Add imports for `WeatherTimelineBar` and helper functions from `weatherTimeline.js`.

- [ ] **Step 2: Build normalized frames**

Use `useMemo` to derive:
- `radarFrames` from `echoMeta.frames`, fallback `echoMeta.nationwide`
- `satelliteFrames` from `satMeta.frames`, fallback `satMeta.latest`
- `lightningFrames` as a single current frame from `lightningData.query.tm` for now
- `weatherTimelineTicks` as the union of enabled RADAR/SATELLITE/LIGHTNING frame times

- [ ] **Step 3: Add selected index and playback state**

Add state:
```js
const [weatherTimelineIndex, setWeatherTimelineIndex] = useState(0)
const [weatherTimelinePlaying, setWeatherTimelinePlaying] = useState(false)
```

Clamp index when tick count changes. Default to latest tick when data first appears or when the selected index is out of range.

- [ ] **Step 4: Pick display frames**

Replace current `radarFrame` and `satFrame` derivation with selected-time aware frames:
```js
const selectedWeatherTimeMs = weatherTimelineTicks[weatherTimelineIndex] ?? weatherTimelineTicks.at(-1) ?? null
const radarFrame = useMemo(() => pickNearestPreviousFrame(radarFrames, selectedWeatherTimeMs), [radarFrames, selectedWeatherTimeMs])
const satFrame = useMemo(() => pickNearestPreviousFrame(satelliteFrames, selectedWeatherTimeMs), [satelliteFrames, selectedWeatherTimeMs])
```

Keep lightning data unchanged initially, but show `lightning.query.tm` as the matched lightning time label. Do not invent missing lightning history in this task.

- [ ] **Step 5: Add playback interval**

When playing and timeline is visible, advance index every 800ms. Loop from latest back to first.

- [ ] **Step 6: Render timeline**

Render `WeatherTimelineBar` near the existing `SigwxHistoryBar`. `isVisible` is true when any of `radar`, `satellite`, `lightning` is enabled and at least one timeline tick exists.

- [ ] **Step 7: Move SIGWX bar above timeline when both visible**

Pass a class or prop to `SigwxHistoryBar` so it can add an elevated class when the weather timeline is visible. Do not merge SIGWX into the shared playback control.

### Task 4: Show SIGMET/AIRMET Valid Times In Advisory UI

**Files:**
- Modify: `frontend/src/features/weather-overlays/AdvisoryBadges.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/map/MapView.css`

- [ ] **Step 1: Add valid range formatter in `MapView.jsx`**

Create small local helper using existing KST formatting style:
```js
function summarizeValidRange(items) {
  const ranges = items
    .map((item) => [Date.parse(item.valid_from), Date.parse(item.valid_to)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end))
  if (!ranges.length) return null
  const start = Math.min(...ranges.map(([value]) => value))
  const end = Math.max(...ranges.map(([, value]) => value))
  return `${formatSigwxStamp(start)} - ${formatSigwxStamp(end)}`
}
```

- [ ] **Step 2: Add `validLabel` to badge items**

For SIGMET/AIRMET badge items, include valid range summary. SIGWX keeps count-only badge behavior.

- [ ] **Step 3: Render badge sublabel and detail item valid time**

Update `AdvisoryBadges` to show `item.validLabel` below SIGMET/AIRMET badge labels and per-item `valid_from ~ valid_to` in the detail list.

### Task 5: Show ADS-B Reference Time

**Files:**
- Create: `frontend/src/features/weather-overlays/AdsbTimestamp.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/map/MapView.css`

- [ ] **Step 1: Create timestamp pill**

Render only when ADS-B is visible and `adsbData.updated_at` exists. Text: `ADS-B 05/13 22:01 KST`.

- [ ] **Step 2: Position behavior**

When weather timeline is visible, place ADS-B as a compact status chip inside or adjacent to the bottom timeline. When timeline is hidden, render a small bottom-center pill.

### Task 6: Verification And Review

**Files:**
- No new files unless a small test file is added for helpers.

- [ ] **Step 1: Syntax checks**

Run:
```powershell
node --check frontend/src/features/weather-overlays/lib/weatherTimeline.js
node --check frontend/src/features/weather-overlays/WeatherTimelineBar.jsx
node --check frontend/src/features/weather-overlays/AdsbTimestamp.jsx
```

- [ ] **Step 2: Build**

Run: `npm.cmd run build --prefix frontend`

Expected: Vite build succeeds. Existing large chunk warning is acceptable.

- [ ] **Step 3: Browser verification**

Start dev server with `npm.cmd run dev`, open the local app, and verify:
- RADAR/SATELLITE/LIGHTNING timeline appears only when one of those layers is active.
- Slider changes RADAR/SATELLITE frames using nearest previous frame selection.
- Play/pause advances and loops.
- SIGWX history bar sits above the shared timeline when both are visible.
- SIGMET/AIRMET badges show valid time when data exists.
- ADS-B timestamp appears when ADS-B is enabled.

- [ ] **Step 4: Self-review**

Review diff for:
- No backend data model changes.
- No changes to airport panel time displays.
- No unrelated formatting churn.
- Mobile width does not overlap left layer drawer, right legends, or bottom UTC bar.

