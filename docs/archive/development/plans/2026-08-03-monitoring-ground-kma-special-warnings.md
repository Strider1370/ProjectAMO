# Monitoring Ground KMA Special Warnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show active KMA heat-wave and cold-wave special warnings alongside airport warnings in the ground-monitoring banner.

**Architecture:** A small backend collector normalizes API Hub's EUC-KR special-warning status into a per-airport snapshot and retains the last good snapshot on failure. Monitoring polling receives that snapshot as a separate data type; the existing `WarningList` builds one rotating list only in ground mode.

**Tech Stack:** Node.js ESM, native `fetch`/`TextDecoder`, existing snapshot store and cron scheduler, React, Playwright.

## Global Constraints

- Use the existing API Hub `KMA_AVIATION_AUTH_KEY`; do not introduce another key or dependency.
- Collect only heat wave and cold wave warnings; exclude every other KMA special-warning phenomenon.
- Parse source KST compact times at the backend boundary and store UTC ISO instants.
- Keep the last valid snapshot when collection fails; a failed response must not clear the displayed data.
- Only ground mode merges KMA items. Operations mode remains airport-warning-only.
- Reuse the existing banner paging and 4.2-second rotation; add no second rotator, alert, or setting.
- Preserve the existing ground `일기개황` fallback when the merged list is empty.

---

## File Structure

- `backend/src/parsers/kma-special-warning-parser.js` — decode the API Hub status text into normalized KMA warning records.
- `backend/src/processors/kma-special-warning-processor.js` — fetch, map active warning regions to supported ground airports, and save only valid snapshots.
- `backend/src/config.js` — endpoint, five-minute schedule, and the eight verified airport-to-special-warning-region mappings.
- `backend/src/api-client.js`, `backend/src/index.js`, `backend/src/store.js`, `backend/server.js` — existing transport, collection, snapshot, and cached-route lifecycle wiring.
- `frontend/src/api/weatherApi.js`, `frontend/src/features/monitoring/monitoringApi.js` — initial and hash-based refresh wiring.
- `frontend/src/features/monitoring/legacy/components/warningBannerModel.js` — pure merge and display-model logic.
- `frontend/src/features/monitoring/legacy/components/WarningList.jsx` — render the merged model in ground mode without changing its paging engine.

### Task 1: Collect and normalize KMA special-warning status

**Files:**
- Create: `backend/src/parsers/kma-special-warning-parser.js`
- Create: `backend/src/processors/kma-special-warning-processor.js`
- Create: `backend/test/fixtures/kma-special-warning-status.txt`
- Create: `backend/test/kma-special-warning-parser.test.js`
- Create: `backend/test/kma-special-warning-processor.test.js`
- Modify: `backend/src/config.js`
- Modify: `backend/src/api-client.js`

**Interfaces:**
- Consumes: API Hub `wrn_now_data_new.php` EUC-KR text.
- Produces: `parseKmaSpecialWarningStatus(text): Array<{regionId, phenomenon:'HEAT_WAVE'|'COLD_WAVE', levelLabel, issuedAt, effectiveAt}>`.
- Produces: `process(): Promise<{type:'kma_special_warning', saved:boolean, airports:number}>` with `{type:'KMA_SPECIAL_WARNINGS', fetched_at, airports:{[icao]:{warnings:[...]}}}`.

- [ ] **Step 1: Write the parser and processor failures**

```js
test('keeps only heat-wave and cold-wave current warnings and converts KST times', () => {
  const warnings = parseKmaSpecialWarningStatus(readFixture('kma-special-warning-status.txt'))
  assert.deepEqual(warnings.map(({ phenomenon, regionId }) => [phenomenon, regionId]), [
    ['HEAT_WAVE', 'L1110110'],
    ['COLD_WAVE', 'L1022310'],
  ])
  assert.equal(warnings[0].effectiveAt, '2026-08-03T02:00:00.000Z')
})

test('does not save an empty replacement after a collector failure', async () => {
  apiClient.fetchKmaSpecialWarningStatus = async () => { throw new Error('503') }
  const result = await processor.process()
  assert.equal(result.saved, false)
  assert.equal(saveCalls.length, 0)
})

test('publishes an empty snapshot when a valid response has no heat or cold warning', async () => {
  apiClient.fetchKmaSpecialWarningStatus = async () => readFixture('kma-special-warning-status-empty.txt')
  await processor.process()
  assert.deepEqual(savedPayload.airports, {})
})

test('maps the verified airport regions and excludes cancelled notices', () => {
  assert.equal(KMA_SPECIAL_WARNING_REGION_BY_AIRPORT.RKSI, 'L1110110')
  assert.equal(KMA_SPECIAL_WARNING_REGION_BY_AIRPORT.RKPC, 'L1091320')
  assert.equal(parseKmaSpecialWarningStatus(cancelledHeatWarningText).length, 0)
})
```

