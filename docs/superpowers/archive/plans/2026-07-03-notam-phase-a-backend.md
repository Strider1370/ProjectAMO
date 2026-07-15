# NOTAM Phase A — Backend Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crawl 대한민국 유효 NOTAM(KML, 사이트 기본 24h 창) every 6h, parse to structured records, categorize by Q-code, and serve the latest snapshot at `GET /api/notam`.

> **Execution note (2026-07-03 spike result):** The KOCA form hard-caps the search window at 24h — `validateAndSearch()` silently clamps to-date to from+1day (verified for +2/+3/+7-day targets: field resets to next day, download B-max always = tomorrow). The original 7-day-window plan is **not achievable**; superseded by "site-default 24h window + 6h crawl interval." The crawler therefore does NOT touch the date fields — it just downloads the default. Real KML test fixture already captured at `backend/test/fixtures/notam-sample.kml`.

**Architecture:** New backend data type `notam` following the exact existing collector pattern (`EntryPoints.md` #5): Playwright crawler → parser → processor → `store.save('notam', ...)` → cron in `index.js` → route in `server.js`. In-memory + `latest.json` snapshot, newest-only (no history). This phase produces a working API and is independent of frontend/briefing phases.

**Tech Stack:** Node ESM, Express, `node-cron`, Playwright (new backend dependency), `node:test` + `node:assert/strict`.

## Global Constraints

- Node ESM only (`import`/`export`, `.js` extensions in imports). Every source file ends with both `export { ... }` and `export default { ... }` — match sibling files.
- Tests use `node --test` runner: `import { test } from 'node:test'` + `import assert from 'node:assert/strict'`. Run from `backend/`.
- No UTF-8-destroying writes (CLAUDE.md §6): use the editor's file tools, never PowerShell `Set-Content`/`>`.
- After any code change run `graphify update .` is NOT required mid-plan (post-commit git hook handles it).
- Category enum (fixed, from spec Q-code table): `prohibited` (RP) · `firing` (WM) · `danger` (RD) · `restricted` (RR/RT/RA) · `obstacle` (OB/PO) · `facility` (all other subject codes) · `other` (unmappable).
- Canonical `/api/notam` item shape (the contract Phases B & C consume — do not change field names):
  ```
  {
    id: 'G3315/26',            // Placemark id = NOTAM number
    series: 'G',               // first char of id
    location: 'RKSI',          // A) field ICAO (or FIR code e.g. RKRR)
    qcode: 'QGAXX',            // Q) line 5-letter code
    category: 'facility',      // enum above
    scope: 'airport' | 'fir',  // fir = nationwide (location in KOREA_FIR_CODES)
    valid_from: '2026-07-03T10:47:00.000Z',  // B) → UTC ISO
    valid_to:   '2026-07-04T11:08:00.000Z',  // C) → UTC ISO
    altitude: { lower: 0, upper: 999, unit: 'FL', ref: null } | { lower: 4000, upper: 6000, unit: 'FT', ref: 'AMSL' } | null,
    summary: 'GPS RAIM OUTAGES PREDICTED FOR NPA',  // E) field text
    rawText: 'GG RKZZNAXX\n...',                     // full original, untouched
    geometry: { type: 'Point'|'Polygon'|'LineString', coordinates: [...] } | null
  }
  ```
  Full payload: `{ fetched_at: ISO, horizon_hours: 24, items: [ ...above ] }` (site caps window at 24h).

---

### Task 1: Spike — determine the crawl window (DONE — result below)

**Files:**
- Create (throwaway): `backend/_spike-notam-7d.mjs`

**Interfaces:**
- Produces: the crawl-window decision. **RESULT: the KOCA form hard-caps the window at 24h** (`validateAndSearch()` clamps to-date to from+1day; verified for +2/+3/+7-day targets — field always resets to next day, download B-max always = tomorrow). Decision: crawler uses the site-default 24h window (no date manipulation), crawl every 6h. Task 2 is written accordingly.

- [ ] **Step 1: Install Playwright in backend**

```bash
cd backend
npm install playwright
npx playwright install chromium
```

- [ ] **Step 2: Write the spike script**

Create `backend/_spike-notam-7d.mjs`:
```javascript
// Throwaway. Delete after Task 1. Verifies 7-day window widening.
import { chromium } from 'playwright'

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ acceptDownloads: true })
const page = await ctx.newPage()
await page.goto('https://aim.koca.go.kr/xNotam/index.do?type=search2&language=ko_KR', { waitUntil: 'networkidle' })

const to = new Date(); to.setDate(to.getDate() + 7)
await page.fill('input[name="sch_to_date"]', ymd(to))
// Try clicking 검색 first (some KOCA forms require re-search before download reflects new dates)
await page.click('text=검색').catch(() => {})
await page.waitForTimeout(1500)

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('text=KML다운로드'),
])
const stream = await download.createReadStream()
let buf = ''
for await (const chunk of stream) buf += chunk.toString('utf8')
const count = (buf.match(/<Placemark id=/g) || []).length
console.log('[spike] end-date:', ymd(to), 'placemarks:', count, 'bytes:', buf.length)
await browser.close()
```

- [ ] **Step 3: Run the spike**

Run: `cd backend && node _spike-notam-7d.mjs`
Expected: prints a placemark count **noticeably higher** than the 24h baseline (baseline was 414). If count ≈ 414 or lower, the date widening did NOT take effect — note that in Task 2 you must click 검색 and wait for the results table to reload before clicking KML다운로드 (the spike already attempts 검색; if it still fails, capture the network POST and set the date on the hidden form directly).

- [ ] **Step 4: Delete the spike and commit the dependency**

The real KML test fixture already exists at `backend/test/fixtures/notam-sample.kml` (4 real placemarks: QGAXX Point+Polygon, QRDCA danger Polygon FIR-scope, QOBCE obstacle, QRDCA danger LineString — committed during planning against the actual site download). Task 3 derives its parser tests from this real file, not a hand-authored string. **If the spike reveals the KML shape has changed since planning, re-save the spike's downloaded KML over that fixture and re-derive Task 3's assertions.**

```bash
cd backend
rm -f _spike-notam-7d.mjs
git add package.json package-lock.json
git commit -m "chore(notam): add playwright dependency for NOTAM crawler"
```

---

### Task 2: NOTAM crawler (`notam-crawler.js`)

**Files:**
- Create: `backend/src/notam/notam-crawler.js`
- Test: `backend/test/notam-crawler.test.js`

**Interfaces:**
- Produces: `crawlNotamKml(): Promise<{ kml: string, fetchedAt: string }>` — launches headless Chromium, opens the KOCA page, clicks the KML다운로드 link (site's default 24h window — NO date manipulation), returns raw XML string + ISO fetch time. Throws on failure (caller in Task 4 catches).
- Consumes: `config.notam.timeout_ms`.

- [ ] **Step 1: Write the failing test (pure helper — browser part is integration, verified live in Task 6)**

The crawler's only pure, unit-testable piece is the KML sanity guard. Extract and test it. Create `backend/test/notam-crawler.test.js`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isKml } from '../src/notam/notam-crawler.js'

test('isKml: recognizes a KML payload', () => {
  assert.equal(isKml("<?xml version='1.0'?><kml xmlns='...'><Document/></kml>"), true)
  assert.equal(isKml('<html>error page</html>'), false)
  assert.equal(isKml(''), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/notam-crawler.test.js`
Expected: FAIL — cannot find `isKml` / module not found.

- [ ] **Step 3: Write the crawler**

The 검색 button is `<a class="btn-primary" onclick="validateAndSearch()">검색</a>` and KML link is `<a onclick="kmldownload()">KML다운로드</a>` — but we click NEITHER 검색 nor touch dates (the site's default page-load state already ran the 24h search). We only click KML다운로드. Create `backend/src/notam/notam-crawler.js`:
```javascript
import { chromium } from 'playwright'
import config from '../config.js'

const NOTAM_URL = 'https://aim.koca.go.kr/xNotam/index.do?type=search2&language=ko_KR'

export function isKml(text) {
  return typeof text === 'string' && text.includes('<kml')
}

// Downloads the KOCA "유효 NOTAM" KML in the site's default 24h window.
// The form hard-caps the window at 24h (validateAndSearch clamps to-date to from+1day),
// so we do NOT touch the date fields — the page-load default already ran the search.
export async function crawlNotamKml() {
  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({ acceptDownloads: true })
    const page = await ctx.newPage()
    await page.goto(NOTAM_URL, { waitUntil: 'networkidle', timeout: config.notam.timeout_ms })
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: config.notam.timeout_ms }),
      page.click('a:has-text("KML다운로드")'),
    ])
    const stream = await download.createReadStream()
    let kml = ''
    for await (const chunk of stream) kml += chunk.toString('utf8')
    if (!isKml(kml)) throw new Error('crawlNotamKml: response is not KML')
    return { kml, fetchedAt: new Date().toISOString() }
  } finally {
    await browser.close()
  }
}

