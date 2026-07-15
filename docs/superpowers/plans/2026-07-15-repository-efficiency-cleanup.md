# Repository Efficiency Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ProjectAMO의 현재 동작을 보존하면서 신뢰 가능한 검증 진입점을 만들고, 죽은 코드·복제 모듈·중복 의존성·낡은 실행 경로·잘못 배치된 작업 문서를 최소 변경으로 정리한다.

**Architecture:** 먼저 backend test가 자연 종료하는 안전망과 root `check`를 만든다. 그 뒤 서로 독립적인 삭제·shared 통합·워크플로 정리를 각각 한 커밋 단위로 수행한다. 새 abstraction은 만들지 않으며, 이미 존재하는 shared module과 managed dev launcher를 직접 재사용한다.

**Tech Stack:** Node.js, Express, React, Vite, Node test runner, Playwright capture scripts, npm lockfiles, GitHub Actions, PowerShell, Bash.

**Source Audit:** `docs/research/2026-07-15-repository-efficiency-audit.md`

## Global Constraints

- 이 계획의 재검토 기준은 `main`의 `baf1b1b`이며, 실행 시 Task 0이 branch·HEAD·dirty ownership을 다시 확인한다. 이후 commit이 plan-owned 파일을 건드렸다면 해당 Task를 재검토하기 전까지 실행하지 않는다.
- `backend/src/briefing/briefing-composer.js`, `backend/src/briefing/confidence.js`, `recommendProcedures.js`, `briefingViewModel.js`는 `baf1b1b`에 포함된 정식 코드다. 이 계획에서는 동작 보존 대상으로 두며, dirty WIP라는 이유로 제외하지 않는다.
- 현재 pre-existing WIP는 `AGENTS.md`, `claude.md`, root `package-lock.json`, agent-routing/audit-plan 파일에 한정된다. Task 0에서 다시 읽은 `git status`가 이 목록보다 우선한다.
- 모든 수동 편집은 `apply_patch`를 사용한다. UTF-8 문서를 PowerShell `Set-Content`, `Out-File`, `>`로 덮어쓰지 않는다.
- 각 Task는 지정 파일만 stage하고 독립 커밋으로 끝낸다. 이전 Task의 unrelated diff를 함께 stage하지 않는다.
- frontend UI 동작이 바뀌는 Task는 `docs/dev-server-and-capture.md`를 먼저 읽고 Playwright evidence를 남긴다.
- `MapView.jsx`는 수정하지 않는다. 새 module, wrapper, dependency, capture framework를 추가하지 않는다.
- root `package-lock.json`은 현재 다른 작업으로 dirty다. Task 6은 해당 작업의 owner가 handoff하기 전까지 실행 금지다.
- `frontend/public/airport_weather/RKPC/`, JS theme token mirror, interactive airport-panel prototype, `overseas-weather-noaa.md`, SIGMET/AIRMET processor, Haversine helper는 아래 “Deferred Decisions”에 남기고 core Task에서 수정하지 않는다.
- 계획 실행에는 기존 `docs/superpowers/status/repo-efficiency-audit.status.md`를 이어 사용하고, 각 Task 완료 시 Resume Point만 갱신한다.

## File Ownership Map

| Work unit | Owns | Must preserve |
| --- | --- | --- |
| Backend natural-exit gate | `backend/src/auth/session.js`, five session test servers, `backend/package.json` | production SQLite session behavior |
| Local check | root/frontend script entries | naturally terminating backend tests and existing Vite build |
| Runtime pin (deferred) | `.node-version`, root `engines.node` | exact deployment Node version verified on the VM |
| CI gate (deferred) | `.github/workflows/check.yml` | `.node-version` and root `npm run check` |
| Dead frontend deletion | airport-panel warning model, orphan route fields/helpers, related tests/CSS/docs | `buildCurrentWarningModel`, `getLastUsed(s)`, `formatBriefingTime`, ETA helpers, `recommendProcedures.js` and its test, `briefingViewModel.js` and its test |
| Weather consolidation | monitoring legacy imports and exact duplicate weather modules/assets | monitoring page components, shared weather renderer/assets, every route-briefing module |
| Managed dev path | two BAT files, dev launcher shutdown branch, dev capture guide | existing `withServers` readiness/cleanup behavior |
| Dependency ownership | root `package.json`, root lockfile | frontend/backend manifests and lockfiles, Turf preprocessing dependencies |
| Evidence/deploy workflow | responsive/mobile scripts, deploy scripts, operations docs | partial capture evidence, fast-deploy contract |
| Repository placement | completed status, research doc, root status, route-import fixtures, completed design plan | active plans, interactive prototype, live reference data |

## Deferred Decisions — Not Authorized by This Plan

1. **RKPC public assets:** delete only after explicit user confirmation or at least 30 representative days of access logs show zero successful `/airport_weather/RKPC/*` requests.
2. **JS theme tokens:** delete only after approving `tokens.css` as the sole canonical source and updating the design constitution.
3. **Airport-panel prototype:** keep in `frontend/public` until the user chooses interactive prototype versus static reference.
4. **`overseas-weather-noaa.md`:** keep active until the user decides whether its GFS/AIRMET next track is backlog or current work.
5. **P3 duplication:** defer SIGMET/AIRMET processor and Haversine consolidation until those modules receive a real feature change.
6. **Briefing charts and `reference/html`:** explicitly preserve; both have intentional live/reference roles.

## VM-Free Execution Order — Execute Now

After Task 0, execute in this order:

1. **Task 2a** — backend test natural-exit crash fix
2. **Task 3a** — local `npm test` / `npm run check`
3. **Tasks 4 → 5 → 7** — dead-code deletion, shared weather consolidation, managed dev path
4. **Tasks 8 → 9 → 10** — evidence scripts, deterministic deploy scripts, repository placement
5. **Task 11a** — integrated VM-free verification checkpoint

Tasks 5, 7, 8, and 10 have independent edit ownership, but their local-server/Playwright verification must run serially in the main session.

The later **Blocked / Deferred** section owns Task 1, Task 2b, Task 3b, and Task 6. Do not let missing VM access or the dirty root lockfile block the VM-free sequence above.

---