- [ ] **Step 2: Run the backend tests to verify the failure**

Run: `npm --prefix backend test -- kma-special-warning-parser.test.js kma-special-warning-processor.test.js`  
Expected: FAIL because parser and processor modules do not exist.

- [ ] **Step 3: Add the smallest collector implementation**

```js
export const KMA_SPECIAL_WARNING_REGION_BY_AIRPORT = {
  RKSI: 'L1110110', RKSS: 'L1010700', RKPC: 'L1091320', RKPK: 'L1080900',
  RKJB: 'L1053420', RKJY: 'L1051000', RKPU: 'L1082900', RKNY: 'L1022310',
}

const active = parseKmaSpecialWarningStatus(text)
store.save('kma_special_warning', buildSnapshot(active))
```

Use `TextDecoder('euc-kr')`, accept raw phenomenon values `H`/`C` and `폭염`/`한파`, retain levels `주의`/`경보`/`중대경보`, exclude `CMD=해제`, and use the existing compact-KST parser helper or add one there. The parser throws for malformed/auth responses; every successful parse, including `[]` from a body with only unrelated phenomena or an authenticated `#START7777`/`#7777END` body, is saved as a possibly empty snapshot. Transport/auth/parse failures are unsaved failures.

- [ ] **Step 4: Run the backend tests to verify the collector**

Run: `npm --prefix backend test -- kma-special-warning-parser.test.js kma-special-warning-processor.test.js`  
Expected: PASS; fixture heat/cold records are normalized, other phenomena are absent, and failures leave the prior snapshot untouched.

- [ ] **Step 5: Commit the collector**

```bash
git add backend/src/config.js backend/src/api-client.js backend/src/parsers/kma-special-warning-parser.js backend/src/processors/kma-special-warning-processor.js backend/test/fixtures/kma-special-warning-status.txt backend/test/kma-special-warning-parser.test.js backend/test/kma-special-warning-processor.test.js
git commit -m "feat(monitoring): collect KMA special warnings"
```

### Task 2: Publish and refresh the new snapshot type

**Files:**
- Modify: `backend/src/store.js`
- Modify: `backend/src/index.js`
- Modify: `backend/server.js`
- Modify: `frontend/src/api/weatherApi.js`
- Modify: `frontend/src/features/monitoring/monitoringApi.js`
- Create: `frontend/src/features/monitoring/monitoringApi.test.js`

**Interfaces:**
- Consumes: store type `kma_special_warning` from Task 1.
- Produces: `GET /api/kma-special-warning` and snapshot-meta key `kmaSpecialWarning`.
- Produces: monitoring data property `kmaSpecialWarning` on initial and changed-data loads.

- [ ] **Step 1: Write the refresh contract failure**

```js
test('marks only the KMA special-warning payload as changed', () => {
  const changed = detectMonitoringSnapshotChanges(
    { kmaSpecialWarning: { content_hash: 'new' } },
    { kmaSpecialWarning: 'old' },
  )
  assert.equal(changed.kmaSpecialWarning, true)
})

test('keeps the existing KMA warning value when a changed fetch fails', async () => {
  global.fetch = async () => ({ ok: false, status: 503 })
  const changed = await loadChangedWeatherData({ kmaSpecialWarning: true })
  assert.equal(changed.kmaSpecialWarning, undefined)
})
```

- [ ] **Step 2: Run the frontend test to verify the failure**

Run: `npm --prefix frontend test -- src/features/monitoring/monitoringApi.test.js`  
Expected: FAIL because the snapshot key and fetch path are absent.

- [ ] **Step 3: Wire the existing data lifecycle once**

```js
// store type + server route + snapshot meta
{ keys: ['kmaSpecialWarning', 'kma_special_warning'], files: [snapshotMetaLatest('kma_special_warning')], build: () => buildHashEntry('kma_special_warning') }
app.get('/api/kma-special-warning', (_, res) => sendLatest(res, 'kma_special_warning'))

// frontend initial and changed fetch
fetchJson('/api/kma-special-warning', { optional: true })
if (changes.kmaSpecialWarning) { fetches.push(fetchJson('/api/kma-special-warning', { optional: 'preserve' })); keys.push('kmaSpecialWarning') }
```

Register `kma_special_warning` in the store, lock map, startup collection list, and the same five-minute scheduler interval as airport warnings. Include it in `/api/snapshot-meta`, the browser revalidation matcher, and monitoring's snapshot build/detect/next helpers; do not add it to unrelated main-screen behavior.

- [ ] **Step 4: Run lifecycle tests**

Run: `npm --prefix frontend test -- src/features/monitoring/monitoringApi.test.js && npm --prefix backend test`  
Expected: PASS; the new hash loads on startup and refreshes independently without replacing a previous client value on HTTP failure.

- [ ] **Step 5: Commit lifecycle wiring**