export default { crawlNotamKml, isKml }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/notam-crawler.test.js`
Expected: PASS (1 test, 3 assertions).

- [ ] **Step 5: Commit**

```bash
git add backend/src/notam/notam-crawler.js backend/test/notam-crawler.test.js
git commit -m "feat(notam): headless KML crawler (site-default 24h window)"
```

---

### Task 3: NOTAM parser (`notam-parser.js`)

**Files:**
- Create: `backend/src/parsers/notam-parser.js`
- Test: `backend/test/notam-parser.test.js`

**Interfaces:**
- Produces:
  - `parseNotamKml(kml: string): RawRecord[]` — one entry per `<Placemark>`. Each: `{ id, series, location, qcode, validFrom, validTo, altitude, summary, rawText, geometry }` (category/scope added by Task 4). Broken placemarks skipped (try/catch per placemark), never throws.
  - `parseQcodeBand(qLine, fLine, gLine): { lower, upper, unit, ref } | null` — altitude band. F)/G) (with AGL/AMSL) preferred; else Q-line lower/upper as FL.
  - `dmsToIso(bcField: string): string | null` — B)/C) field `YYMMDDHHMM` (UTC per NOTAM spec) → ISO.
- Consumes: KML string from Task 2.

- [ ] **Step 1: Write the failing test (against the REAL committed fixture)**

The fixture `backend/test/fixtures/notam-sample.kml` contains 4 real placemarks. These assertions were verified by running the exact parser in Step 3 against that file — they are the frozen contract. Create `backend/test/notam-parser.test.js`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseNotamKml, parseQcodeBand, dmsToIso } from '../src/parsers/notam-parser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KML = fs.readFileSync(path.join(__dirname, 'fixtures', 'notam-sample.kml'), 'utf8')

test('dmsToIso: YYMMDDHHMM UTC → ISO', () => {
  assert.equal(dmsToIso('2607030928'), '2026-07-03T09:28:00.000Z')
  assert.equal(dmsToIso('bad'), null)
})

test('parseQcodeBand: F)/G) with AGL preserved', () => {
  assert.deepEqual(parseQcodeBand('x', 'SFC', '4920FT AGL'), { lower: 0, upper: 4920, unit: 'FT', ref: 'AGL' })
})

test('parseQcodeBand: falls back to Q-line FL band', () => {
  assert.deepEqual(parseQcodeBand('Q)RKRR/QGAXX/I/NBO/A/000/999/3459N12623E005', null, null), { lower: 0, upper: 999, unit: 'FL', ref: null })
})

test('parseNotamKml: 4 real records with correct fields', () => {
  const recs = parseNotamKml(KML)
  assert.equal(recs.length, 4)
  const byId = Object.fromEntries(recs.map((r) => [r.id, r]))

  // QGAXX GPS RAIM — prefers Polygon over the Point label-anchor
  const g = byId['G3301/26']
  assert.equal(g.series, 'G')
  assert.equal(g.location, 'RKJB')
  assert.equal(g.qcode, 'QGAXX')
  assert.equal(g.validFrom, '2026-07-03T09:28:00.000Z')
  assert.equal(g.validTo, '2026-07-05T10:57:00.000Z')
  assert.equal(g.geometry.type, 'Polygon')          // NOT 'Point' — MultiGeometry always has a Point anchor
  assert.deepEqual(g.altitude, { lower: 0, upper: 999, unit: 'FL', ref: null })
  assert.match(g.summary, /GPS RAIM OUTAGES PREDICTED FOR NPA/)

  // QRDCA danger, FIR-scope, F)SFC G)4920FT AGL — AGL preserved
  const d = byId['D0816/26']
  assert.equal(d.location, 'RKRR')
  assert.equal(d.qcode, 'QRDCA')
  assert.deepEqual(d.altitude, { lower: 0, upper: 4920, unit: 'FT', ref: 'AGL' })
  assert.equal(d.geometry.type, 'Polygon')

  // QOBCE obstacle — multi-line E) with many ')' still captured
  const o = byId['A0798/26']
  assert.equal(o.qcode, 'QOBCE')
  assert.match(o.summary, /TEMP OBST\(CRANES\)/)

  // QRDCA LineString (corridor danger area)
  const l = byId['D1181/26']
  assert.equal(l.geometry.type, 'LineString')
  assert.ok(l.geometry.coordinates.length >= 2)
  assert.deepEqual(l.altitude, { lower: 0, upper: 6561, unit: 'FT', ref: 'AGL' })
})

test('parseNotamKml: broken placemark skipped, others survive', () => {
  const broken = KML.replace('A)RKJB B)2607030928 C)2607051057', 'A)RKJB') // strip B)/C) from G3301
  const recs = parseNotamKml(broken)
  assert.equal(recs.length, 3) // 4 minus the broken one
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/notam-parser.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the parser**

Create `backend/src/parsers/notam-parser.js`. **Note the geometry order: Polygon → LineString → Point.** Real KOCA `<MultiGeometry>` always contains a `<Point>` label-anchor plus the actual area/line; Point-first would wrongly return the anchor for every polygon record (verified against the real fixture during planning).
```javascript
// KML (KOCA xNotam) → structured NOTAM records. No XML lib: KML fields are regex-extractable.
// CR line terminators in source; normalize to LF first.