### Task 0: Preflight, Baseline, and Execution Status

**Files:**
- Modify: `docs/superpowers/status/repo-efficiency-audit.status.md`
- Read only: `docs/research/2026-07-15-repository-efficiency-audit.md`
- Read only: `docs/dev-server-and-capture.md`

**Interfaces:**
- Consumes: completed audit findings and current dirty-work ownership.
- Produces: an uncontaminated baseline and cross-session Resume Point.

- [ ] **Step 1: Confirm the reviewed main baseline, then dirty ownership**

Run from repository root:

```powershell
if ((git branch --show-current) -ne 'main') { throw 'Expected main branch' }
git merge-base --is-ancestor baf1b1b HEAD
if ($LASTEXITCODE -ne 0) { throw 'baf1b1b is not an ancestor of HEAD' }
git log --oneline baf1b1b..HEAD
git diff --name-only baf1b1b..HEAD
git status --short
git diff --name-only
git diff --cached --name-only
```

Expected: execution is on `main` and includes reviewed baseline `baf1b1b`. If newer commits exist, inspect their file list; any overlap with a Task’s ownership requires that Task’s caller/dependency check to be rerun. Existing user/Claude changes may remain, but no Task starts while one of its owned files has unrelated modifications.

- [ ] **Step 2: Record current runtime and frontend baseline**

```powershell
node --version
Push-Location frontend
node --test
Pop-Location
```

Expected: runtime version is recorded; frontend reports 358 tests passing and exit 0. If test count has legitimately changed, record the new count rather than editing expectations silently.

- [ ] **Step 3: Turn the audit status into the execution handoff**

Using `apply_patch`, add the plan path, set Resume Point to `Task 2a Step 1`, record the actual KST update time and frontend baseline result, and list only real dirty-work overlaps under `Deviations from Plan`. Record Task 1, Task 2b, and Task 3b as VM-deferred, plus Task 6 as lockfile-owner-blocked. Omit `Deviations from Plan` when there is no overlap.

Expected: `docs/superpowers/status/repo-efficiency-audit.status.md` remains under one page and contains only actual execution values.

---

### Task 2a: Make Backend Tests Terminate Naturally — VM-Free, Execute First

**Files:**
- Modify: `backend/src/auth/session.js:22-38`
- Modify: `backend/test/auth.test.js:1-16`
- Modify: `backend/test/requests-flow.test.js:1-22`
- Modify: `backend/test/admin.test.js:1-20`
- Modify: `backend/test/me-minima.test.js:1-18`
- Modify: `backend/test/me-routes.test.js:1-18`
- Modify: `backend/package.json:6-10`

**Interfaces:**
- Consumes: Task 0 baseline only; no VM or Node pin.
- Produces: `sessionMiddleware({ db, secret, store })`, production SQLite store by default, MemoryStore injection for five test servers, naturally terminating backend test command.

- [ ] **Step 1: Run the current backend test command and capture RED**

```powershell
npm.cmd --prefix backend test
```

Expected before the change: nonzero exit; on the known Node 24 environment it may emit `UV_HANDLE_CLOSING`. If it unexpectedly exits 0 naturally, record that evidence and still apply MemoryStore isolation plus forced-exit removal because the SQLite cleanup interval remains an invalid test-server dependency.

- [ ] **Step 2: Allow the existing session seam to accept a store adapter**

Replace the current `sessionMiddleware` function with:

```js
export function sessionMiddleware({
  db = getDb(),
  secret = resolveSecret(),
  store = new SqliteStore({
    client: db,
    expired: { clear: true, intervalMs: 15 * 60 * 1000 },
  }),
} = {}) {
  return session({
    store,
    name: 'amo.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: IDLE_TTL_MS,
    },
  })
}
```

Production caller `backend/server.js:80` remains `app.use(sessionMiddleware())`.

- [ ] **Step 3: Inject Node’s existing express-session MemoryStore in both test servers**

In `backend/test/auth.test.js`, `requests-flow.test.js`, `admin.test.js`, `me-minima.test.js`, and `me-routes.test.js`, add:

```js
import session from 'express-session'
```

Replace each of the five test-server middleware calls with:

```js
app.use(sessionMiddleware({
  db,
  secret: 'test-secret-000000000000000000000000000000',
  store: new session.MemoryStore(),
}))
```

- [ ] **Step 4: Remove forced process termination**

Change `backend/package.json`:

```json
"test": "node --test"
```

- [ ] **Step 5: Run focused and full GREEN checks on the current local runtime**

```powershell
node --version
node --test backend/test/auth.test.js backend/test/requests-flow.test.js backend/test/admin.test.js backend/test/me-minima.test.js backend/test/me-routes.test.js
npm.cmd --prefix backend test
```

Expected: record the local Node version; both test commands exit 0 without `--test-force-exit`, libuv assertion, or lingering process. This proves the crash fix locally, not deployment-runtime reproducibility.

- [ ] **Step 6: Commit only this natural-exit fix**

```powershell
git add backend/package.json backend/src/auth/session.js backend/test/auth.test.js backend/test/requests-flow.test.js backend/test/admin.test.js backend/test/me-minima.test.js backend/test/me-routes.test.js
git commit -m "test: make backend suite terminate naturally"
```

---

### Task 3a: Add One Local Check Command — VM-Free

**Files:**
- Modify: `frontend/package.json:6-14`
- Modify: `package.json:6-15`

**Interfaces:**
- Consumes: naturally terminating backend tests from Task 2a.
- Produces: local `npm test` and `npm run check`; no CI workflow yet.

- [ ] **Step 1: Capture the missing-command RED**

```powershell
npm.cmd run check
```

Expected before the change: missing script, nonzero exit.

- [ ] **Step 2: Expose frontend’s native Node discovery**

Add to `frontend/package.json` scripts:

```json
"test": "node --test"
```

- [ ] **Step 3: Add root aggregation without another runner**

Add to root `package.json` scripts:

```json
"test": "npm --prefix backend test && npm --prefix frontend test",
"check": "npm test && npm run build"
```

- [ ] **Step 4: Verify the local interface GREEN**

```powershell
npm.cmd --prefix frontend test
npm.cmd run check
```

