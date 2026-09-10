# Responsive Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build evidence-backed responsive improvements for phone, tablet, and desktop surfaces without treating phone and tablet as the same mobile layout.

**Architecture:** Keep desktop behavior stable, prototype phone-specific improvements narrowly, and collect tablet evidence before applying tablet structural changes. Use CSS-first changes where possible, isolate any JSX changes to the owning feature component, and recapture screenshots after each visible change.

**Tech Stack:** Vite, React 19, plain CSS, Playwright screenshot scripts, Node test runner, existing ProjectAMO responsive layout tokens.

---

## Scope And Guardrails

This plan is for a future implementation session. It assumes the worker starts from branch `codex/responsive-layout-system`.

Required reading before implementation:

- `Architecture.md`
- `EntryPoints.md`
- `agents.md`
- `docs/ui-responsive-guidelines.md`
- `docs/archive/development/plans/2026-05-16-responsive-layout-system.md`
- `docs/archive/development/specs/2026-05-17-responsive-surface-strategy-proposal-ko.md`
- `docs/archive/development/specs/2026-05-17-responsive-surface-strategy-proposal-ko-v2.html`
- `docs/archive/development/specs/2026-05-17-responsive-surface-visual-reference.html`

Important product decisions for this plan:

- Treat phone, tablet, and desktop as separate review surfaces.
- Assume map rendering works in real user environments. If a screenshot shows a black map, investigate capture/rendering separately and do not treat that alone as proof that map layout failed.
- Keep tablet map-plus-information coexistence as a serious candidate.
- Actively adopt the Claude v2 visual proposal for the agreed phone-level prototypes:
  - Airport Panel compact header + horizontal top tabs.
  - Route Briefing form + map-context split layout.
- Use the Claude v2 wireframes as the primary visual reference for those two prototypes. Do not replace them with the simplified wireframes in `responsive-surface-visual-reference.html`.
- Do not implement Airport bottom tabs or segmented controls in this plan.
- Do not declare a single first-class target surface.

Visual reference:

- Primary visual reference for agreed prototype direction: `docs/archive/development/specs/2026-05-17-responsive-surface-strategy-proposal-ko-v2.html`, section `개선안 시각화`.
- Supporting visual reference: `docs/archive/development/specs/2026-05-17-responsive-surface-visual-reference.html`.
- The Claude v2 wireframes should guide visual intent for Airport Panel and Route Briefing. Do not copy v2's report CSS directly into production; translate the layout intent into the owning production CSS/components.
- Keep these corrections while using v2:
  - Treat dark/blank map screenshots as capture artifacts unless live browser verification says otherwise.
  - Do not rely on the claim that the Airport photo header consumes 45 percent unless a fresh measurement proves it.

## Files And Responsibilities

Likely modified production files:

- `frontend/src/features/monitoring/MonitoringPage.jsx`  
  Owns monitoring page state, ops/ground mode, settings modal, and map/weather panel composition.

- `frontend/src/features/monitoring/legacy/App.css`  
  Owns monitoring dashboard layout and responsive rules.

- `frontend/src/features/airport-panel/AirportPanel.css`  
  Owns airport drawer layout, tabs, header, and mobile/tablet responsive presentation.

- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`  
  Owns route briefing form and result UI. Do not touch for Task 5 unless a later route map-context architecture plan is approved.

- `frontend/src/features/route-briefing/RouteBriefing.css`  
  Owns route briefing panel layout and responsive behavior.

- `frontend/src/app/layout/layoutTokens.test.js`  
  Add or update CSS assertions only when new responsive policy rules are introduced.

Likely created artifact files:

- `artifacts/responsive-screenshots/tablet-surface-review/<timestamp>/`
- `artifacts/responsive-screenshots/phone-monitoring-task-tabs/<timestamp>/`
- `artifacts/responsive-screenshots/airport-phone-tabs/<timestamp>/`
- `artifacts/responsive-screenshots/route-briefing-split/<timestamp>/`

Do not delete or revert existing dirty/untracked logs, `.codex/hooks*`, `artifacts/`, or `docs/archive/development/plans/*`.

## Verification Commands

Use PowerShell and `npm.cmd`, not `npm`.

Baseline commands:

```powershell
npm.cmd run test:layout --prefix frontend
npm.cmd run build --prefix frontend
npm.cmd run smoke:responsive --prefix frontend
```

Expected:

- `test:layout`: PASS
- `build`: PASS
- `smoke:responsive`: no horizontal overflow failures

For screenshots, run the local app first if it is not already running:

```powershell
npm.cmd run dev --prefix frontend
```

If the dev server is already running at `http://127.0.0.1:5173`, reuse it.

---

## Task 1: Preflight And Baseline Status

**Files:**
- Read only: `Architecture.md`
- Read only: `EntryPoints.md`
- Read only: `agents.md`
- Read only: `docs/ui-responsive-guidelines.md`
- Read only: `docs/archive/development/plans/2026-05-16-responsive-layout-system.md`
- Read only: `docs/archive/development/specs/2026-05-17-responsive-surface-strategy-proposal-ko-v2.html`
- Read only: `docs/archive/development/specs/2026-05-17-responsive-surface-visual-reference.html`

- [x] **Step 1: Confirm branch and dirty state**

Run:

```powershell
git status --short --branch
```

Expected:

- Branch is `codex/responsive-layout-system`.
- Existing dirty/untracked files may include `.codex/hooks*`, logs, `artifacts/`, and unrelated plan docs.
- Do not delete, reset, or clean them.

- [x] **Step 2: Confirm visual reference loads**

Run:

```powershell
node -e "const fs=require('fs'); for (const p of ['docs/archive/development/specs/2026-05-17-responsive-surface-strategy-proposal-ko-v2.html','docs/archive/development/specs/2026-05-17-responsive-surface-visual-reference.html']) { const s=fs.readFileSync(p,'utf8'); console.log(p, ['개선안 시각화','Airport Panel','Route Briefing'].map(t=>[t,s.includes(t)])); }"
```

Expected:

- Output includes `true` for all three labels.

- [x] **Step 3: Run baseline layout test**

Run:

```powershell
npm.cmd run test:layout --prefix frontend
```

Expected:

- PASS before any implementation.

- [x] **Step 4: Capture baseline if no current dev server is confirmed**

If `http://127.0.0.1:5173` is not responding, start:

```powershell
npm.cmd run dev --prefix frontend
```

Then confirm:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173 -TimeoutSec 5
```

Expected:

- Status code `200`.

---

## Task 2: Tablet Evidence Capture Before Tablet Changes

**Files:**
- Create: `artifacts/responsive-screenshots/tablet-surface-review/<timestamp>/capture-tablet-surface-review.mjs`
- Create: `artifacts/responsive-screenshots/tablet-surface-review/<timestamp>/README.md`
- Create: `artifacts/responsive-screenshots/tablet-surface-review/<timestamp>/review/issues.md`
- Modify: none in `frontend/`

Purpose:

- Collect tablet-specific evidence before changing tablet layout.
- Compare tablet landscape `1180x820` and tablet portrait `820x1180`.

- [x] **Step 1: Create timestamped folder**

Run:

```powershell
Get-Date -Format "yyyy-MM-dd_HHmm"
```

Create:

```text
artifacts/responsive-screenshots/tablet-surface-review/<timestamp>/
artifacts/responsive-screenshots/tablet-surface-review/<timestamp>/review/
```

- [x] **Step 2: Create capture script**

Create `capture-tablet-surface-review.mjs` in the timestamped folder. Use this exact script body:

```js
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '../../../../frontend/node_modules/playwright/index.mjs'

const APP_URL = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const OUT_DIR = new URL('./', import.meta.url)
const REVIEW_DIR = new URL('./review/', import.meta.url)

const viewports = [
  { name: 'tablet-landscape', size: '1180x820', width: 1180, height: 820 },
  { name: 'tablet-portrait', size: '820x1180', width: 820, height: 1180 },
  { name: 'desktop-fhd', size: '1920x1080', width: 1920, height: 1080 },
]

const states = [
  { id: 'monitoring-ops', path: '/monitoring?mode=ops', wait: '.dashboard-root' },
  { id: 'monitoring-ground', path: '/monitoring?mode=ground', wait: '.dashboard-root' },
  { id: 'main-map-none', path: '/', wait: '.map-shell' },
]

const monitoringActions = [
  { id: 'monitoring-settings-modal', path: '/monitoring?mode=ops', wait: '.alert-settings-modal', action: 'settings' },
]

const panelClicks = [
  { id: 'main-map-aviation-panel', sidebarIndex: 0, wait: '.layer-drawer' },
  { id: 'main-map-met-panel', sidebarIndex: 1, wait: '.layer-drawer' },
  { id: 'main-map-route-panel', sidebarIndex: 4, wait: '.route-check-panel' },
]

const log = []

async function collect(page, viewport, state, fileName) {
  const file = new URL(fileName, OUT_DIR)
  await page.screenshot({ path: fileURLToPath(file), fullPage: false })
  const metrics = await page.evaluate(() => {
    const selectors = [
      '.dashboard-root',
      '.left-panel-body',
      '.right-panel-top',
      '.map-panel-wrap',
      '.monitoring-mapbox-panel',
      '.alert-settings-modal',
      '.sidebar',
      '.map-shell',
      '.map-view-wrapper',
      '.layer-drawer',
      '.route-check-panel',
      '.mapboxgl-ctrl-group',
    ]
    const boxes = Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector)
      if (!element) return [selector, null]
      const rect = element.getBoundingClientRect()
      return [selector, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }]
    }))
    return {
      innerWidth,
      innerHeight,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollHeight: document.body.scrollHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      boxes,
    }
  })
  log.push({ viewport: viewport.size, state, screenshot: fileName, metrics })
  console.log(`${viewport.size} ${state} ${file.pathname}`)
}

async function gotoAndWait(page, path, waitSelector) {
  await page.goto(`${APP_URL}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(waitSelector, { timeout: 20_000 })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
}

async function clickSidebarPanel(page, index, waitSelector) {
  await page.locator('.sidebar-menu-list .sidebar-icon-button').nth(index).click({ timeout: 10_000 })
  await page.locator(waitSelector).waitFor({ timeout: 10_000 })
  await page.waitForTimeout(300)
}

async function openMonitoringAction(page, action) {
  if (action === 'settings') {
    await page.locator('.settings-icon-btn').first().click({ timeout: 10_000 })
    await page.locator('.alert-settings-modal').waitFor({ timeout: 10_000 })
    await page.waitForTimeout(300)
  }
}

await mkdir(OUT_DIR, { recursive: true })
await mkdir(REVIEW_DIR, { recursive: true })

const browser = await chromium.launch()
try {
  for (const viewport of viewports) {
    for (const state of states) {
      const page = await browser.newPage({ viewport })
      await gotoAndWait(page, state.path, state.wait)
      await collect(page, viewport, state.id, `${viewport.name}-${state.id}.png`)
      await page.close()
    }

    for (const action of monitoringActions) {
      const page = await browser.newPage({ viewport })
      await gotoAndWait(page, action.path, '.dashboard-root')
      await openMonitoringAction(page, action.action)
      await collect(page, viewport, action.id, `${viewport.name}-${action.id}.png`)
      await page.close()
    }

    const page = await browser.newPage({ viewport })
    await gotoAndWait(page, '/', '.map-shell')
    for (const panel of panelClicks) {
      await clickSidebarPanel(page, panel.sidebarIndex, panel.wait)
      await collect(page, viewport, panel.id, `${viewport.name}-${panel.id}.png`)
    }
    await page.close()
  }
} finally {
  await browser.close()
}

await writeFile(new URL('capture-log.json', REVIEW_DIR), `${JSON.stringify(log, null, 2)}\n`, 'utf8')
```

- [x] **Step 3: Run tablet capture**

Run:

```powershell
node artifacts\responsive-screenshots\tablet-surface-review\<timestamp>\capture-tablet-surface-review.mjs
```

Expected:

- PNG files for tablet landscape and portrait monitoring/main-map states.
- `review/capture-log.json` exists.
- Tablet settings modal screenshots and the `1920x1080` desktop monitoring comparator exist.

- [x] **Step 4: Write tablet evidence README**

Create `README.md` in the timestamped folder with:

```md
# Tablet Surface Review

- Capture time: <timestamp> KST
- Branch: codex/responsive-layout-system
- App URL: http://127.0.0.1:5173
- Viewports: 1180x820, 820x1180
- Purpose: compare tablet map-plus-information coexistence before tablet implementation changes.
- Capture command: node artifacts\responsive-screenshots\tablet-surface-review\<timestamp>\capture-tablet-surface-review.mjs
- Limitations: map tiles are assumed to render in real user environments; if a screenshot is blank/dark, verify live browser behavior before treating it as layout evidence.
- Issue report: review/issues.md
```

- [x] **Step 5: Write tablet issues report**

Create `review/issues.md` with a table:

```md
# Tablet Surface Review Issues

| Severity | Viewport | State | Screenshot | Problem | Proposal direction | Status |
| --- | --- | --- | --- | --- | --- | --- |
| P2 | 1180x820 | monitoring ops | `../tablet-landscape-monitoring-ops.png` | Verify whether map and weather can be read together without slowing first status recognition. | Keep coexistence if both remain operationally useful. | needs human review |
| P2 | 820x1180 | monitoring ops | `../tablet-portrait-monitoring-ops.png` | Verify whether the map becomes too narrow or status content needs too much scrolling. | Consider compact status panel or soft mode split only if needed. | needs human review |
| P2 | 820x1180 | monitoring settings modal | `../tablet-portrait-monitoring-settings-modal.png` | Verify settings remains reachable without adopting phone task tabs on tablet. | Keep desktop/tablet modal behavior unless evidence proves it blocks operation. | needs human review |
| P3 | 1920x1080 | monitoring ops | `../desktop-fhd-monitoring-ops.png` | Use as a desktop comparator so tablet narrowing is not mistaken for a global regression. | Preserve desktop dashboard behavior. | reference |
```

- [x] **Step 6: Pause for human review**

Do not implement tablet structural changes until the user reviews this tablet evidence.

---

## Task 3: Phone Monitoring Task Tabs Prototype

**Files:**
- Modify: `frontend/src/features/monitoring/MonitoringPage.jsx`
- Modify: `frontend/src/features/monitoring/legacy/App.css`
- Test: `frontend/src/app/layout/layoutTokens.test.js` only if adding a documented responsive policy selector

Purpose:

- On phone-sized viewports only, prototype `기상정보 / 지도 / 설정`.
- Do not apply this model to tablet yet.
- Important layout constraint: `.dashboard-root` is a CSS Grid whose existing direct children have explicit grid positions. Do not add `.phone-task-tabs` as an unpositioned direct child of `.dashboard-root`.

- [x] **Step 1: Confirm implementation approval**

Ask the user to confirm:

```text
Phone Monitoring task tabs를 구현해도 될까요? 적용 범위는 phone viewport only이며, tablet은 Task 2 evidence 검토 전까지 변경하지 않습니다.
```

Expected:

- User explicitly approves before code changes.

- [x] **Step 2: Add phone task state**

In `MonitoringPage.jsx`, add state near existing monitoring UI state:

```jsx
const [phoneTask, setPhoneTask] = useState('weather')
```

Use task ids:

```js
weather
map
settings
```

- [x] **Step 3: Render phone task tabs inside the existing header area**

Inside the existing `.left-panel-header`, render the phone-only task nav before the `Header` component. Do not insert it as a direct grid child before `.left-panel-header`.

Use plain buttons instead of partial `role="tablist"` semantics unless the implementation also adds the full ARIA tab pattern. Wrap the existing `Header` in a child such as `.monitoring-header-controls` so phone map/settings modes can hide the airport controls without hiding the task navigation.

```jsx
<div className="left-panel-header">
  <div className="phone-task-tabs" aria-label="모바일 보기">
    <button
      type="button"
      className={`phone-task-tab ${phoneTask === 'weather' ? 'active' : ''}`}
      onClick={() => setPhoneTask('weather')}
    >
      기상정보
    </button>
    <button
      type="button"
      className={`phone-task-tab ${phoneTask === 'map' ? 'active' : ''}`}
      onClick={() => setPhoneTask('map')}
    >
      지도
    </button>
    <button
      type="button"
      className={`phone-task-tab ${phoneTask === 'settings' ? 'active' : ''}`}
      onClick={() => setPhoneTask('settings')}
    >
      설정
    </button>
  </div>
  <div className="monitoring-header-controls">
    <Header
      airports={airportOptions}
      selectedAirport={selectedAirport}
      onAirportChange={setSelectedAirport}
      airportLabel={airportLabel}
    />
  </div>
  <div className="phone-settings-task">
    <button
      className="settings-icon-btn phone-settings-open"
      onClick={() => setShowSettings(true)}
      title="설정"
      aria-label="설정"
    >
      설정 열기
    </button>
  </div>
</div>
```

Expected:

- `.phone-task-tabs` stays inside grid column 1, row 1 because it is inside `.left-panel-header`.
- `.left-panel-header` stays visible for every phone task so users can switch back from map/settings mode.
- `.phone-settings-task` stays inside `.left-panel-header`, under the task tabs, and is only displayed for the settings task.
- No grid auto-placement is introduced.

- [x] **Step 4: Add task classes to dashboard root**

Change:

```jsx
<div className="dashboard-root" data-dashboard-mode={dashboardMode}>
```

to:

```jsx
<div className="dashboard-root" data-dashboard-mode={dashboardMode} data-phone-task={phoneTask}>
```

- [x] **Step 5: Move settings task behavior**

Keep the existing settings modal for desktop/tablet. For phone task prototype:

- The `설정` tab may show a phone settings entry surface that opens the existing modal.
- This is an explicit first-iteration compromise. It is visually a tab, but it opens a modal because embedding the full settings view is outside this task.
- Record this as deferred follow-up in the capture issue report: replace modal behavior with an inline phone settings view if the tab/modal mismatch feels awkward in review.
- Do not rewrite settings internals in this task.

Minimal JSX inside `.left-panel-header` for phone settings task, under `.phone-task-tabs` and after `.monitoring-header-controls`:

```jsx
<div className="phone-settings-task">
  <button
    className="settings-icon-btn phone-settings-open"
    onClick={() => setShowSettings(true)}
    title="설정"
    aria-label="설정"
  >
    설정 열기
  </button>
</div>
```

- [x] **Step 6: Add phone-only CSS**

In `legacy/App.css`, add phone-only rules under the existing responsive section:

```css
.phone-task-tabs,
.phone-settings-task {
  display: none;
}

@media (max-width: 719px) {
  .left-panel-header .phone-task-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    padding: 0;
  }

  .phone-task-tab {
    min-height: 44px;
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-radius: 8px;
    background: #ffffff;
    color: #1f2937;
    font-weight: 700;
  }

  .phone-task-tab.active {
    background: #111827;
    color: #ffffff;
  }

  .dashboard-root[data-phone-task="weather"] .map-panel-wrap,
  .dashboard-root[data-phone-task="weather"] .right-panel-top {
    display: none;
  }

  .dashboard-root[data-phone-task="map"] .monitoring-header-controls,
  .dashboard-root[data-phone-task="map"] .phone-settings-task,
  .dashboard-root[data-phone-task="map"] .left-panel-body {
    display: none;
  }

  .dashboard-root[data-phone-task="settings"] .left-panel-body,
  .dashboard-root[data-phone-task="settings"] .map-panel-wrap {
    display: none;
  }

  .dashboard-root[data-phone-task="settings"] .right-panel-top {
    display: none;
  }

  .dashboard-root[data-phone-task="settings"] .monitoring-header-controls {
    display: none;
  }

  .dashboard-root[data-phone-task="settings"] .left-panel-header .phone-settings-task {
    display: block;
    padding: 12px;
  }
}
```

Adjust selectors only if existing CSS structure requires it. Keep tablet breakpoints untouched. Do not add new unpositioned direct children to `.dashboard-root`, and do not hide `.left-panel-header` in phone task modes because it contains the task navigation.

- [x] **Step 7: Run layout test**

Run:

```powershell
npm.cmd run test:layout --prefix frontend
```

Expected:

- PASS.

- [x] **Step 8: Capture phone monitoring task tabs**

Create a capture pass under:

```text
artifacts/responsive-screenshots/phone-monitoring-task-tabs/<timestamp>/
```

Capture:

- `390x844` weather task
- `390x844` map task
- `390x844` settings task
- `390x844` settings task with the existing settings modal opened from the phone settings entry
- `820x1180` monitoring ops unchanged tablet portrait sanity check
- `820x1180` monitoring settings modal unchanged tablet portrait sanity check

Expected:

- Phone task tabs visible only at phone viewport.
- Tablet portrait does not accidentally switch to phone task-tab layout.

- [x] **Step 9: Run build and responsive smoke**

Run:

```powershell
npm.cmd run build --prefix frontend
npm.cmd run smoke:responsive --prefix frontend
```

Expected:

- PASS.
- No horizontal overflow failure.

- [ ] **Step 10: Commit**

If approved and verified:

```powershell
git add frontend/src/features/monitoring/MonitoringPage.jsx frontend/src/features/monitoring/legacy/App.css
git commit -m "feat: add phone monitoring task tabs"
```

---

## Task 4: Airport Panel Phone Horizontal Top Tabs Prototype

**Files:**
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`
- Test: none unless adding layout token assertions

Purpose:

- On phone-sized viewports, turn the current side tab rail into a horizontal top tab row.
- Keep desktop and tablet behavior unless evidence supports broader changes.
- Implementation must modify the existing `@media (max-width: 719px)` block in `AirportPanel.css`. That block already contains `.airport-panel-tabs { width: 72px; }` and `.airport-panel-tab` phone rules. Do not add a second competing phone media block for the same selectors.

- [x] **Step 1: Confirm implementation approval**

Ask:

```text
Airport Panel phone horizontal top tabs prototype을 구현해도 될까요? 적용 범위는 phone viewport only입니다.
```

Expected:

- User explicitly approves before code changes.

- [x] **Step 2: Modify the existing phone-only tab layout CSS**

In `AirportPanel.css`, find the existing `@media (max-width: 719px)` block near the bottom of the file. Replace the current phone tab rail rules:

```css
.airport-panel-tabs {
  width: 72px;
}

.airport-panel-tab {
  padding: 13px 2px;
  font-size: 12px;
}
```

with the horizontal tab rules below. Paste these declarations inside the existing phone media block; do not copy a second `@media (max-width: 719px)` wrapper.

```css
.airport-panel-main {
  flex-direction: column;
  min-height: 0;
}

.airport-panel-tabs {
  width: 100%;
  flex-direction: row;
  overflow-x: auto;
  border-right: 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.28);
}

.airport-panel-tab {
  flex: 0 0 auto;
  min-width: 72px;
  min-height: 44px;
  padding: 0 12px;
  justify-content: center;
  white-space: nowrap;
}

.airport-panel-body {
  min-width: 0;
  overflow-x: hidden;
}
```

Do not create a duplicate `@media (max-width: 719px)` block for these same selectors unless the existing block has been removed or consolidated.

- [x] **Step 3: Add compact phone header only if needed by capture**

Do not remove the airport photo by default. If the phone recapture shows first-read METAR is still pushed too low, measure the actual header bounds from the screenshot/capture log first. If a cap is needed and image cropping is acceptable for this prototype, add:

```css
@media (max-width: 719px) {
  .airport-panel-head {
    max-height: 112px;
    overflow: hidden;
  }
}
```

Do not claim the header consumes 45 percent unless measuring it from the actual screenshot bounds. If `max-height` would clip important airport identity content, record that as a follow-up decision instead of forcing the cap.

- [x] **Step 4: Capture Airport Panel phone states**

Capture under:

```text
artifacts/responsive-screenshots/airport-phone-tabs/<timestamp>/
```

Required states at `390x844`:

- METAR
- TAF timeline
- TAF table
- TAF grid
- AMOS
- warning
- airport info

Also capture `820x1180` tablet portrait METAR as a sanity check.

- [x] **Step 5: Review against visual reference**

Open:

```text
docs/archive/development/specs/2026-05-17-responsive-surface-strategy-proposal-ko-v2.html
```

Check:

- horizontal tabs are easier to tap than side tabs
- METAR core values remain visible quickly
- TAF table does not reintroduce clipping
- page-level horizontal scroll remains absent
- the implementation visually follows the v2 `Airport Panel — 헤더 축소 + 수평 탭 전환` proposal more closely than the simplified supporting reference

- [x] **Step 6: Run build and smoke**

Run:

```powershell
npm.cmd run build --prefix frontend
npm.cmd run smoke:responsive --prefix frontend
```

Expected:

- PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/airport-panel/AirportPanel.css
git commit -m "refactor: add phone airport panel top tabs"
```

---

## Task 5: Route Briefing Split Layout Architecture Review

**Files:**
- Read only: `frontend/src/features/map/MapView.jsx`
- Read only: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Read only: `frontend/src/features/route-briefing/RouteBriefing.css`
- Create: `artifacts/responsive-screenshots/route-briefing-split-architecture/<timestamp>/review/issues.md`
- Optional create: `docs/archive/development/plans/<future-route-briefing-map-slot-plan>.md` only if the user asks for a follow-up implementation plan

Purpose:

- Preserve the Claude v2 Route Briefing split idea as a product direction, but do not implement a fake map.
- Verify and document the current architecture blocker: Mapbox is owned by `MapView.jsx` as a single map instance, while `RouteBriefingPanel.jsx` is only a panel UI.
- Decide whether a real split map/context slot needs a separate architecture task.

- [x] **Step 1: Confirm review scope**

No production implementation is expected in this task. Ask only if the user wants this architecture review skipped:

```text
Route Briefing split layout은 fake map으로 구현하지 않고, 현재 세션에서는 Mapbox 소유권/구성 검토와 별도 구현 계획 필요 여부만 문서화하겠습니다.
```

Expected:

- Continue unless the user explicitly asks to implement anyway.

- [x] **Step 2: Verify Mapbox ownership**

Read `frontend/src/features/map/MapView.jsx` and confirm:

- `mapContainerRef` is defined in `MapView.jsx`.
- `mapRef` is defined in `MapView.jsx`.
- `new mapboxgl.Map(...)` is created in `MapView.jsx`.
- `RouteBriefingPanel` is rendered from `MapView.jsx` and does not own the map instance.

Record exact line references in the issue report.

- [x] **Step 3: Verify RouteBriefingPanel boundaries**

Read `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` and confirm:

- The component renders the route form/result UI.
- It does not receive `mapRef`, `map`, or a map container slot.
- Adding a second live Mapbox map inside this component would be a new architecture decision, not a local CSS tweak.

Record exact line references in the issue report.

- [x] **Step 4: Write architecture issue report**

Create:

```text
artifacts/responsive-screenshots/route-briefing-split-architecture/<timestamp>/review/issues.md
```

Use this structure:

```md
# Route Briefing Split Architecture Review

## Product idea

Claude v2 proposes `Route Briefing — 미니맵 썸네일 → split 레이아웃`. The idea is accepted as worth exploring.

## Current blocker

Mapbox is owned by `frontend/src/features/map/MapView.jsx`. `RouteBriefingPanel.jsx` does not own or receive a live map instance. A fake map placeholder must not be shipped.

## Evidence

- `MapView.jsx:<line>`: `mapContainerRef`
- `MapView.jsx:<line>`: `mapRef`
- `MapView.jsx:<line>`: `new mapboxgl.Map(...)`
- `MapView.jsx:<line>`: `<RouteBriefingPanel ... />`
- `RouteBriefingPanel.jsx:<line>`: panel renders form UI only

## Recommendation

Create a separate route-map-context architecture task if the split idea is approved. Candidate approaches:

1. Parent-owned map slot: `MapView.jsx` renders a responsive route context slot while keeping single Mapbox ownership.
2. Map viewport mode: route panel stays form-focused, with a clear `지도 전체화면` mode that highlights route preview on the main map.
3. Static preview fallback: use route preview geometry snapshot only if live map context is not required.

## Deferred

No production `RouteBriefingPanel.jsx` or `RouteBriefing.css` changes in this task.
```

- [x] **Step 5: Do not implement fake split UI**

Do not add placeholder markup such as:

```jsx
<div className="route-check-mobile-map-context">지도 맥락</div>
```

Expected:

- No production source changes for Route Briefing in this task.

- [ ] **Step 6: Optional follow-up plan**

If the user wants to pursue the split idea, write a separate plan for route map-context architecture after this review. Do not fold it into the phone Monitoring or Airport Panel work.

---

## Task 6: Final Cross-Surface Review

**Files:**
- Modify: `artifacts/responsive-screenshots/<phase>/<timestamp>/review/issues.md`
- Optional modify: `docs/archive/development/specs/2026-05-17-responsive-surface-strategy-proposal-ko.md`
- Optional modify: `docs/ui-responsive-guidelines.md` only if a rule is accepted as product direction

- [x] **Step 1: Run all required verification**

Run:

```powershell
npm.cmd run test:layout --prefix frontend
npm.cmd run build --prefix frontend
npm.cmd run smoke:responsive --prefix frontend
```

Expected:

- PASS for all.

- [x] **Step 2: Confirm screenshot coverage**

Confirm screenshots exist for:

- Phone Monitoring task tabs
- Tablet Monitoring landscape and portrait
- Airport Panel phone top tabs
- Airport Panel tablet sanity check
- Route Briefing split architecture review report

- [x] **Step 3: Review for unintended tablet regressions**

Open tablet screenshots and compare against the visual reference.

Expected:

- Phone-specific task tabs do not appear on tablet.
- Airport phone tabs do not degrade tablet drawer unless intentionally approved.
- Route Briefing production files remain unchanged unless a separate route map-context architecture plan was approved.

- [x] **Step 4: Update proposal status**

If implementation decisions were accepted, update `docs/archive/development/specs/2026-05-17-responsive-surface-strategy-proposal-ko.md` with a short "Accepted / Deferred / Rejected" status section.

Do not rewrite the whole proposal.

- [x] **Step 5: Final git status**

Run:

```powershell
git status --short --branch
```

Expected:

- Only intentional source/doc/artifact changes are present.
- Existing unrelated dirty/untracked files remain untouched.

---

## Open Questions Before Full Implementation

These are intentionally not answered by the plan:

1. Should tablet landscape and tablet portrait receive different layouts?
2. Should Airport phone top tabs replace or coexist with full-screen step flow long term?
3. Should Route Briefing split layout become real live-map composition or remain a design experiment?
4. Should settings become a full phone task, or remain a modal triggered from a task tab?
5. Which summary values are mandatory in the first screen for airport and monitoring?

## Completion Criteria

This plan is complete when:

- Phone and tablet are no longer treated as one generic mobile target.
- Tablet evidence exists before tablet structural changes.
- Phone Monitoring task tabs are implemented only if approved and verified.
- Airport phone horizontal top tabs are implemented only if approved and verified.
- Route Briefing split is documented as an architecture follow-up, with no fake map placeholder shipped.
- `npm.cmd run test:layout --prefix frontend`, `npm.cmd run build --prefix frontend`, and `npm.cmd run smoke:responsive --prefix frontend` pass.
- Screenshot review artifacts document fixed, deferred, or rejected findings.