export function dmsToIso(field) {
  if (!/^\d{10}$/.test(String(field || ''))) return null
  const s = String(field)
  const yy = 2000 + Number(s.slice(0, 2))
  const mo = Number(s.slice(2, 4)) - 1
  const dd = Number(s.slice(4, 6))
  const hh = Number(s.slice(6, 8))
  const mi = Number(s.slice(8, 10))
  const d = new Date(Date.UTC(yy, mo, dd, hh, mi))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// "4000FT AMSL" / "1500FT AGL" / "SFC" / "FL060" → { value:number, ref:'AMSL'|'AGL'|null, unit }
function parseHeightToken(tok) {
  if (!tok) return null
  const t = tok.trim().toUpperCase()
  if (t === 'SFC' || t === 'GND') return { value: 0, ref: 'AGL', unit: 'FT' }
  const fl = t.match(/^FL\s*(\d+)/)
  if (fl) return { value: Number(fl[1]), ref: null, unit: 'FL' }
  const ft = t.match(/(\d+)\s*FT\s*(AMSL|AGL)?/)
  if (ft) return { value: Number(ft[1]), ref: ft[2] || null, unit: 'FT' }
  return null
}

export function parseQcodeBand(qLine, fLine, gLine) {
  const f = parseHeightToken(fLine)
  const g = parseHeightToken(gLine)
  if (f && g) return { lower: f.value, upper: g.value, unit: f.unit, ref: f.ref || g.ref || null }
  // Q-line: .../lower/upper/coord — e.g. /000/999/3459N12623E005
  const m = String(qLine || '').match(/\/(\d{3})\/(\d{3})\/\d/)
  if (m) return { lower: Number(m[1]), upper: Number(m[2]), unit: 'FL', ref: null }
  return null
}

// Order matters: Polygon → LineString → Point. The Point in a KOCA MultiGeometry is the
// label anchor, not the affected area; only fall back to it when no polygon/line exists.
function extractGeometry(placemarkXml) {
  const poly = placemarkXml.match(/<Polygon>[\s\S]*?<LinearRing>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)
  if (poly) {
    const ring = poly[1].trim().split(/\s+/).map((tuple) => tuple.split(',').slice(0, 2).map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite))
    if (ring.length >= 4) return { type: 'Polygon', coordinates: [ring] }
  }
  const line = placemarkXml.match(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)
  if (line) {
    const coords = line[1].trim().split(/\s+/).map((tuple) => tuple.split(',').slice(0, 2).map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite))
    if (coords.length >= 2) return { type: 'LineString', coordinates: coords }
  }
  const pt = placemarkXml.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)
  if (pt) {
    const [lon, lat] = pt[1].trim().split(/[,\s]+/).map(Number)
    if (Number.isFinite(lon) && Number.isFinite(lat)) return { type: 'Point', coordinates: [lon, lat] }
  }
  return null
}