Expected: frontend tests have zero failures; backend tests exit naturally; Vite build succeeds; root exits 0.

- [ ] **Step 5: Commit the local gate**

```powershell
git add package.json frontend/package.json
git commit -m "test: add repository check command"
```

---

### Task 4: Delete Dead Frontend Surfaces Without Removing Live Helpers

**Files:**
- Delete: `frontend/src/features/airport-panel/tabs/WarningTab.jsx`
- Delete: `frontend/src/features/route-briefing/AircraftProfileField.jsx`
- Delete: `frontend/src/features/route-briefing/EtdField.jsx`
- Delete: `shared/weather-icons.js`
- Modify: `frontend/src/features/airport-panel/AirportPanel.css:1240-1288`
- Modify: `frontend/src/features/airport-panel/WarningCarousel.jsx`
- Modify/Test: `frontend/src/features/airport-panel/lib/currentWeatherViewModel.js`
- Modify/Test: `frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js`
- Modify/Test: `frontend/src/features/route-briefing/lib/aircraftProfiles.js`
- Modify/Test: `frontend/src/features/route-briefing/lib/aircraftProfiles.test.js`
- Modify/Test: `frontend/src/features/route-briefing/lib/briefingTime.js`
- Modify/Test: `frontend/src/features/route-briefing/lib/briefingTime.test.js`
- Preserve/Test: `frontend/src/features/route-briefing/lib/recommendProcedures.js`
- Preserve/Test: `frontend/src/features/route-briefing/lib/recommendProcedures.test.js`
- Preserve/Test: `frontend/src/features/route-briefing/lib/briefingViewModel.js`
- Preserve/Test: `frontend/src/features/route-briefing/lib/briefingViewModel.test.js`
- Modify: `Architecture.md`

**Interfaces:**
- Consumes: current warning carousel and route briefing state.
- Produces: unchanged live exports `buildCurrentWarningModel`, `getLastUsed(s)`, `formatBriefingTime`; preserves the committed recommendation/view-model modules; removes only orphan UI and compact/test-only API.

- [ ] **Step 1: Run the focused baseline**

```powershell
node --test frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js frontend/src/features/route-briefing/lib/aircraftProfiles.test.js frontend/src/features/route-briefing/lib/briefingTime.test.js frontend/src/features/route-briefing/lib/recommendProcedures.test.js frontend/src/features/route-briefing/lib/briefingViewModel.test.js
```

Expected: exit 0.

- [ ] **Step 2: Shrink the current-weather model to the live warning interface**

In `currentWeatherViewModel.js`:

- keep only `import { fmtKstShort } from './formatters.js'`;
- keep `WARNING_NAME_KO`, `pickWarningName`, and `buildCurrentWarningModel`;
- delete `buildMetarViewModel`/TAF imports, `HOUR_MS`, `formatCompactWind`, `formatRvrSummary`, `buildCompactMetarModel`, and `buildCompactTafModel`.

In its test:

```js
import { buildCurrentWarningModel } from './currentWeatherViewModel.js'
```

Keep the first three warning-model tests and delete the compact/RVR tests from the current line 51 onward.

- [ ] **Step 3: Shrink aircraft profiles to the live last-used read**

Keep `LAST_KEY`, storage/read helpers, and:

```js
export function getLastUsed(s) {
  return readJson(s, LAST_KEY, null)
}
```

Delete `PROFILES_KEY`, `listProfiles`, `saveProfile`, `deleteProfile`, and `setLastUsed`. Replace its test body with three assertions: empty storage returns `null`, valid `amo_last_perf` JSON returns the parsed object, invalid JSON returns `null`.

- [ ] **Step 4: Shrink briefing time to the live formatter**

Keep the existing constants, `pad2`, and `formatBriefingTime`. Delete `buildEtdIso` and `etdFields`. Import only `formatBriefingTime` in the test and preserve the existing formatting and invalid-input tests.

- [ ] **Step 5: Delete orphan components, stale style, and stale descriptions**

Delete the four files listed above. Remove the exclusive `.ap-warnings` through `.ap-warning-text` CSS block. Remove `CurrentWeatherTab`/`WarningTab` comments from `WarningCarousel.jsx`.

Update `Architecture.md` by:

- removing stale `CurrentWeatherTab.jsx` and `WarningTab.jsx` entries;
- retaining `WarningCarousel.jsx` as the live warning surface;
- describing `currentWeatherViewModel.js` as warning-carousel model helpers only;
- documenting `recommendProcedures.js` as the injected-I/O IFR procedure recommendation owner while React lifecycle/cancellation remains in `useRouteBriefing.js`;
- documenting `briefingViewModel.js` as the pure briefing display-transform owner;
- revising `useRouteBriefing.js` to state that it delegates IFR procedure selection to `recommendProcedures`.

- [ ] **Step 6: Verify no live symbol was removed**

```powershell
node --test frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js frontend/src/features/route-briefing/lib/aircraftProfiles.test.js frontend/src/features/route-briefing/lib/briefingTime.test.js frontend/src/features/route-briefing/lib/recommendProcedures.test.js frontend/src/features/route-briefing/lib/briefingViewModel.test.js
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
rg -n "WarningTab|AircraftProfileField|EtdField|buildCompactMetarModel|buildCompactTafModel|formatRvrSummary|listProfiles|saveProfile|deleteProfile|setLastUsed" frontend/src Architecture.md
```

Expected: all commands exit 0; the final search returns no source/Architecture matches. Audit/history documents are outside the search scope.

- [ ] **Step 7: Commit the dead-code deletion**

```powershell
git add -A -- Architecture.md shared/weather-icons.js frontend/src/features/airport-panel/tabs/WarningTab.jsx frontend/src/features/airport-panel/AirportPanel.css frontend/src/features/airport-panel/WarningCarousel.jsx frontend/src/features/airport-panel/lib/currentWeatherViewModel.js frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js frontend/src/features/route-briefing/AircraftProfileField.jsx frontend/src/features/route-briefing/EtdField.jsx frontend/src/features/route-briefing/lib/aircraftProfiles.js frontend/src/features/route-briefing/lib/aircraftProfiles.test.js frontend/src/features/route-briefing/lib/briefingTime.js frontend/src/features/route-briefing/lib/briefingTime.test.js
git commit -m "refactor: remove obsolete weather and route UI"
```

