# API Hub Key Usage Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meter KMA API Hub traffic for the three configured key categories, block a key at 4.75 GB or upstream 403 until KST midnight, and display the state on `/admin`.

**Architecture:** Add a small persisted usage-ledger module plus one body-buffering API Hub fetch wrapper. Existing KMA callers give that wrapper the credential they actually use; the ledger resolves it to one of the three primary categories and fingerprints it so fallback categories sharing one credential are aggregated. Scheduler job metadata avoids starting a collection whose sole required key is blocked, while the wrapper remains the final no-network safety boundary.

**Tech Stack:** Node.js 22 ESM and built-in `fetch`/`Response`, Node test runner, Express, React 19/Vite, existing CSS tokens, Playwright.

## Global Constraints

- KMA limit: 5,000,000,000 bytes per KST day; block threshold: 4,750,000,000 bytes (5% margin).
- Persist only a one-way credential fingerprint suffix; never write or return a credential, URL query, or response payload.
- Reset and display the day boundary in `Asia/Seoul`; store timestamps as UTC ISO/epoch values.
- Keep `KMA_RADAR_SATELLITE_ENABLED=0` as an independent manual emergency override.
- Do not change non-KMA providers or add dependencies.
- Preserve unrelated dirty-worktree files.

---

### Task 1: Persistent KMA API Hub usage ledger

**Files:**
- Create: `backend/src/api-hub-usage.js`
- Create: `backend/test/api-hub-usage.test.js`
- Modify: `backend/src/config.js`

**Interfaces:**
- Produces `API_HUB_KEY_CATEGORIES`, fixed `API_HUB_ENDPOINTS`, `resolveApiHubKeyCategory(credential)`, `getApiHubUsage()`, `recordApiHubResponse(credential, { bytes, status, endpoint, now })`, `assertApiHubAllowed(credential, { now })`, and `isApiHubCategoryBlocked(category, { now })`.
- Consumes `config.storage.base_path`, the three resolved primary credentials, and the actual credential for each request without exporting credential values.
- `getApiHubUsage()` returns `{ generatedAt, keys: [{ category, label, fingerprintSuffix, dayKst, bytes, limitBytes, thresholdBytes, requests, successes, failures, lastCalledAt, status, blockedReason, resetsAt, endpoints: [{ label, bytes, requests, successes, failures, lastCalledAt }] }] }`; each `endpoints` array is descending by `bytes`.

- [ ] **Step 1: Write failing ledger tests**

```js
test('aggregates fallback categories by credential fingerprint and rolls over at KST midnight', async () => {
  const usage = createApiHubUsage({ root, keys: { aviation: 'same', radar_satellite: 'same', kim_nwp: 'kim' } })
  await usage.record('aviation', { bytes: 125, status: 200, now: Date.parse('2026-08-09T14:59:59Z') })
  await usage.record('radar_satellite', { bytes: 75, status: 200, now: Date.parse('2026-08-09T14:59:59Z') })
  assert.equal(usage.snapshot().keys.find((key) => key.category === 'aviation').bytes, 200)
  assert.equal(usage.snapshot({ now: Date.parse('2026-08-09T15:00:00Z') }).keys[0].bytes, 0)
})

test('blocks before another network call at threshold and persists no secret', async () => {
  const usage = createApiHubUsage({ root, keys: { aviation: 'private-key' }, thresholdBytes: 100 })
  await usage.record('aviation', { bytes: 100, status: 200 })
  assert.throws(() => usage.assertAllowed('aviation'), { code: 'api_hub_budget_blocked' })
  assert.doesNotMatch(await readFile(path.join(root, 'api-hub-usage.json'), 'utf8'), /private-key/)
})

test('rejects an API Hub credential that is not one of the three assigned keys', () => {
  const usage = createApiHubUsage({ root, keys: { aviation: 'aviation', radar_satellite: 'radar', kim_nwp: 'kim' } })
  assert.throws(() => usage.assertAllowed('unassigned-fourth-key'), { code: 'unknown_api_hub_credential' })
})

test('aggregates safe endpoint labels and orders largest consumers first', async () => {
  await usage.record('aviation-key', { bytes: 25, status: 200, endpoint: 'metar' })
  await usage.record('aviation-key', { bytes: 100, status: 200, endpoint: 'taf' })
  assert.deepEqual(usage.snapshot().keys[0].endpoints.map(({ label, bytes }) => [label, bytes]), [['taf', 100], ['metar', 25]])
})

test('rejects unknown endpoint identifiers without persisting query text or adding endpoint rows', async () => {
  await assert.rejects(() => usage.record('aviation-key', { bytes: 1, status: 200, endpoint: 'https://apihub.kma.go.kr/x?authKey=secret' }), { code: 'unknown_api_hub_endpoint' })
  assert.equal(usage.snapshot().keys[0].endpoints.length, 0)
})
```