function parseOnePlacemark(xml) {
  const idMatch = xml.match(/<Placemark id='([A-Z]\d{4}\/\d{2})/)
  if (!idMatch) return null
  const id = idMatch[1]
  const cdata = xml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  const text = (cdata ? cdata[1] : '').replace(/<br\s*\/?>/gi, '\n').replace(/<h3>[\s\S]*?<\/h3>/i, '')
  const qLine = (text.match(/Q\)([^\n]+)/) || [])[0] || ''
  const qcode = (qLine.match(/Q\)[A-Z]{4}\/(Q[A-Z]{4})/) || [])[1] || null
  const location = (text.match(/A\)\s*([A-Z]{4})/) || [])[1] || null
  const bField = (text.match(/B\)\s*(\d{10})/) || [])[1] || null
  const cField = (text.match(/C\)\s*(\d{10})/) || [])[1] || null
  const validFrom = dmsToIso(bField)
  const validTo = dmsToIso(cField)
  if (!id || !location || !validFrom || !validTo) return null // required fields
  // F)SFC / F)4000FT AMSL — allow SFC/GND word or a number+unit token; stop before space or ')'
  const fField = (text.match(/F\)\s*(SFC|GND|[^\n G)]+)/) || [])[1] || null
  const gField = (text.match(/G\)\s*([^\n)]+)/) || [])[1] || null
  const summary = (text.match(/E\)\s*([\s\S]*?)(?:\n[FG]\)|\)?\s*$)/) || [])[1]?.trim().replace(/\)\s*$/, '') || ''
  return {
    id,
    series: id[0],
    location,
    qcode,
    validFrom,
    validTo,
    altitude: parseQcodeBand(qLine, fField, gField),
    summary,
    rawText: text.trim(),
    geometry: extractGeometry(xml),
  }
}