---

### Task 5: Consolidate Monitoring Weather Rendering Onto Shared Modules

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/components/TafTimeline.jsx`
- Modify: `frontend/src/features/monitoring/legacy/components/MetarCard.jsx`
- Modify: `frontend/src/features/monitoring/legacy/components/GroundForecastPanel.jsx`
- Modify: `frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx`
- Modify: `frontend/src/features/monitoring/legacy/components/GroundHourlyStrip.jsx`
- Delete: `frontend/src/features/monitoring/legacy/components/WeatherIcon.jsx`
- Delete: `frontend/src/features/monitoring/legacy/utils/weather-visual-resolver.js`
- Delete: `frontend/src/features/monitoring/legacy/utils/weather-icon-registry.js`
- Delete: `frontend/src/features/monitoring/legacy/assets/weather-icons/basmilius/`
- Modify: `Architecture.md`
- Preserve: `frontend/src/shared/ui/WeatherIcon.jsx`
- Preserve: `frontend/src/shared/weather/weather-visual-resolver.js`
- Preserve: `frontend/src/shared/weather/weather-icon-registry.js`

**Interfaces:**
- Consumes: existing shared `WeatherIcon`, `resolveWeatherVisual`, `getWeatherIconSrc`.
- Produces: identical monitoring rendering through one shared implementation; removes about 340 source LOC and 77,393 asset bytes.

- [ ] **Step 1: Capture the monitoring baseline**

Read `docs/dev-server-and-capture.md`, start the documented fixed-data server in the main session, then run:

```powershell
$env:PROJECTAMO_URL='http://127.0.0.1:5173'
$env:PROJECTAMO_CAPTURE_LABEL='before'
node frontend/scripts/monitoring-capture.mjs
```

Expected: exit 0; both ops and ground monitoring screenshots are created and `.dashboard-root` is found.

- [ ] **Step 2: Repoint the five live callers**

Use these exact import targets:

```js
// TafTimeline.jsx and MetarCard.jsx
import WeatherIcon from '../../../../shared/ui/WeatherIcon.jsx'
import { resolveWeatherVisual } from '../../../../shared/weather/weather-visual-resolver.js'

// GroundForecastPanel.jsx and GroundCurrentWeatherCard.jsx
import WeatherIcon from '../../../../shared/ui/WeatherIcon.jsx'