```bash
git add backend/src/store.js backend/src/index.js backend/server.js frontend/src/api/weatherApi.js frontend/src/features/monitoring/monitoringApi.js frontend/src/features/monitoring/monitoringApi.test.js
git commit -m "feat(monitoring): publish KMA special warnings"
```

### Task 3: Merge ground-banner items and verify the browser contract

**Files:**
- Create: `frontend/src/features/monitoring/legacy/components/warningBannerModel.js`
- Create: `frontend/src/features/monitoring/legacy/components/warningBannerModel.test.js`
- Modify: `frontend/src/features/monitoring/legacy/components/WarningList.jsx`
- Modify: `frontend/src/features/monitoring/MonitoringPage.jsx`
- Modify: `frontend/src/features/monitoring/legacy/App.css`
- Modify: `frontend/verification/contracts/monitoring.spec.mjs` (or the existing monitoring contract file discovered before implementation)

**Interfaces:**
- Consumes: airport-warning payload, `kmaSpecialWarning` payload, selected ICAO, and `dashboardMode`.
- Produces: `buildWarningBannerItems({airportWarnings, kmaWarnings, dashboardMode}): Array<{source:'airport'|'kma', title:string, effectiveAt:string|null, validEnd:string|null}>`.
- Produces: ground-mode `WarningList` source-labelled merged pages; operations mode airport pages only.

- [ ] **Step 1: Write the pure merge-model failure**

```js
test('adds KMA heat warnings only in ground mode', () => {
  const items = buildWarningBannerItems({
    airportWarnings: [{ wrng_type_key: 'THUNDERSTORM', valid_start: '2026-08-03T00:00:00.000Z' }],
    kmaWarnings: [{ phenomenon: 'HEAT_WAVE', levelLabel: '경보', effectiveAt: '2026-08-03T02:00:00.000Z' }],
    dashboardMode: 'ground',
  })
  assert.deepEqual(items.map((item) => item.title).sort(), ['기상청 특보 · 폭염경보', '뇌우'])
  assert.equal(buildWarningBannerItems({ airportWarnings: [], kmaWarnings: [{ phenomenon: 'HEAT_WAVE', levelLabel: '경보' }], dashboardMode: 'ops' }).length, 0)
})

test('returns no items when both sources are empty so WarningList keeps its overview fallback', () => {
  assert.deepEqual(buildWarningBannerItems({ airportWarnings: [], kmaWarnings: [], dashboardMode: 'ground' }), [])
})
```

- [ ] **Step 2: Run the model test to verify the failure**

Run: `npm --prefix frontend test -- src/features/monitoring/legacy/components/warningBannerModel.test.js`  
Expected: FAIL because `buildWarningBannerItems` does not exist.

- [ ] **Step 3: Implement the smallest UI integration**

```jsx
const items = buildWarningBannerItems({
  airportWarnings: block?.warnings || [],
  kmaWarnings: kmaSpecialWarningData?.airports?.[icao]?.warnings || [],
  dashboardMode,
})
const bannerLabel = dashboardMode === 'ground' ? '기상경보·특보' : '공항경보'
```

Render KMA entries as text such as `기상청 특보 · 폭염경보` with `발효 03일 11시`, reading the backend's `effectiveAt` property; retain the existing airport-warning copy and page animation. Do not impose a source ordering: preserve the combined input order and let the existing page engine rotate all items. Use the existing semantic warning styling and text labels rather than color alone. Pass `data.kmaSpecialWarning` from `MonitoringPage`; leave the ground overview fallback unchanged when `items` is empty.

- [ ] **Step 4: Run focused UI tests and the browser contract**

Run: `npm --prefix frontend test -- src/features/monitoring/legacy/components/warningBannerModel.test.js && npm run dev:contract -- monitoring`  
Expected: PASS; the ground capture shows one banner containing both source types across rotation, while operations capture contains no KMA item.

- [ ] **Step 5: Commit UI and verification**

```bash
git add frontend/src/features/monitoring/legacy/components/warningBannerModel.js frontend/src/features/monitoring/legacy/components/warningBannerModel.test.js frontend/src/features/monitoring/legacy/components/WarningList.jsx frontend/src/features/monitoring/MonitoringPage.jsx frontend/src/features/monitoring/legacy/App.css frontend/verification/contracts/monitoring.spec.mjs
git commit -m "feat(monitoring): show ground KMA heat and cold warnings"
```

## Plan Self-Review

- Spec coverage: Tasks 1–2 cover API Hub collection, normalized KST time, static region mapping, locking, stale-data preservation, caching, and monitoring refresh. Task 3 covers ground-only merging, source text, existing rotation, operations isolation, and empty fallback.
- No placeholders: every task names its files, data contract, runnable failing check, implementation target, passing check, and commit scope.
- Type consistency: backend publishes `kma_special_warning`; API payloads and frontend state use `kmaSpecialWarning`; the UI consumes only `kmaSpecialWarning.airports[icao].warnings`.