export function parseNotamKml(kml) {
  const lf = String(kml || '').replace(/\r/g, '\n')
  const placemarks = lf.split('<Placemark').slice(1).map((chunk) => '<Placemark' + chunk.split('</Placemark>')[0] + '</Placemark>')
  const out = []
  for (const pm of placemarks) {
    try {
      const rec = parseOnePlacemark(pm)
      if (rec) out.push(rec)
    } catch { /* skip broken placemark */ }
  }
  return out
}

export default { parseNotamKml, parseQcodeBand, dmsToIso }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/notam-parser.test.js`
Expected: PASS (5 tests). This parser + these assertions were verified against the real fixture during planning, so they should pass as written.

- [ ] **Step 5: Commit**

```bash
git add backend/src/parsers/notam-parser.js backend/test/notam-parser.test.js
git commit -m "feat(notam): KML parser with Q-code band + AGL/AMSL altitude"
```

---

### Task 4: NOTAM processor (`notam-processor.js`)

**Files:**
- Create: `backend/src/processors/notam-processor.js`
- Test: `backend/test/notam-processor.test.js`

**Interfaces:**
- Produces:
  - `categorize(qcode: string): string` — Q-code → category enum. Unmapped → `'other'`.
  - `deriveScope(location: string): 'airport' | 'fir'`.
  - `process(): Promise<{ type, saved, items, failed }>` — crawls (Task 2), parses (Task 3), adds `category`+`scope`, calls `store.save('notam', { fetched_at, horizon_days, items })`. On crawl/parse failure, keeps previous `latest.json` (returns `saved:false`).
- Consumes: `crawlNotamKml` (Task 2), `parseNotamKml` (Task 3), `store` (Task 5 registration), `config.notam`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/notam-processor.test.js`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categorize, deriveScope } from '../src/processors/notam-processor.js'