// GroundHourlyStrip.jsx
import { getWeatherIconSrc } from '../../../../shared/weather/weather-icon-registry.js'
```

Preserve all component props and rendering logic.

- [ ] **Step 3: Delete only the exact duplicate legacy implementation**

Delete the three legacy modules and the 32-file `basmilius` directory listed in this Task. Do not delete other `monitoring/legacy` components, CSS, or page wiring.

Update `Architecture.md` so `frontend/src/features/monitoring/legacy/*` owns copied monitoring components, alert utilities, and CSS while weather rendering reuses shared `WeatherIcon`, resolver, registry, and BasMilius assets.

- [ ] **Step 4: Verify code and browser behavior**

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
$env:PROJECTAMO_CAPTURE_LABEL='after'
node frontend/scripts/monitoring-capture.mjs
```

Expected: tests/build exit 0; `monitoring-ops-after.png` and `monitoring-ground-after.png` are created; current weather, TAF timeline, and hourly strip icons are present.

- [ ] **Step 5: Review before/after evidence and commit**

The main session compares before/after screenshots for layout, missing images, broken text, and day/night/weather-state regressions.

```powershell
git add -A -- Architecture.md frontend/src/features/monitoring/legacy/components/TafTimeline.jsx frontend/src/features/monitoring/legacy/components/MetarCard.jsx frontend/src/features/monitoring/legacy/components/GroundForecastPanel.jsx frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx frontend/src/features/monitoring/legacy/components/GroundHourlyStrip.jsx frontend/src/features/monitoring/legacy/components/WeatherIcon.jsx frontend/src/features/monitoring/legacy/utils/weather-visual-resolver.js frontend/src/features/monitoring/legacy/utils/weather-icon-registry.js frontend/src/features/monitoring/legacy/assets/weather-icons/basmilius
git commit -m "refactor: reuse shared weather rendering in monitoring"
```

---

### Task 7: Retire Machine-Specific Launchers and Guarantee Dev Shutdown

**Files:**
- Delete: `Launch-ProjectAMO-Dev.bat`
- Delete: `Open-ProjectAMO-Dev.bat`
- Modify: `scripts/projectamo-dev.mjs:181-190`
- Modify: `docs/dev-server-and-capture.md`

**Interfaces:**
- Consumes: existing `withServers` readiness and `finally` cleanup.
- Produces: one repo-relative dev entry path and deterministic Ctrl+C cleanup.

- [ ] **Step 1: Delete the two broken wrappers and replace the warning**

Delete both BAT files. Replace the warning at `docs/dev-server-and-capture.md:12` with:

```markdown
Use `npm run dev:serve` for persistent development and `npm run dev:test` for fixed-data verification.
```

- [ ] **Step 2: Route persistent serving through the existing cleanup seam**

Replace the persistent command branch with:

```js
if (command === 'serve' || command === 'serve:test') {
  await withServers(async () => {
    console.log('[projectamo-dev] press Ctrl+C to stop')
    await new Promise((resolve) => {
      process.once('SIGINT', resolve)
      process.once('SIGTERM', resolve)
    })
  })
}
```

Do not add another process manager or signal helper.

- [ ] **Step 3: Verify syntax and shutdown behavior**

```powershell
node --check scripts/projectamo-dev.mjs
Test-Path Launch-ProjectAMO-Dev.bat,Open-ProjectAMO-Dev.bat
npm.cmd run dev:serve
# Press Ctrl+C after readiness is reported.
Get-NetTCPConnection -LocalPort 3001,5173 -State Listen -ErrorAction SilentlyContinue
```

Expected: syntax exits 0; two `False` values; after Ctrl+C neither port has a listener.

- [ ] **Step 4: Commit the single launcher path**

```powershell
git add Launch-ProjectAMO-Dev.bat Open-ProjectAMO-Dev.bat scripts/projectamo-dev.mjs docs/dev-server-and-capture.md
git commit -m "fix: make managed dev server shut down cleanly"
```

---

### Task 8: Make Capture Failures Observable and Evidence Durable

**Files:**
- Modify: `frontend/scripts/mobile-audit.mjs:129-131`
- Modify: `frontend/scripts/mobile-audit-capture.mjs:100-104`
- Modify: `frontend/scripts/responsive-screenshots.mjs:1-50`
- Modify: `README.md:144-162`

**Interfaces:**
- Consumes: existing capture result arrays, viewport and route matrices.
- Produces: nonzero failure exit and one timestamped manifest per responsive run.

- [ ] **Step 1: Add the two minimal failure predicates**

At the end of `mobile-audit.mjs`:

```js
if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1
```

At the end of `mobile-audit-capture.mjs`:

```js
if (manifest.states.some((state) => state.ok === false)) process.exitCode = 1
```

Do not extract a shared helper for two one-line predicates.

- [ ] **Step 2: Give each responsive capture a unique run directory**

Add `writeFile` from `node:fs/promises` and `execFileSync` from `node:child_process`. Derive:

```js
const capturedAt = new Date()
const stamp = capturedAt.toISOString()
  .replace(/\.\d{3}Z$/, '')
  .replace('T', '_')
  .replaceAll(':', '')
const OUT_DIR = new URL(
  `../../artifacts/responsive-screenshots/${PHASE}/${stamp}_${LABEL}/`,
  import.meta.url,
)
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const manifest = {
  capturedAt: capturedAt.toISOString(),
  commit,
  phase: PHASE,
  label: LABEL,
  appUrl: APP_URL,
  method: 'frontend/scripts/responsive-screenshots.mjs',
  verificationCommands: ['npm.cmd run dev:screenshots'],
  viewports,
  routes,
  files: [],
}
```

Push each generated filename into `manifest.files`. In `finally`, close Chromium and write `manifest.json` even when capture partially fails. Update the README output-path example to the timestamped directory.

- [ ] **Step 3: Verify syntax and failure contracts**

```powershell
node --check frontend/scripts/mobile-audit.mjs
node --check frontend/scripts/mobile-audit-capture.mjs
node --check frontend/scripts/responsive-screenshots.mjs
```

Expected: all exit 0.

With the documented capture server running, execute each mobile audit once normally. For `mobile-audit.mjs`, use `apply_patch` to temporarily replace only this existing step:

```js
await step('monitoring-settings', async () => { await page.click('.phone-task-tab:has-text("설정")') })
```

with:

```js
await step('monitoring-settings', async () => { await page.click('.phone-task-tab:has-text("__INTENTIONAL_FAILURE__")') })
```

Set `$env:STAMP='failure-contract'`, run `node frontend/scripts/mobile-audit.mjs`, and expect exit 1. Verify `artifacts/responsive-screenshots/mobile-audit/failure-contract/results.json` contains at least one row whose `status` is `FAIL`. Immediately restore the exact original selector with `apply_patch` and rerun `node --check frontend/scripts/mobile-audit.mjs`.

For `mobile-audit-capture.mjs`, stop the server, set `$env:PROJECTAMO_URL='http://127.0.0.1:1'`, run the script, and expect exit 1 with at least one `manifest.states` entry whose `ok` is `false`. Clear `PROJECTAMO_URL` and `STAMP` afterward.

Expected: normal runs exit 0; both intentional failure paths exit 1 and write their existing failure records; the source file is restored before commit.

- [ ] **Step 4: Verify two responsive runs do not overwrite**

```powershell
npm.cmd run dev:screenshots
npm.cmd run dev:screenshots
```

Expected: two distinct second-resolution timestamped directories, each containing 18 PNG files plus `manifest.json`; each manifest lists 18 filenames.

- [ ] **Step 5: Commit the evidence contract**

```powershell
git add frontend/scripts/mobile-audit.mjs frontend/scripts/mobile-audit-capture.mjs frontend/scripts/responsive-screenshots.mjs README.md
git commit -m "fix: preserve capture evidence and failure status"
```

---

### Task 9: Make Full Deployment Deterministic

**Files:**
- Modify: `deploy/deploy-vm-full.sh:11-26`
- Modify: `deploy/deploy-vm.sh:11-20`
- Modify: `docs/operations.md:91-99`

**Interfaces:**
- Consumes: committed backend/frontend lockfiles; no VM access or root lockfile handoff.
- Produces: full deployment using `npm ci`; fast deployment with an explicit no-dependency-change contract.

- [ ] **Step 1: Replace full deployment installs**

In `deploy/deploy-vm-full.sh`, replace the two install commands with:

```bash
npm --prefix backend ci
npm --prefix frontend ci
```

Delete the lockfile-churn comments and `git checkout -- ...package-lock.json` workaround from both deploy scripts.

- [ ] **Step 2: Document the fast-path contract**

In `docs/operations.md`, state that `deploy-vm.sh` is valid only when manifests and lockfiles have not changed. Dependency changes require `deploy-vm-full.sh`.

Do not add install commands to the fast path; its value is explicitly avoiding dependency work.

- [ ] **Step 3: Verify shell syntax and removed workarounds**

```bash
bash -n deploy/deploy-vm.sh
bash -n deploy/deploy-vm-full.sh
rg -n "npm .*install|git checkout -- .*package-lock" deploy
```

Expected: both syntax checks exit 0; the search returns no executable `npm install` or lockfile checkout workaround.

- [ ] **Step 4: Verify package preparation in a disposable clean clone and commit**

Do not execute either deploy script during this check because they control PM2 and nginx. Run only the dependency/build portion in a disposable clone:

```powershell
$verifyRoot = Join-Path $env:TEMP ("projectamo-deploy-verify-" + [guid]::NewGuid())
git clone --no-local . $verifyRoot
Push-Location $verifyRoot
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
git status --porcelain
Pop-Location
```

Expected: installs/build exit 0 and `git status --porcelain` prints nothing. Confirm `$verifyRoot` resolves under the OS temp directory before any later cleanup of that disposable clone.

```powershell
git add deploy/deploy-vm.sh deploy/deploy-vm-full.sh docs/operations.md
git commit -m "chore: make full deployment deterministic"
```

---

### Task 10: Move Completed Records and Route-Import Fixtures to Their Owners

**Files:**
- Move: `docs/superpowers/status/2026-07-07-dev-mode-console-status.md` → `docs/superpowers/status/archive/2026-07-07-dev-mode-console-status.md`
- Move: `docs/superpowers/status/cleanup-dead-code-and-stale-docs.status.md` → `docs/superpowers/status/archive/cleanup-dead-code-and-stale-docs.status.md`
- Move: `docs/superpowers/status/overseas-data-research.md` → `docs/research/2026-07-05-overseas-data-research.md`
- Move: `status.md` → `docs/superpowers/status/2026-07-07-route-forecast-alert.status.md`
- Move: `tasks/design-system-phase1/plan.md` → `docs/superpowers/archive/plans/2026-06-28-design-system-phase1.md`
- Move: `docs/superpowers/plans/fixtures/` → `frontend/test/fixtures/route-import/`
- Modify: two route-import capture scripts and three plan documents with inbound paths

**Interfaces:**
- Consumes: completed status authority and live route-import capture data.
- Produces: active status containing only resumable work; executable fixtures owned by frontend tests.

- [ ] **Step 1: Recheck move-source ownership**

```powershell
git status --short -- docs/superpowers/status docs/research tasks status.md frontend/test docs/superpowers/plans/fixtures frontend/scripts
rg -c '^- \[x\]' tasks/design-system-phase1/plan.md
rg -n '^- \[ \]' tasks/design-system-phase1/plan.md
```

Expected: no unrelated overlapping modifications; completed plan has six checked items and no unchecked item.

- [ ] **Step 2: Run the route-import capture baseline**

Following `docs/dev-server-and-capture.md`, run both existing route-import capture scripts before moving fixtures.

Expected: both print `PASS`. If either fails, stop the fixture portion and leave paths unchanged.

- [ ] **Step 3: Create the fixture parent and perform the safe record moves with `git mv`**

```powershell
$repoRoot = [IO.Path]::GetFullPath((Get-Location).Path)
$fixtureParent = [IO.Path]::GetFullPath((Join-Path $repoRoot 'frontend/test/fixtures'))
if (-not $fixtureParent.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture destination escapes repository root' }
New-Item -ItemType Directory -Force -Path $fixtureParent | Out-Null
```

Expected: `Test-Path frontend/test/fixtures` returns `True`.

```powershell
git mv docs/superpowers/status/2026-07-07-dev-mode-console-status.md docs/superpowers/status/archive/2026-07-07-dev-mode-console-status.md
git mv docs/superpowers/status/cleanup-dead-code-and-stale-docs.status.md docs/superpowers/status/archive/cleanup-dead-code-and-stale-docs.status.md
git mv docs/superpowers/status/overseas-data-research.md docs/research/2026-07-05-overseas-data-research.md
git mv status.md docs/superpowers/status/2026-07-07-route-forecast-alert.status.md
git mv tasks/design-system-phase1/plan.md docs/superpowers/archive/plans/2026-06-28-design-system-phase1.md
git mv docs/superpowers/plans/fixtures frontend/test/fixtures/route-import
```

Before the directory move, resolve both source and destination and confirm they remain under the repository root. Do not move the entire `tasks/`, `plans/`, or `status/` parent directory.

- [ ] **Step 4: Repair all known inbound and relative paths**

1. In the archived dev-console status, change both `../plans/2026-07-07-dev-mode-console.md` links to `../../plans/2026-07-07-dev-mode-console.md`.
2. Update `docs/superpowers/plans/overseas-weather-and-fir.md:5` and `docs/superpowers/plans/overseas-noaa-integration.md:8` to `docs/research/2026-07-05-overseas-data-research.md`.
3. In `frontend/scripts/route-import-capture.mjs`, use:

```js
const FIXTURE_DIR = path.join(__dirname, '../test/fixtures/route-import')
```

4. In `frontend/scripts/route-import-real-files-capture.mjs`, use:

```js
const FIXTURE_DIR = path.join(__dirname, '../test/fixtures/route-import/real-world')
```

5. In `docs/superpowers/archive/plans/2026-07-02-route-file-import.md:994,1015-1017,1023,1047,1063,1103`, replace every old fixture path and the machine-specific prefix with `frontend/test/fixtures/route-import/...`.

- [ ] **Step 5: Verify moves and captures**

```powershell
(Get-ChildItem frontend/test/fixtures/route-import -Recurse -File).Count
node --check frontend/scripts/route-import-capture.mjs
node --check frontend/scripts/route-import-real-files-capture.mjs
node --test frontend/src/features/route-briefing/lib/routeImport.test.js
rg -n --fixed-strings 'docs/superpowers/plans/fixtures' frontend scripts docs/superpowers/archive/plans/2026-07-02-route-file-import.md
rg -n '\]\(\.\./plans/' docs/superpowers/status/archive/2026-07-07-dev-mode-console-status.md
```

Expected: fixture count 10; syntax/test commands exit 0; both searches return no output. Rerun both route-import captures and expect `PASS`.

- [ ] **Step 6: Commit repository placement cleanup**

```powershell
git add -- docs/superpowers/status/archive/2026-07-07-dev-mode-console-status.md docs/superpowers/status/archive/cleanup-dead-code-and-stale-docs.status.md docs/research/2026-07-05-overseas-data-research.md docs/superpowers/status/2026-07-07-route-forecast-alert.status.md docs/superpowers/archive/plans/2026-06-28-design-system-phase1.md docs/superpowers/plans/overseas-weather-and-fir.md docs/superpowers/plans/overseas-noaa-integration.md docs/superpowers/archive/plans/2026-07-02-route-file-import.md frontend/test/fixtures/route-import frontend/scripts/route-import-capture.mjs frontend/scripts/route-import-real-files-capture.mjs
git commit -m "docs: move completed records and active fixtures"
```

---

### Task 11a: VM-Free Integrated Verification Checkpoint

**Files:**
- Modify if reality changed: `Architecture.md`
- Modify: `docs/superpowers/status/repo-efficiency-audit.status.md`
- Update generated graph: `graphify-out/`

**Interfaces:**
- Consumes: completed VM-free Tasks 2a, 3a, 4, 5, 7, 8, 9, and 10.
- Produces: verified VM-free cleanup, current architecture map, refreshed code knowledge graph, and an explicit deferred Resume Point.

- [ ] **Step 1: Run the repository gate**

```powershell
npm.cmd run check
```

Expected: backend/frontend tests and frontend build exit 0.

- [ ] **Step 2: Run targeted structural searches**

```powershell
rg -n "WarningTab|AircraftProfileField|EtdField|buildCompactMetarModel|buildCompactTafModel|formatRvrSummary|listProfiles|saveProfile|deleteProfile|setLastUsed" frontend/src Architecture.md
rg -n "features/monitoring/legacy/(components/WeatherIcon|utils/weather-visual-resolver|utils/weather-icon-registry|assets/weather-icons/basmilius)" frontend/src
rg -n "C:\\Users\\Jond Doe|docs/superpowers/plans/fixtures" frontend scripts docs --glob '!docs/research/2026-07-15-repository-efficiency-audit.md' --glob '!docs/superpowers/plans/2026-07-15-repository-efficiency-cleanup.md'
```

Expected: no matches. Historical audit text is intentionally excluded.

- [ ] **Step 3: Repeat browser-visible verification**

Following `docs/dev-server-and-capture.md`, capture `/monitoring` after evidence and rerun both route-import captures.

Expected: monitoring capture exits 0 with both views; route-import scripts print `PASS`.

- [ ] **Step 4: Refresh the knowledge graph**

```powershell
graphify update .
```

Expected: incremental update exits 0. Dirty `graphify-out/` files are expected generated output.

- [ ] **Step 5: Review the complete diff and deferred boundaries**

```powershell
git status --short
git diff --stat
git diff --check
```

Expected: no whitespace errors; no changes to RKPC assets, theme tokens, airport-panel prototype, briefing charts, `reference/html`, pre-existing agent-routing WIP, or the unowned root lockfile diff.

- [ ] **Step 6: Update Architecture and record the deferred Resume Point**

Confirm `Architecture.md` reflects the live warning surface, the new route-briefing modules, and shared monitoring weather ownership. Record VM-free verification in the status. Do not archive it while Task 1, Task 2b, Task 3b, or Task 6 remains deferred; set Resume Point to the first blocker the user later resolves.

- [ ] **Step 7: Commit the VM-free checkpoint if documentation changed**

Do not automatically stage `graphify-out/`; dirty graph output may predate this plan. Stage only the reviewed architecture/status files:

```powershell
git add -- Architecture.md docs/superpowers/status/repo-efficiency-audit.status.md
git commit -m "docs: record VM-free cleanup checkpoint"
```

Decide from current status, not from tracked diff alone:

```powershell
git status --short -- Architecture.md docs/superpowers/status/repo-efficiency-audit.status.md
```

Commit whenever this output is nonempty, including an untracked status file. Skip only when it prints nothing. Review graph output separately before deciding whether it belongs in a later generated-artifact commit.

## Blocked / Deferred — Do Not Execute Now

### Task 1 (DEFERRED — VM Required): Discover the Deployment Node Runtime

**Blocker:** SSH access is unavailable for EC2 `i-02e07f23649fd05fe` (`ap-northeast-2c`, `ec2-user@3.34.113.37`) because the key is unavailable and the security group is not open. The user will resolve access later. Do not attempt SSH from this plan until the user explicitly resumes this Task.

**Files:**
- No repository edit until the runtime passes the gate.

**Interfaces:**
- Consumes: the Node process actually used by PM2 on `/opt/projectamo/current`.
- Produces: one accepted deployment Node candidate for Task 2b.

- [ ] **Step 1: Read shell and PM2 Node versions on the deployment VM**

After the user restores access, run on `/opt/projectamo/current`:

```bash
node --version
pm2 jlist | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).find(x=>x.name==='projectamo-backend');console.log(p?.pm2_env?.node_version||'missing')})"
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)"
```

Expected: shell Node and PM2 Node are identical and the compatibility command exits 0 for Vite’s `^20.19.0 || >=22.12.0` requirement.

- [ ] **Step 2: Apply the stop condition**

If the versions differ, PM2 reports `missing`, or the compatibility command exits nonzero, stop. Resolve the VM runtime and repeat discovery; do not create `.node-version`.

If the gate passes, record the exact version without `v` in the status on a line beginning `- Accepted Node candidate:`.

---

### Task 2b (DEFERRED — Requires Task 1): Pin the Verified Node Version

**Files:**
- Create: `.node-version`
- Modify: `package.json:1-6`

**Interfaces:**
- Consumes: Task 1 accepted candidate, Task 2a natural-exit fix, Task 3a local `check`.
- Produces: one exact Node version shared by local execution and later CI.

- [ ] **Step 1: Prove the local shell uses the accepted candidate**

```powershell
$status = Get-Content -Raw docs/superpowers/status/repo-efficiency-audit.status.md
$accepted = [regex]::Match($status, '(?m)^- Accepted Node candidate:\s*([0-9.]+)\s*$').Groups[1].Value
$current = node -p "process.versions.node"
if (-not $accepted -or $current -ne $accepted) { throw "Switch Node runtime before pinning: accepted=$accepted current=$current" }
```

Expected: no exception. If versions differ, switch with the approved local version manager and rerun before making a GREEN claim.

- [ ] **Step 2: Revalidate tests on that exact runtime**

```powershell
npm.cmd --prefix backend test
npm.cmd run check
```

Expected: both commands exit 0 naturally on the accepted deployment version.

- [ ] **Step 3: Write the exact pin**

Using `apply_patch`, create `.node-version` with the accepted version without `v` and add root `package.json` `engines.node` using the identical literal. Do not use a version range.

```powershell
node -e "const fs=require('fs');const p=require('./package.json');const v=fs.readFileSync('.node-version','utf8').trim();if(p.engines.node!==v)process.exit(1);console.log(v)"
```

Expected: prints the accepted version and exits 0.

- [ ] **Step 4: Commit the runtime pin**

```powershell
git add .node-version package.json
git commit -m "chore: pin verified Node runtime"
```

---

### Task 3b (DEFERRED — Requires Task 2b): Add the Smallest CI Gate

**Files:**
- Create: `.github/workflows/check.yml`

**Interfaces:**
- Consumes: `.node-version` from Task 2b and root `npm run check` from Task 3a.
- Produces: one Linux CI job using the same local verification interface.

- [ ] **Step 1: Create the workflow directory**

```powershell
New-Item -ItemType Directory -Force -Path .github/workflows | Out-Null
```

Expected: `Test-Path .github/workflows` returns `True`.

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/check.yml`:

```yaml
name: check
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: npm
          cache-dependency-path: |
            package-lock.json
            frontend/package-lock.json
            backend/package-lock.json
      - run: npm ci
      - run: npm --prefix frontend ci
      - run: npm --prefix backend ci
      - run: npm run check
```

Do not temporarily substitute `lts/*`, the ambient local Node version, or a missing `node-version-file`. Start with Linux only; add Windows only after a real platform-specific requirement.

- [ ] **Step 3: Commit and verify the CI gate**

```powershell
git add .github/workflows/check.yml
git commit -m "ci: add repository check gate"
```

Expected after push: the `check` job passes. A deliberately failing assertion must make the job fail; revert that assertion immediately and confirm green before merging.

---

### Task 6 (BLOCKED — Root Lockfile Owner Handoff Required): Remove Redundant Root Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Preserve: `frontend/package.json`, `frontend/package-lock.json`
- Preserve: `backend/package.json`, `backend/package-lock.json`

**Interfaces:**
- Consumes: existing `scripts/projectamo-dev.mjs serve` and frontend-owned UI dependencies.
- Produces: root package owning only root preprocessing/runtime tooling; seven fewer direct dependencies.

- [ ] **Step 1: Enforce the dirty-lock stop condition**

```powershell
git status --short -- package.json package-lock.json
git diff -- package.json package-lock.json
```

Expected now: `package-lock.json` is dirty from another session, so stop without editing. Resume only after its owner commits or explicitly hands off the diff.

- [ ] **Step 2: Reuse the managed launcher**

Change root script:

```json
"dev": "npm run dev:serve"
```

- [ ] **Step 3: Remove only the redundant direct dependencies**

Remove `concurrently` from `devDependencies` and remove these six frontend-owned packages from root `dependencies`:

```text
@vitejs/plugin-react
lucide-react
mapbox-gl
react
react-dom
vite
```

Preserve `@turf/turf` and `@turf/union`. Do not move `@turf/union` in this Task.

- [ ] **Step 4: Regenerate only the root lockfile**

```powershell
npm.cmd install --package-lock-only --ignore-scripts
```

Expected: only root `package.json` and `package-lock.json` change.

- [ ] **Step 5: Verify ownership and repository checks**

```powershell
npm.cmd ci --ignore-scripts
npm.cmd --prefix frontend ci
npm.cmd --prefix backend ci
npm.cmd ls --depth=0
npm.cmd run check
git status --short -- frontend/package-lock.json backend/package-lock.json
```

Expected: installs/check exit 0; none of the seven removed packages remains root-direct; frontend/backend lockfiles do not change.

- [ ] **Step 6: Commit the ownership cleanup**

```powershell
git add package.json package-lock.json
git commit -m "chore: remove duplicate root dependencies"
```

---

### Task 11b: Final Closure After Deferred Tasks

**Files:**
- Move: `docs/superpowers/status/repo-efficiency-audit.status.md` → `docs/superpowers/status/archive/repo-efficiency-audit.status.md`
- Update generated graph: `graphify-out/`

**Interfaces:**
- Consumes: completed Task 1, Task 2b, Task 3b, and Task 6 plus the Task 11a checkpoint.
- Produces: final verified cleanup and no stale active status.

- [ ] **Step 1: Run final checks**

```powershell
npm.cmd run check
graphify update .
git diff --check
```

Expected: tests/build and graph update exit 0; no whitespace errors.

- [ ] **Step 2: Confirm CI is green for the exact integrated main commit**

After the user pushes or merges the integrated commit to `main`, run:

```powershell
$head = git rev-parse HEAD
$run = gh run list --workflow check.yml --branch main --commit $head --limit 1 --json headSha,status,conclusion | ConvertFrom-Json | Select-Object -First 1
if (-not $run -or $run.headSha -ne $head -or $run.status -ne 'completed' -or $run.conclusion -ne 'success') { throw 'No successful check.yml run for current main HEAD' }
```

Expected: the exact current `main` SHA has a `completed` / `success` run. If `gh` is unavailable, verify that same SHA in GitHub before closing status; an earlier branch or commit does not count.

- [ ] **Step 3: Archive the completed status and commit**

Record final verification, then:

```powershell
git mv docs/superpowers/status/repo-efficiency-audit.status.md docs/superpowers/status/archive/repo-efficiency-audit.status.md
git add -- docs/superpowers/status/archive/repo-efficiency-audit.status.md
git commit -m "docs: archive repository efficiency cleanup status"
```

Do not automatically stage pre-existing dirty `graphify-out/` files.

## Execution Order and Parallelism

### Immediate — VM-Free

1. Task 0 preflight and current-main overlap check
2. Task 2a backend natural-exit crash fix
3. Task 3a local `npm test` / `npm run check`
4. Tasks 4 → 5 → 7
5. Tasks 8 → 9 → 10
6. Task 11a VM-free integrated checkpoint

Tasks 5, 7, 8, and 10 may use fresh subagents with disjoint edit ownership, but their server/Playwright verification runs serially in the main session. Task 9 remains immediate: it edits and locally verifies deploy scripts against committed backend/frontend lockfiles without SSH or the dirty root lockfile.

### Blocked / Deferred

- Task 1: blocked until the user restores VM SSH access.
- Task 2b: depends on Task 1 plus completed Tasks 2a and 3a.
- Task 3b: depends on `.node-version` from Task 2b.
- Task 6: blocked until the root lockfile owner commits or hands off.
- Task 11b: runs only after every deferred Task is integrated.

A subagent report is not completion evidence; the main session owns Task 11a and Task 11b verification.