- [ ] **Step 2: Run the ledger test to verify it fails**

Run: `npm --prefix backend test -- test/api-hub-usage.test.js`

Expected: FAIL because `api-hub-usage.js` and its interfaces do not exist.

- [ ] **Step 3: Implement the minimal ledger**

```js
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const LIMIT_BYTES = 5_000_000_000
const THRESHOLD_BYTES = 4_750_000_000

function kstDay(now = Date.now()) {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function fingerprint(key) {
  return createHash('sha256').update(key).digest('hex').slice(-8)
}
```

Use an in-memory serialization promise and atomic temporary-file rename for each ledger mutation. Define `API_HUB_ENDPOINTS` as the exhaustive fixed identifier-to-Korean-label map for the known KMA calls (aviation XML types, special warning, UV, KIM grid, KTG file, radar echo/graphics/QCD, GK2A IR/visible/fog/CI/CTPS, ground forecast, ASOS ceiling, lightning, and typhoon). Resolve an actual credential to a matching primary category before any access; throw `unknown_api_hub_credential` when it does not match aviation, radar/satellite, or KIM NWP. Reject any endpoint identifier absent from `API_HUB_ENDPOINTS` with `unknown_api_hub_endpoint` before persistence. Group matching categories by fingerprint; update only the allow-listed identifier within the same physical-key record on every response, and sort those endpoint aggregates by bytes only when producing the admin snapshot. Copy the aggregate usage into each configured category only when producing the snapshot. Keep only the current KST day and immediately previous day. A `403` sets `blockedReason: 'upstream_403'`; reaching the threshold sets `blockedReason: 'daily_budget'`.

- [ ] **Step 4: Run focused ledger tests**

Run: `npm --prefix backend test -- test/api-hub-usage.test.js`

Expected: PASS, including restart reload, 403, threshold, rollover, and secret-redaction assertions.

- [ ] **Step 5: Commit the ledger**

```bash
git add backend/src/api-hub-usage.js backend/src/config.js backend/test/api-hub-usage.test.js
git commit -m "feat: track API Hub usage by key"
```

### Task 2: Shared API Hub fetch boundary and complete KMA caller migration

**Files:**
- Create: `backend/src/lib/fetchApiHub.js`
- Create: `backend/test/fetch-api-hub.test.js`
- Modify: `backend/src/api-client.js`
- Modify: `backend/src/lib/fetchWithTimeout.js`
- Modify: `backend/src/processors/amos-processor.js`
- Modify: `backend/src/processors/asos-ceiling-processor.js`
- Modify: `backend/src/processors/convective-satellite-processor.js`
- Modify: `backend/src/processors/echo-top-processor.js`
- Modify: `backend/src/processors/environment-processor.js`
- Modify: `backend/src/processors/flight-category-processor.js`
- Modify: `backend/src/processors/ground-forecast-processor.js`
- Modify: `backend/src/processors/ktg-processor.js`
- Modify: `backend/src/processors/lightning-processor.js`
- Modify: `backend/src/processors/radar-echo-processor.js`
- Modify: `backend/src/processors/radar-graphics-processor.js`
- Modify: `backend/src/processors/satellite-processor.js`
- Modify: `backend/src/processors/satellite-visible-processor.js`
- Modify: `backend/src/processors/typhoon-processor.js`

**Interfaces:**
- `fetchApiHub({ credential, url, options, endpoint })` accepts only an `API_HUB_ENDPOINTS` identifier and returns a fresh readable `Response`, or throws an error with `code === 'api_hub_budget_blocked'`, `unknown_api_hub_credential`, or `unknown_api_hub_endpoint` before calling `fetch`.
- `fetchWithTimeout(url, timeoutMs, { signal, fetchImpl })` preserves the caller timeout/abort behavior while allowing `fetchApiHub` to be the supplied fetch implementation.
- Callers pass the exact credential used in their URL; it resolves only to `aviation`, `radar_satellite`, or `kim_nwp`.
- Existing parser and processor return contracts remain unchanged.