test('categorize: subject-code → category enum', () => {
  assert.equal(categorize('QRPCA'), 'prohibited')
  assert.equal(categorize('QWMLW'), 'firing')
  assert.equal(categorize('QRDCA'), 'danger')
  assert.equal(categorize('QRTCA'), 'restricted')
  assert.equal(categorize('QRRCA'), 'restricted')
  assert.equal(categorize('QRACA'), 'restricted')
  assert.equal(categorize('QOBCE'), 'obstacle')
  assert.equal(categorize('QPOCH'), 'obstacle')
  assert.equal(categorize('QGAXX'), 'facility') // GNSS facility
  assert.equal(categorize('QMRLC'), 'facility') // runway
  assert.equal(categorize('QZZZZ'), 'other')    // unmapped
  assert.equal(categorize(null), 'other')
})

test('deriveScope: FIR code vs airport', () => {
  assert.equal(deriveScope('RKRR'), 'fir')
  assert.equal(deriveScope('RKSI'), 'airport')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/notam-processor.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the processor**

Create `backend/src/processors/notam-processor.js`:
```javascript
import store from '../store.js'
import config from '../config.js'
import { crawlNotamKml } from '../notam/notam-crawler.js'
import { parseNotamKml } from '../parsers/notam-parser.js'

// Q-code 2nd/3rd letter (subject) → category. Facility-family subject codes are listed
// explicitly (spec Q-code table); genuinely unmapped/malformed codes → 'other'.
const SUBJECT_CATEGORY = {
  RP: 'prohibited',
  WM: 'firing',
  RD: 'danger',
  RR: 'restricted', RT: 'restricted', RA: 'restricted',
  OB: 'obstacle', PO: 'obstacle',
  GA: 'facility', GW: 'facility', IC: 'facility', IL: 'facility', IN: 'facility', IG: 'facility', ID: 'facility',
  NT: 'facility', CT: 'facility', CP: 'facility', CA: 'facility',
  MR: 'facility', MX: 'facility', MP: 'facility', MD: 'facility', MB: 'facility', MA: 'facility', LX: 'facility',
  FA: 'facility', PI: 'facility', PF: 'facility',
}
const KOREA_FIR_CODES = config.notam.fir_codes

export function categorize(qcode) {
  if (!qcode || !/^Q[A-Z]{4}$/.test(qcode)) return 'other'
  return SUBJECT_CATEGORY[qcode.slice(1, 3)] || 'other'
}

export function deriveScope(location) {
  return KOREA_FIR_CODES.includes(location) ? 'fir' : 'airport'
}

export async function process() {
  let crawled
  try {
    crawled = await crawlNotamKml()
  } catch (err) {
    return { type: 'notam', saved: false, reason: `crawl_failed: ${err.message}`, items: 0 }
  }
  const raw = parseNotamKml(crawled.kml)
  const items = raw.map((r) => ({
    id: r.id,
    series: r.series,
    location: r.location,
    qcode: r.qcode,
    category: categorize(r.qcode),
    scope: deriveScope(r.location),
    valid_from: r.validFrom,
    valid_to: r.validTo,
    altitude: r.altitude,
    summary: r.summary,
    rawText: r.rawText,
    geometry: r.geometry,
  }))
  if (items.length === 0) {
    return { type: 'notam', saved: false, reason: 'empty', items: 0 }
  }
  const result = { fetched_at: crawled.fetchedAt, horizon_hours: config.notam.horizon_hours, items }
  const saveResult = store.save('notam', result)
  return { type: 'notam', saved: saveResult.saved, items: items.length }
}

export default { process, categorize, deriveScope }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/notam-processor.test.js`
Expected: PASS (2 tests). (This runs without touching the network — only the pure helpers are tested.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/processors/notam-processor.js backend/test/notam-processor.test.js
git commit -m "feat(notam): processor with Q-code categorization + FIR scope"
```

---

### Task 5: Register `notam` type in store + config

**Files:**
- Modify: `backend/src/store.js:6` (TYPES array), `backend/src/store.js:7-23` (FILE_PREFIX), `backend/src/store.js:25-42` (cache object)
- Modify: `backend/src/config.js` (add `notam` block + `schedule.notam_interval`)
- Test: `backend/test/notam-store.test.js`

**Interfaces:**
- Produces: `store.save('notam', ...)` / `store.getCached('notam')` work without throwing; `config.notam` + `config.schedule.notam_interval` exist.
- Consumes: existing `store.js` save/rotate machinery.

- [ ] **Step 1: Write the failing test**

Create `backend/test/notam-store.test.js`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import config from '../src/config.js'
import store from '../src/store.js'

test('config.notam exists with 24h horizon', () => {
  assert.equal(config.notam.horizon_hours, 24)
  assert.ok(Array.isArray(config.notam.fir_codes))
  assert.ok(config.notam.fir_codes.includes('RKRR'))
  assert.equal(typeof config.schedule.notam_interval, 'string')
})

test("store.save('notam') does not throw (type registered)", () => {
  assert.doesNotThrow(() => store.save('notam', { fetched_at: new Date().toISOString(), horizon_hours: 24, items: [] }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/notam-store.test.js`
Expected: FAIL — `config.notam` undefined and/or `store.save` throws `Unsupported type: notam`.

- [ ] **Step 3: Register in store.js**

In `backend/src/store.js`, add `'notam'` to the `TYPES` array (line 6), add `notam: 'NOTAM'` to `FILE_PREFIX` (in the object at lines 7-23), and add `notam: { hash: null, prev_data: null },` to the `cache` object (lines 25-42).

**Warning — register in all three, especially `TYPES`.** The codebase has a latent partial-registration trap: `adsb` is in `cache` but NOT in `TYPES`. If you add `notam` to `cache` but forget `TYPES`, `getCached('notam')` silently works while `store.save('notam', ...)` throws `Unsupported type: notam` (`store.js:208`) — a failure that only surfaces at the live crawl in Task 6. Add to `TYPES` first.

- [ ] **Step 4: Add config block**

In `backend/src/config.js`, add before `export const schedule`:
```javascript
export const notam = {
  horizon_hours: 24, // site hard-caps the search window at 24h (validateAndSearch clamps)
  timeout_ms: Number(process.env.NOTAM_TIMEOUT_MS || 30000),
  fir_codes: (process.env.NOTAM_FIR_CODES || 'RKRR').split(','),
}
```
Add `notam_interval: '0 */6 * * *', // 6시간 주기(00,06,12,18 UTC)` to the `schedule` object, and add `notam,` to the `export default { ... }` object.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && node --test test/notam-store.test.js`
Expected: PASS (2 tests). Then run the full suite: `cd backend && node --test` — all existing tests still green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/store.js backend/src/config.js backend/test/notam-store.test.js
git commit -m "feat(notam): register notam type in store + config (24h horizon, 6h cron)"
```

---

### Task 6: Wire cron + API route

**Files:**
- Modify: `backend/src/index.js` (import, locks, schedule, initial collection)
- Modify: `backend/server.js:518` area (add route next to other `sendLatest` routes)

**Interfaces:**
- Produces: `GET /api/notam` returns the latest snapshot; daily cron runs `notamProcessor.process`; startup does one immediate collection.
- Consumes: `notamProcessor.process` (Task 4).

- [ ] **Step 1: Add the route (manual verification, no unit test — matches existing untested routes)**

In `backend/server.js`, directly after line 518 (`app.get('/api/takeoff-fcst', ...)`), add:
```javascript
app.get('/api/notam', (_, res) => sendLatest(res, 'notam'))
```

- [ ] **Step 2: Wire the cron + startup job in index.js**

In `backend/src/index.js`:
- Add import after line 21: `import notamProcessor from './processors/notam-processor.js'`
- Add `notam: false` to the `locks` object (line 25).
- Add to `buildInitialCollectionJobs` jobs array (after the `takeoff_fcst` entry, line 87): `["notam", notamProcessor.process],`
- Add in `main()` after line 118: `cron.schedule(config.schedule.notam_interval, () => runWithLock("notam", notamProcessor.process))`

- [ ] **Step 3: Verify the server boots and the route responds**

Run (from repo root, with servers not already on 3001):
```bash
npm.cmd run dev --prefix backend
```
In another shell (or after confirming startup logs show `notam:` collection ran):
```bash
curl -s http://127.0.0.1:3001/api/notam | head -c 300
```
Expected: JSON starting `{"fetched_at":"...","horizon_days":7,"items":[{...`. The startup log line `[<iso>] notam: { type: 'notam', saved: true, items: <N> }` confirms the crawl+parse+save chain. `N` should be in the hundreds (~400, 24h window). Stop the server (Ctrl+C) when confirmed.

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && node --test`
Expected: all tests PASS (existing + notam-crawler/parser/processor/store).

- [ ] **Step 5: Commit**

```bash
git add backend/src/index.js backend/server.js
git commit -m "feat(notam): daily cron + GET /api/notam route"
```

---

### Task 7: Update Architecture.md + EntryPoints.md

**Files:**
- Modify: `Architecture.md` (Backend File Roles section — add notam files)
- Modify: `EntryPoints.md` (optional: note NOTAM under pattern #5 as a concrete example)

- [ ] **Step 1: Add File Roles entries**

In `Architecture.md`, under the Backend list, add:
```markdown
- `backend/src/notam/notam-crawler.js` -> headless Playwright crawler for KOCA 유효 NOTAM KML (7-day window).
- `backend/src/parsers/notam-parser.js` -> KML -> structured NOTAM records (Q-code, B/C times, F)/G) altitude, geometry).
- `backend/src/processors/notam-processor.js` -> Q-code -> category/scope, crawl+parse orchestration, `store.save('notam')`.
- `backend/server.js` -> exposes `GET /api/notam` (latest NOTAM snapshot).
```

- [ ] **Step 2: Commit**

```bash
git add Architecture.md EntryPoints.md
git commit -m "docs(notam): Architecture.md file roles for NOTAM backend"
```

---

## Self-Review Notes

- **Spec coverage:** crawler(24h default) ✓ Task 1-2 · parser(Q-code/altitude/geometry) ✓ Task 3 · categorization+scope+severity-free ✓ Task 4 · store newest-only ✓ Task 5 · cron+API ✓ Task 6 · Architecture.md ✓ Task 7. Error handling (crawl fail → keep previous) ✓ Task 4 process(). `fetched_at` horizon disclosure ✓ (payload field, consumed by Phase B panel).
- **AGL/AMSL preserved** in `altitude.ref` ✓ Task 3.
- **No severity computed** in processor ✓ (spec compliance — color is a Phase B frontend concern).
- **Contract for Phases B/C:** the canonical item shape in Global Constraints is the frozen interface. Phase C's `matchItems` reuse maps `category`→`phenomenon_code`, `valid_from`/`valid_to`/`altitude`/`geometry` are already the names `matchItems` reads.
- **Open risk (unchanged from spec):** AWS EC2 Chromium viability unverified — flagged in spec Unresolved Risk; Task 1 spike only proves local.

## Deploy Gate (must clear before production deploy — do NOT skip)

Task 6 Step 3 only proves the crawler works on the local Windows dev box. Before deploying this to the EC2 production server (`3.34.113.37`, Amazon Linux), a human/agent must complete this checklist on the server, because Chromium headless has heavy system-lib dependencies and the site may block AWS IPs:

- [ ] SSH to the server; run `cd /opt/projectamo/current/backend && npx playwright install chromium --with-deps` — confirm it installs without missing-package errors (Amazon Linux uses `dnf`/`yum`, not `apt`; if `--with-deps` fails, install the libs manually).
- [ ] On the server, run the Task 1 spike script — confirm it downloads KML (not blocked by outbound-443 firewall or AWS-IP block; server is Seoul-region so an IP block is unlikely but unverified).
- [ ] Only if both pass, use `bash deploy/deploy-vm-full.sh` (full deploy — new `playwright` dependency requires it, not fast deploy). Confirm `curl http://127.0.0.1:3001/api/notam` returns items post-deploy.

If the crawl cannot run on EC2, the fallback is Phase A "B안" (separate crawler process/host) or a scheduled job elsewhere writing to the shared data path — out of scope for this plan, but the API/store/frontend layers are unaffected.