- [ ] **Step 1: Write failing wrapper tests**

```js
test('records exact response bytes and returns a readable replacement response', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(Uint8Array.from([1, 2, 3]), { status: 200 }))
  const response = await fetchApiHub({ credential: 'aviation-key', url: 'https://apihub.kma.go.kr/example', endpoint: 'metar' })
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3])
  assert.equal(usage.snapshot().keys[0].bytes, 3)
})

test('does not call fetch after the shared ledger blocked the key', async () => {
  await usage.record('radar_satellite', { bytes: 100, status: 200 })
  await assert.rejects(() => fetchApiHub({ credential: 'radar-key', url }), { code: 'api_hub_budget_blocked' })
  assert.equal(fetch.mock.callCount(), 0)
})

test('preserves timeout abort and does not retry a local budget block', async () => {
  await assert.rejects(() => fetchWithTimeout(url, 1, { fetchImpl: (input, options) => fetchApiHub({ credential: 'radar-key', url: input, options }) }))
})
```

- [ ] **Step 2: Run wrapper tests to verify they fail**

Run: `npm --prefix backend test -- test/fetch-api-hub.test.js`

Expected: FAIL because the wrapper does not exist.

- [ ] **Step 3: Implement the wrapper and migrate callers**

```js
export async function fetchApiHub({ credential, url, options = {}, endpoint }) {
  assertApiHubAllowed(credential)
  const upstream = await fetch(url, options)
  const body = await upstream.arrayBuffer()
  await recordApiHubResponse(credential, { bytes: body.byteLength, status: upstream.status, endpoint })
  return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers })
}
```

Route `api-client.js` standard aviation calls through the wrapper with `api.auth_key`, special warnings with `api.kma_special_warning_auth_key`, UV with `api.kma_uv_key`, KIM grid/KTG with `api.kim_nwp_auth_key`, and radar, satellite, CI, CTPS, QCD, and radar graphics with `api.radar_satellite_auth_key`; every caller uses its fixed `API_HUB_ENDPOINTS` identifier rather than a URL-derived label. Extend `fetchWithTimeout` so radar/satellite callers use the wrapper without losing their timeout/abort signal. Preserve the ground-forecast `https.request` fallback, but call `assertApiHubAllowed(api.auth_key)` before opening the request, then record the received buffer length and HTTP status with its fixed endpoint identifier; a 403 must set the same breaker before returning. Keep NOAA and non-KMA URLs on raw `fetch`. A local `api_hub_budget_blocked`, `unknown_api_hub_credential`, or `unknown_api_hub_endpoint` error is non-retryable.

- [ ] **Step 4: Run wrapper, processor, and scheduler regressions**

Run: `npm --prefix backend test -- test/fetch-api-hub.test.js test/api-hub-usage.test.js test/kim-scheduler.test.js test/radar-graphics-processor.test.js test/kim-surface-wind.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the fetch boundary**

```bash
git add backend/src/lib/fetchApiHub.js backend/src/api-client.js backend/src/processors backend/test/fetch-api-hub.test.js
git commit -m "feat: guard API Hub requests by daily budget"
```

### Task 3: Skip blocked-key collection work and expose the admin API

**Files:**
- Modify: `backend/src/index.js`
- Modify: `backend/src/stats.js`
- Modify: `backend/src/admin/router.js`
- Modify: `backend/test/kim-scheduler.test.js`
- Modify: `backend/test/stats.test.js`
- Modify: `backend/test/admin.test.js`

**Interfaces:**
- `runWithLock(type, job, { apiHubCategories })` checks `isApiHubCategoryBlocked` before starting a job whose supplied categories are all blocked, logs `skipped (API Hub key blocked)`, records `recordSkip(type, 'api_hub_key_blocked')`, and returns `{ skipped: 'api_hub_key_blocked' }`.
- `stats.recordSkip(type, reason)` records a successful skipped recent run with its reason, and `TYPES` contains every KMA job name passed to `runWithLock`.
- `GET /api/admin/api-hub-usage` returns `getApiHubUsage()` to authenticated admins only.

- [ ] **Step 1: Write failing scheduler and route tests**

```js
test('skips a radar-only cron job when the radar/satellite key is blocked', async () => {
  const result = await runWithLock('radar_echo', async () => assert.fail('must not run'), { apiHubCategories: ['radar_satellite'] })
  assert.deepEqual(result, { skipped: 'api_hub_key_blocked' })
})

test('records an API Hub skip as a non-failure recent run for every KMA collector type', () => {
  stats.recordSkip('wissdom', 'api_hub_key_blocked')
  const recent = stats.getStats().recent_runs[0]
  assert.deepEqual({ type: recent.type, success: recent.success, skipped: recent.skipped, reason: recent.reason }, { type: 'wissdom', success: true, skipped: true, reason: 'api_hub_key_blocked' })
})

test('API Hub usage endpoint requires an admin and returns safe usage fields', async () => {
  assert.equal((await fetch(at(server, '/api/admin/api-hub-usage')).status, 401)
  const body = await (await fetch(at(server, '/api/admin/api-hub-usage'), getWith(adminCookie))).json()
  assert.equal(body.keys.length, 3)
  assert.ok(body.keys.every((key) => !('credential' in key) && !('url' in key)))
  assert.ok(body.keys.every((key) => Array.isArray(key.endpoints) && key.endpoints.every((endpoint) => Object.keys(endpoint).every((field) => ['label', 'bytes', 'requests', 'successes', 'failures', 'lastCalledAt'].includes(field)))))
  assert.deepEqual(body.keys.find((key) => key.category === 'aviation').endpoints.map((endpoint) => endpoint.bytes), [100, 25])
  assert.deepEqual(body.keys.find((key) => key.category === 'kim_nwp').endpoints, [])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend test -- test/kim-scheduler.test.js test/admin.test.js`

Expected: FAIL because jobs have no key metadata and the new route is absent.

- [ ] **Step 3: Add job category metadata and route**

Add every missing `runWithLock` KMA type to `stats.TYPES` (including special warning, WISSDOM, QPF, HSR, HCI, satellite-visible, ASOS ceiling, terminal flights, and overseas forecast) and extend `recordSkip` to persist a successful `{ skipped: true, reason }` recent-run entry. Apply `aviation` to standard KMA aviation/observation jobs, `radar_satellite` to radar/graphics/satellite/Echo Top jobs, and `kim_nwp` to KIM/KTG jobs. Add at least one assertion for each category that a blocked job does not call its processor and an unrelated category still runs. Mixed-category jobs still enter the processor, where `fetchApiHub` independently prevents the blocked subrequest. Add the read-only admin route after the existing admin middleware.

- [ ] **Step 4: Run focused backend tests**

Run: `npm --prefix backend test -- test/api-hub-usage.test.js test/fetch-api-hub.test.js test/kim-scheduler.test.js test/admin.test.js`

Expected: PASS.

- [ ] **Step 5: Commit scheduler/API work**

```bash
git add backend/src/index.js backend/src/stats.js backend/src/admin/router.js backend/test/kim-scheduler.test.js backend/test/stats.test.js backend/test/admin.test.js
git commit -m "feat: expose API Hub budget status to admins"
```

### Task 4: `/admin` API Hub usage panel

**Files:**
- Create: `frontend/src/features/admin/ApiHubUsagePanel.jsx`
- Create: `frontend/src/features/admin/ApiHubUsagePanel.test.js`
- Modify: `frontend/src/features/admin/adminApi.js`
- Modify: `frontend/src/features/admin/AdminPage.jsx`
- Modify: `frontend/src/features/admin/AdminPage.css`

**Interfaces:**
- `getApiHubUsage()` fetches `/api/admin/api-hub-usage` with session credentials.
- `ApiHubUsagePanel` accepts `{ usage }`, renders exactly one accessible expandable row per category from `usage.keys`, and renders that category's safe endpoint aggregate rows only when expanded. `sortEndpointUsage(endpoints)` is a pure exported helper used by the component and unit test.

- [ ] **Step 1: Write the failing UI test**

```js
test('renders active, blocked, and unconfigured API Hub key rows without exposing a key', () => {
  const html = renderToStaticMarkup(<ApiHubUsagePanel usage={fixtureWithActiveBlockedAndUnconfiguredKeys} />)
  assert.match(html, /정상/)
  assert.match(html, /일일 한도 보호/)
  assert.match(html, /키 미설정/)
  assert.match(html, /자동 재개/)
  assert.doesNotMatch(html, /actual-secret-value/)
})

test('expands a key to show endpoint consumers ordered by bytes', () => {
  assert.deepEqual(sortEndpointUsage([{ label: 'GK2A IR', bytes: 50 }, { label: '레이더 QCD', bytes: 100 }]).map((row) => row.label), ['레이더 QCD', 'GK2A IR'])
})
```

- [ ] **Step 2: Run the frontend test to verify it fails**

Run: `npm --prefix frontend test -- src/features/admin/ApiHubUsagePanel.test.js`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the minimal panel**

```jsx
<section className="admin-card admin-api-hub-usage">
  <div className="admin-card-head"><h2>API Hub 사용량</h2></div>
  {usage.keys.map((key) => <ApiHubUsageRow key={key.category} usage={key} />)}
</section>
```

Load the usage endpoint alongside existing resource metrics only while the Resources tab is active; refresh it on the existing five-second admin poll. Each key summary is a native button with a deterministic `aria-controls="api-hub-endpoints-${category}"` and matching panel id; `aria-expanded` reflects React state. Expand/collapse must not navigate or reveal a credential. In the expanded body, render safe endpoint aggregates in received-byte descending order with bytes, request/success/failure counts, and last call. Format bytes as decimal GB, format timestamps in KST, distinguish `정상`, `일일 한도 보호`, `KMA 403 차단`, and `키 미설정`, and show the reset timestamp for blocked rows. Use existing `admin-gauge`/token patterns and add one narrow-screen layout rule.

- [ ] **Step 4: Run frontend tests and build**

Run: `npm --prefix frontend test -- src/features/admin/ApiHubUsagePanel.test.js && npm --prefix frontend run build`

Expected: PASS and a successful Vite production build.

- [ ] **Step 5: Commit the admin panel**

```bash
git add frontend/src/features/admin
git commit -m "feat: show API Hub key usage in admin"
```

### Task 5: End-to-end verification and controlled deployment

**Files:**
- Modify: none beyond Tasks 1-4 unless the implementation exposes a user-visible configuration value not covered by this approved specification.

- [ ] **Step 1: Run complete local verification**

Run: `npm --prefix backend test && npm --prefix frontend test && npm --prefix frontend run build && graphify update .`

Expected: all tests and build pass; graph output updates without source graph errors.

- [ ] **Step 2: Verify the browser contract**

Start the documented local server with an admin session, open `/admin`, select **서버 전산자원**, and use Playwright to capture evidence that all three rows, status text, progress bars, and the blocked reset text are visible at desktop and mobile widths. At desktop, tab to a key summary, press Enter, assert `aria-expanded="true"`, assert its controlled endpoint panel is visible and ordered by bytes, then press Enter again and assert the panel is hidden with `aria-expanded="false"`.

- [ ] **Step 3: Deploy safely**

Commit documentation, deploy one locked build via `deploy/deploy-vm.sh`, restart PM2, and verify `/api/health` plus authenticated `GET /api/admin/api-hub-usage`. Keep `KMA_RADAR_SATELLITE_ENABLED=0` until the next KST reset; after the reset, remove only that temporary flag, restart PM2, confirm a single radar/satellite response increments the new ledger, and verify no key is above the threshold.

- [ ] **Step 4: Commit final verification artifacts only when needed**

```bash
git add docs/superpowers
git commit -m "docs: record API Hub usage guard verification"
```

## Plan self-review

- Spec coverage: Tasks 1-3 implement byte metering, per-endpoint byte aggregation, 403/threshold circuit breaking, same-key aggregation, KST reset, persisted safe data, and scheduler skips. Task 4 implements the existing `/admin` expandable endpoint presentation. Task 5 verifies and deploys without bypassing the active emergency kill switch.
- Placeholder scan: no TBD/TODO or unspecified implementation/test instructions remain.
- Interface consistency: Tasks 2 and 3 consume the ledger interface defined in Task 1; Task 4 consumes exactly the safe response returned by Task 3.
