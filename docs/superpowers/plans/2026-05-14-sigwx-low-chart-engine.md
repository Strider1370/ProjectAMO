# SIGWX Low Chart Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a verified SIGWX_LOW chart engine pipeline that collects paired XML/target-image samples, derives stable item classification rules, stores briefing-friendly phenomena data, and renders Mapbox SIGWX_LOW layers close to the KMA finished chart.

**Architecture:** Keep XML-derived source objects intact, derive semantic `phenomena` groups for briefing and vertical-profile use, then run a SIGWX-specific chart renderer over those phenomena. Special chart lines such as fronts and CB cloud scallops must be generated from `fpv_points` in the original chart coordinate space first, then projected into Mapbox features; KMA target PNGs are visual ground truth, not the app's data model.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing KMA API client/parser, Mapbox GL frontend layers, Sharp-backed existing front/cloud overlay generators.

---

## Scope Check

This plan covers one pipeline with five dependent stages: sample collection, item matrix extraction, semantic classification, render feature generation, and visual verification. Do not split these into unrelated feature branches because each stage depends on the previous stage's file format and fixtures.

## File Structure

- Create `backend/src/sigwx-low/sigwx-low-sample-urls.js`
  - Build deterministic KMA target-image URLs from `tmfc`.
  - Parse and validate `tmfc` strings.
- Create `backend/src/sigwx-low/sigwx-low-sample-store.js`
  - Save `source.xml`, `parsed.json`, `target.png`, and `manifest.json` under `reference/sigwx_low_samples/<tmfc>/`.
  - Avoid re-downloading existing valid files unless explicitly forced.
- Create `scripts/collect-sigwx-low-sample.js`
  - CLI for one or more `tmfc` values.
  - Calls existing `fetchSigwxLow()`, current parser, and target-image downloader.
- Create `scripts/sigwx-low-matrix.js`
  - Scans `reference/sigwx_low_samples/**/parsed.json`.
  - Emits observed item combinations and sample coverage to Markdown/JSON.
- Create `docs/SIGWX_LOW_Rendering_Matrix.md`
  - Human-reviewable mapping table from observed XML item combinations to semantic/render roles.
- Create `backend/src/sigwx-low/sigwx-low-classifier.js`
  - Converts parsed raw items into stable semantic roles.
  - Does not drop original item fields.
- Create `backend/src/sigwx-low/sigwx-low-phenomena.js`
  - Links boundaries, icons, labels, wind diamonds, and pressure/front child items into `phenomena`.
- Create `frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.js`
  - Converts `phenomena` into Mapbox GeoJSON feature collections.
- Modify `backend/src/parsers/sigwx-low-parser.js`
  - Preserve raw XML attributes needed for later semantic work, while keeping existing output compatibility.
- Modify `frontend/src/features/weather-overlays/lib/sigwxData.js`
  - Use `sigwxRenderFeatures.js` when `phenomena` exists; keep current item path as fallback.
- Create: `backend/src/sigwx-low/sigwx-low-chart-geometry.js`
  - Shared FPV-space geometry helpers for smoothing, sampling, tangent/normal calculation, and conversion back to lng/lat.
- Create: `backend/test/sigwx-low-line-symbols.test.js`
  - Locks down front/cloud symbol spacing, side offset, rotation, and FPV-to-lng/lat behavior before visual tuning.
- Modify `frontend/src/features/map/MapView.jsx`
  - Keep current layer IDs where possible; add only layer fields needed for multi-icon, text, wind diamond, and grouped overlay visibility.
- Test with `backend/test/sigwx-low-sample-urls.test.js`
- Test with `backend/test/sigwx-low-classifier.test.js`
- Test with `backend/test/sigwx-low-phenomena.test.js`
- Test with `frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.test.js`

---

### Task 1: Sample URL Builder

**Files:**
- Create: `backend/src/sigwx-low/sigwx-low-sample-urls.js`
- Test: `backend/test/sigwx-low-sample-urls.test.js`

- [ ] **Step 1: Write the failing URL tests**

Create `backend/test/sigwx-low-sample-urls.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSigwxLowTargetImageUrl,
  parseSigwxLowTmfc,
} from '../src/sigwx-low/sigwx-low-sample-urls.js'

test('parseSigwxLowTmfc extracts date parts from valid tmfc', () => {
  assert.deepEqual(parseSigwxLowTmfc('2026051411'), {
    tmfc: '2026051411',
    yyyy: '2026',
    mm: '05',
    dd: '14',
    hh: '11',
    yyyymm: '202605',
  })
})

test('buildSigwxLowTargetImageUrl uses the KMA static image pattern', () => {
  assert.equal(
    buildSigwxLowTargetImageUrl('2026051411'),
    'https://global.amo.go.kr/WEBDATA/JUN/ETC/IMG/202605/14/SIGWX_LOW_2026051411.png',
  )
})

test('parseSigwxLowTmfc rejects invalid tmfc values', () => {
  assert.throws(() => parseSigwxLowTmfc('20260514'), /Invalid SIGWX_LOW tmfc/)
  assert.throws(() => parseSigwxLowTmfc('2026051424'), /Invalid SIGWX_LOW tmfc/)
  assert.throws(() => parseSigwxLowTmfc('2026131411'), /Invalid SIGWX_LOW tmfc/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- backend/test/sigwx-low-sample-urls.test.js`

Expected: FAIL with module not found for `../src/sigwx-low/sigwx-low-sample-urls.js`.

- [ ] **Step 3: Implement the URL builder**

Create `backend/src/sigwx-low/sigwx-low-sample-urls.js`:

```js
const DEFAULT_SIGWX_LOW_IMAGE_BASE_URL = 'https://global.amo.go.kr/WEBDATA/JUN/ETC/IMG'

function assertTwoDigitRange(value, min, max, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`Invalid SIGWX_LOW tmfc: ${label} out of range`)
  }
}

export function parseSigwxLowTmfc(tmfc) {
  const text = String(tmfc || '').trim()
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/)
  if (!match) throw new Error('Invalid SIGWX_LOW tmfc: expected YYYYMMDDHH')

  const [, yyyy, mm, dd, hh] = match
  assertTwoDigitRange(mm, 1, 12, 'month')
  assertTwoDigitRange(dd, 1, 31, 'day')
  assertTwoDigitRange(hh, 0, 23, 'hour')

  return {
    tmfc: text,
    yyyy,
    mm,
    dd,
    hh,
    yyyymm: `${yyyy}${mm}`,
  }
}

export function buildSigwxLowTargetImageUrl(tmfc, baseUrl = DEFAULT_SIGWX_LOW_IMAGE_BASE_URL) {
  const parts = parseSigwxLowTmfc(tmfc)
  return `${String(baseUrl).replace(/\/$/, '')}/${parts.yyyymm}/${parts.dd}/SIGWX_LOW_${parts.tmfc}.png`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix backend -- backend/test/sigwx-low-sample-urls.test.js`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/sigwx-low/sigwx-low-sample-urls.js backend/test/sigwx-low-sample-urls.test.js
git commit -m "feat: add SIGWX low target image URL builder"
```

---

### Task 2: One-Shot Sample Collector

**Files:**
- Create: `backend/src/sigwx-low/sigwx-low-sample-store.js`
- Create: `scripts/collect-sigwx-low-sample.js`
- Test: `backend/test/sigwx-low-sample-store.test.js`
- Modify: `reference/sigwx_low_samples/2026051411/manifest.json` only if the test fixture changes require it.

- [ ] **Step 1: Write the failing sample-store tests**

Create `backend/test/sigwx-low-sample-store.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildSigwxLowSamplePaths,
  writeSigwxLowSampleManifest,
} from '../src/sigwx-low/sigwx-low-sample-store.js'

test('buildSigwxLowSamplePaths resolves the tmfc sample directory', () => {
  const root = path.join(os.tmpdir(), 'sigwx-low-sample-test')
  assert.deepEqual(buildSigwxLowSamplePaths(root, '2026051411'), {
    dir: path.join(root, '2026051411'),
    sourceXml: path.join(root, '2026051411', 'source.xml'),
    parsedJson: path.join(root, '2026051411', 'parsed.json'),
    targetPng: path.join(root, '2026051411', 'target.png'),
    manifestJson: path.join(root, '2026051411', 'manifest.json'),
  })
})

test('writeSigwxLowSampleManifest writes stable relative paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sigwx-low-manifest-'))
  const manifestPath = writeSigwxLowSampleManifest(root, {
    tmfc: '2026051411',
    imageUrl: 'https://global.amo.go.kr/WEBDATA/JUN/ETC/IMG/202605/14/SIGWX_LOW_2026051411.png',
    imageStatus: 'ok',
    xmlStatus: 'ok',
    parsedStatus: 'ok',
    captureMethod: 'direct-image-url',
  })
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.tmfc, '2026051411')
  assert.equal(manifest.sourceXmlPath, 'source.xml')
  assert.equal(manifest.parsedJsonPath, 'parsed.json')
  assert.equal(manifest.targetImagePath, 'target.png')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- backend/test/sigwx-low-sample-store.test.js`

Expected: FAIL with module not found for `sigwx-low-sample-store.js`.

- [ ] **Step 3: Implement sample-store helpers**

Create `backend/src/sigwx-low/sigwx-low-sample-store.js`:

```js
import fs from 'fs'
import path from 'path'

export function buildSigwxLowSamplePaths(rootDir, tmfc) {
  const dir = path.join(rootDir, String(tmfc))
  return {
    dir,
    sourceXml: path.join(dir, 'source.xml'),
    parsedJson: path.join(dir, 'parsed.json'),
    targetPng: path.join(dir, 'target.png'),
    manifestJson: path.join(dir, 'manifest.json'),
  }
}

export function writeSigwxLowSampleManifest(rootDir, options) {
  const paths = buildSigwxLowSamplePaths(rootDir, options.tmfc)
  fs.mkdirSync(paths.dir, { recursive: true })
  const manifest = {
    tmfc: String(options.tmfc),
    level: 'low',
    imageUrl: options.imageUrl,
    targetImagePath: 'target.png',
    parsedJsonPath: 'parsed.json',
    sourceXmlPath: 'source.xml',
    imageStatus: options.imageStatus,
    parsedStatus: options.parsedStatus,
    xmlStatus: options.xmlStatus,
    captureMethod: options.captureMethod,
    capturedAt: options.capturedAt || new Date().toISOString(),
    notes: options.notes || '',
  }
  fs.writeFileSync(paths.manifestJson, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return paths.manifestJson
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix backend -- backend/test/sigwx-low-sample-store.test.js`

Expected: PASS, 2 tests.

- [ ] **Step 5: Add the collector CLI**

Create `scripts/collect-sigwx-low-sample.js`:

```js
import fs from 'fs'
import path from 'path'
import { fetchSigwxLow } from '../backend/src/api-client.js'
import sigwxLowParser from '../backend/src/parsers/sigwx-low-parser.js'
import { buildSigwxLowTargetImageUrl } from '../backend/src/sigwx-low/sigwx-low-sample-urls.js'
import {
  buildSigwxLowSamplePaths,
  writeSigwxLowSampleManifest,
} from '../backend/src/sigwx-low/sigwx-low-sample-store.js'

const rootDir = path.resolve('reference', 'sigwx_low_samples')
const tmfcs = process.argv.slice(2)

if (tmfcs.length === 0) {
  console.error('Usage: node scripts/collect-sigwx-low-sample.js YYYYMMDDHH [YYYYMMDDHH...]')
  process.exit(1)
}

async function downloadImage(url, outputPath) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Image HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error('Downloaded target image is not a PNG')
  }
  fs.writeFileSync(outputPath, bytes)
}

for (const tmfc of tmfcs) {
  const paths = buildSigwxLowSamplePaths(rootDir, tmfc)
  fs.mkdirSync(paths.dir, { recursive: true })

  const xml = await fetchSigwxLow(tmfc, { maxRetries: 1 })
  fs.writeFileSync(paths.sourceXml, xml, 'utf8')

  const parsed = sigwxLowParser.parse(xml)
  fs.writeFileSync(paths.parsedJson, `${JSON.stringify({
    type: 'sigwx_low',
    tmfc,
    source: {
      mode: parsed.mode,
      map_range_mode: parsed.map_range_mode,
      amd_use: parsed.amd_use,
      amd_hour: parsed.amd_hour,
      amd_min: parsed.amd_min,
      amd_tar_low: parsed.amd_tar_low,
      fpv_safe_bound_width: parsed.fpv_safe_bound_width,
      fpv_safe_bound_height: parsed.fpv_safe_bound_height,
    },
    items: parsed.items,
  }, null, 2)}\n`, 'utf8')

  const imageUrl = buildSigwxLowTargetImageUrl(tmfc)
  await downloadImage(imageUrl, paths.targetPng)
  writeSigwxLowSampleManifest(rootDir, {
    tmfc,
    imageUrl,
    imageStatus: 'ok',
    parsedStatus: 'ok',
    xmlStatus: 'ok',
    captureMethod: 'direct-image-url',
    notes: 'Collected by scripts/collect-sigwx-low-sample.js.',
  })
  console.log(`Collected SIGWX_LOW sample ${tmfc}`)
}
```

- [ ] **Step 6: Run collector on the known sample**

Run: `node scripts/collect-sigwx-low-sample.js 2026051411`

Expected: `Collected SIGWX_LOW sample 2026051411`, and `reference/sigwx_low_samples/2026051411/source.xml`, `parsed.json`, `target.png`, `manifest.json` exist.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/src/sigwx-low/sigwx-low-sample-store.js backend/test/sigwx-low-sample-store.test.js scripts/collect-sigwx-low-sample.js reference/sigwx_low_samples/2026051411
git commit -m "feat: collect paired SIGWX low samples"
```

---

### Task 3: Item Combination Matrix

**Files:**
- Create: `scripts/sigwx-low-matrix.js`
- Create: `docs/SIGWX_LOW_Rendering_Matrix.md`
- Test: `backend/test/sigwx-low-matrix-fixture.test.js`

- [ ] **Step 1: Write the failing fixture matrix test**

Create `backend/test/sigwx-low-matrix-fixture.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'

test('2026051411 sample contains known rendering combinations', () => {
  const sample = JSON.parse(fs.readFileSync(path.resolve('reference/sigwx_low_samples/2026051411/parsed.json'), 'utf8'))
  const keys = new Set(sample.items.map((item) => [
    item.item_type,
    item.contour_name || '',
    item.item_name || '',
    item.icon_name || '',
    item.shape_type || '',
    item.line_type || '',
    item.is_close ? 'closed' : 'open',
  ].join(' | ')))

  assert.ok(keys.has('4 | freezing_level |  |  |  | 3 | open'))
  assert.ok(keys.has('4 | sfc_wind | l_wind |  |  | 1 | closed'))
  assert.ok(keys.has('8 | sfc_wind | wind_strong |  | diamond | 1 | open'))
  assert.ok(keys.has('4 | cld | cloud |  |  | 5 | closed'))
  assert.ok(keys.has('7 | mountain_obscu | mountain_obscuration | mountain_obscuration.png |  | 1 | open'))
})
```

- [ ] **Step 2: Run test to verify current fixture is usable**

Run: `npm test --prefix backend -- backend/test/sigwx-low-matrix-fixture.test.js`

Expected: PASS. If it fails because the sample is missing, run `node scripts/collect-sigwx-low-sample.js 2026051411` and rerun.

- [ ] **Step 3: Add the matrix scanner script**

Create `scripts/sigwx-low-matrix.js`:

```js
import fs from 'fs'
import path from 'path'

const samplesRoot = path.resolve('reference', 'sigwx_low_samples')
const outputPath = path.resolve('docs', 'SIGWX_LOW_Rendering_Matrix.md')

function listParsedSamples(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root)
    .map((tmfc) => ({ tmfc, parsedPath: path.join(root, tmfc, 'parsed.json') }))
    .filter((entry) => fs.existsSync(entry.parsedPath))
}

function matrixKey(item) {
  return [
    item.item_type,
    item.contour_name || '',
    item.item_name || '',
    item.icon_name || '',
    item.shape_type || '',
    item.line_type || '',
    item.is_close ? 'closed' : 'open',
  ].join(' | ')
}

const rows = new Map()
for (const sampleInfo of listParsedSamples(samplesRoot)) {
  const sample = JSON.parse(fs.readFileSync(sampleInfo.parsedPath, 'utf8'))
  for (const item of sample.items || []) {
    const key = matrixKey(item)
    const row = rows.get(key) || {
      count: 0,
      samples: new Set(),
      labels: new Set(),
      renderRole: 'unclassified',
      semanticRole: 'unclassified',
    }
    row.count += 1
    row.samples.add(sampleInfo.tmfc)
    const label = String(item.label || item.text_label || '').replace(/&#10;/g, ' / ').trim()
    if (label) row.labels.add(label)
    rows.set(key, row)
  }
}

const lines = [
  '# SIGWX_LOW Rendering Matrix',
  '',
  'This matrix is generated from paired SIGWX_LOW XML/PNG samples. Update `renderRole` and `semanticRole` manually after comparing each row against target chart images.',
  '',
  '| Count | Samples | Item Key | Example Labels | Semantic Role | Render Role |',
  '| ---: | ---: | --- | --- | --- | --- |',
]

for (const [key, row] of [...rows.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))) {
  lines.push(`| ${row.count} | ${row.samples.size} | \`${key}\` | ${[...row.labels].slice(0, 4).join('<br>')} | ${row.semanticRole} | ${row.renderRole} |`)
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
console.log(`Wrote ${outputPath}`)
```

- [ ] **Step 4: Generate the initial matrix**

Run: `node scripts/sigwx-low-matrix.js`

Expected: `docs/SIGWX_LOW_Rendering_Matrix.md` exists and includes the known `2026051411` rows.

- [ ] **Step 5: Manually classify the first known rows**

Modify `docs/SIGWX_LOW_Rendering_Matrix.md` rows for the known sample:

```markdown
| Count | Samples | Item Key | Example Labels | Semantic Role | Render Role |
| ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | `4 | freezing_level |  |  |  | 3 | open` | 0℃:100 | freezing-level | dashed-freezing-line |
| 1 | 1 | `4 | sfc_wind | l_wind |  |  | 1 | closed` | l_wind | strong-surface-wind-area | blue-wind-area-boundary |
| 1 | 1 | `8 | sfc_wind | wind_strong |  | diamond | 1 | open` | 30 | strong-surface-wind-speed | wind-diamond-label |
| 1 | 1 | `4 | cld | cloud |  |  | 5 | closed` | ISOL / EMBD / CB / XXX / 010 | cb-cloud-area | cloud-scallop-overlay-and-multiline-label |
```

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/sigwx-low-matrix.js backend/test/sigwx-low-matrix-fixture.test.js docs/SIGWX_LOW_Rendering_Matrix.md
git commit -m "docs: add SIGWX low rendering matrix"
```

---

### Task 4: Classifier

**Files:**
- Create: `backend/src/sigwx-low/sigwx-low-classifier.js`
- Test: `backend/test/sigwx-low-classifier.test.js`

- [ ] **Step 1: Write classifier tests for known combinations**

Create `backend/test/sigwx-low-classifier.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySigwxLowItem } from '../src/sigwx-low/sigwx-low-classifier.js'

test('classifies known SIGWX_LOW render roles', () => {
  assert.equal(classifySigwxLowItem({
    item_type: 4,
    contour_name: 'freezing_level',
    item_name: '',
    line_type: '3',
    is_close: false,
  }).renderRole, 'dashed-freezing-line')

  assert.equal(classifySigwxLowItem({
    item_type: 8,
    contour_name: 'sfc_wind',
    item_name: 'wind_strong',
    shape_type: 'diamond',
    label: '30',
  }).renderRole, 'wind-diamond-label')

  assert.equal(classifySigwxLowItem({
    item_type: 4,
    contour_name: 'cld',
    item_name: 'cloud',
    line_type: '5',
    is_close: true,
    label: 'ISOL&#10;EMBD&#10;CB&#10;XXX&#10;010',
  }).renderRole, 'cloud-scallop-boundary')
})

test('does not treat internal icon names as visible labels', () => {
  const result = classifySigwxLowItem({
    item_type: 7,
    contour_name: 'sfc_vis',
    item_name: 'widespread_fog',
    icon_name: 'widespread_fog.png',
    label: '',
    text_label: 'widespread_fog',
  })
  assert.equal(result.renderRole, 'icon-marker')
  assert.equal(result.visibleLabel, '')
})

test('keeps Korean place labels visible for mountain obscuration icons', () => {
  const result = classifySigwxLowItem({
    item_type: 7,
    contour_name: 'mountain_obscu',
    item_name: 'mountain_obscuration',
    icon_name: 'mountain_obscuration.png',
    label: '황병산',
    text_label: '황병산',
  })
  assert.equal(result.renderRole, 'icon-marker')
  assert.equal(result.visibleLabel, '황병산')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- backend/test/sigwx-low-classifier.test.js`

Expected: FAIL with module not found for `sigwx-low-classifier.js`.

- [ ] **Step 3: Implement classifier**

Create `backend/src/sigwx-low/sigwx-low-classifier.js`:

```js
function normalizeText(value) {
  return String(value || '').replace(/&#10;/g, ' ').replace(/\s+/g, ' ').trim()
}

function isInternalLabel(item, label) {
  const normalized = normalizeText(label).toLowerCase()
  if (!normalized) return true
  const itemName = String(item?.item_name || '').toLowerCase()
  const iconBase = String(item?.icon_name || '').replace(/\.[a-z0-9]+$/i, '').toLowerCase()
  return normalized === itemName || normalized === iconBase
}

export function classifySigwxLowItem(item) {
  const type = Number(item?.item_type)
  const contour = String(item?.contour_name || '').toLowerCase()
  const itemName = String(item?.item_name || '').toLowerCase()
  const lineType = String(item?.line_type || '')
  const shapeType = String(item?.shape_type || '').toLowerCase()
  const rawLabel = normalizeText(item?.label || item?.text_label || '')
  const visibleLabel = isInternalLabel(item, rawLabel) ? '' : rawLabel

  if (contour === 'font_line') {
    return { semanticRole: 'front', renderRole: 'front-overlay-source', visibleLabel }
  }
  if (type === 4 && contour === 'cld' && itemName === 'cloud' && lineType === '5') {
    return { semanticRole: 'cb-cloud-area', renderRole: 'cloud-scallop-boundary', visibleLabel: rawLabel }
  }
  if (type === 4 && contour === 'freezing_level') {
    return { semanticRole: 'freezing-level', renderRole: 'dashed-freezing-line', visibleLabel: rawLabel }
  }
  if (type === 8 && contour === 'sfc_wind' && itemName === 'wind_strong' && shapeType === 'diamond') {
    return { semanticRole: 'strong-surface-wind-speed', renderRole: 'wind-diamond-label', visibleLabel: rawLabel }
  }
  if (type === 12) {
    return { semanticRole: contour || 'sigwx', renderRole: 'multi-icon-marker', visibleLabel }
  }
  if (type === 7 && item?.icon_name) {
    return { semanticRole: contour || 'sigwx', renderRole: 'icon-marker', visibleLabel }
  }
  if (type === 10) {
    return { semanticRole: contour || 'text', renderRole: 'text-label', visibleLabel: rawLabel }
  }
  if (type === 4) {
    return { semanticRole: contour || 'area', renderRole: item?.is_close ? 'area-boundary' : 'line-boundary', visibleLabel }
  }
  return { semanticRole: contour || 'unknown', renderRole: 'unclassified', visibleLabel }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix backend -- backend/test/sigwx-low-classifier.test.js`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/sigwx-low/sigwx-low-classifier.js backend/test/sigwx-low-classifier.test.js
git commit -m "feat: classify SIGWX low item render roles"
```

---

### Task 5: Phenomena Linker

**Files:**
- Create: `backend/src/sigwx-low/sigwx-low-phenomena.js`
- Test: `backend/test/sigwx-low-phenomena.test.js`

- [ ] **Step 1: Write phenomena linking tests**

Create `backend/test/sigwx-low-phenomena.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { buildSigwxLowPhenomena } from '../src/sigwx-low/sigwx-low-phenomena.js'

test('links 2026051411 strong wind boundary and speed diamond into one phenomenon', () => {
  const sample = JSON.parse(fs.readFileSync(path.resolve('reference/sigwx_low_samples/2026051411/parsed.json'), 'utf8'))
  const phenomena = buildSigwxLowPhenomena(sample)
  const wind = phenomena.find((entry) => entry.semanticRole === 'strong-surface-wind-area')
  assert.ok(wind)
  assert.ok(wind.sourceItemIds.includes('sigwx-low-1'))
  assert.ok(wind.sourceItemIds.includes('sigwx-low-2'))
  assert.equal(wind.children.some((child) => child.renderRole === 'wind-diamond-label'), true)
})

test('keeps CB cloud area as one phenomenon with multiline label render data', () => {
  const sample = JSON.parse(fs.readFileSync(path.resolve('reference/sigwx_low_samples/2026051411/parsed.json'), 'utf8'))
  const phenomena = buildSigwxLowPhenomena(sample)
  const cloud = phenomena.find((entry) => entry.semanticRole === 'cb-cloud-area')
  assert.ok(cloud)
  assert.deepEqual(cloud.render.labelLines, ['ISOL', 'EMBD', 'CB', 'XXX', '010'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- backend/test/sigwx-low-phenomena.test.js`

Expected: FAIL with module not found for `sigwx-low-phenomena.js`.

- [ ] **Step 3: Implement minimal linker for known sample**

Create `backend/src/sigwx-low/sigwx-low-phenomena.js`:

```js
import { classifySigwxLowItem } from './sigwx-low-classifier.js'

function labelLines(value) {
  return String(value || '')
    .split(/&#10;|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function basePhenomenon(item, classification) {
  return {
    id: `phenomenon-${item.id}`,
    semanticRole: classification.semanticRole,
    renderRole: classification.renderRole,
    sourceItemIds: [item.id],
    primaryItemId: item.id,
    geometry: {
      latLngs: item.lat_lngs || [],
      fpvPoints: item.fpv_points || [],
      isClosed: Boolean(item.is_close),
    },
    render: {
      label: classification.visibleLabel,
      labelLines: labelLines(item.label || item.text_label),
      lineType: item.line_type || '',
      colorLine: item.color_line || '',
      colorBack: item.color_back || '',
    },
    children: [],
    raw: item,
  }
}

export function buildSigwxLowPhenomena(sample) {
  const items = Array.isArray(sample?.items) ? sample.items : []
  const classified = items.map((item) => ({ item, classification: classifySigwxLowItem(item) }))
  const phenomena = []
  const usedChildIds = new Set()

  for (const entry of classified) {
    const { item, classification } = entry
    if (usedChildIds.has(item.id)) continue

    if (classification.renderRole === 'wind-diamond-label') continue

    const phenomenon = basePhenomenon(item, classification)
    if (classification.semanticRole === 'strong-surface-wind-area' || (
      Number(item.item_type) === 4
      && String(item.contour_name || '').toLowerCase() === 'sfc_wind'
      && String(item.item_name || '').toLowerCase() === 'l_wind'
    )) {
      phenomenon.semanticRole = 'strong-surface-wind-area'
      for (const child of classified) {
        if (child.classification.renderRole === 'wind-diamond-label') {
          phenomenon.children.push({
            id: child.item.id,
            renderRole: child.classification.renderRole,
            label: child.classification.visibleLabel,
            geometry: {
              latLngs: child.item.lat_lngs || [],
              fpvPoints: child.item.fpv_points || [],
            },
            raw: child.item,
          })
          phenomenon.sourceItemIds.push(child.item.id)
          usedChildIds.add(child.item.id)
        }
      }
    }
    phenomena.push(phenomenon)
  }

  return phenomena
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix backend -- backend/test/sigwx-low-phenomena.test.js`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/sigwx-low/sigwx-low-phenomena.js backend/test/sigwx-low-phenomena.test.js
git commit -m "feat: link SIGWX low items into phenomena"
```

---

### Task 6: Parser Output V2 Without Breaking Existing Consumers

**Files:**
- Modify: `backend/src/processors/sigwx-low-processor.js`
- Test: `backend/test/sigwx-low-processor-shape.test.js`

- [ ] **Step 1: Write output-shape test**

Create `backend/test/sigwx-low-processor-shape.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import sigwxLowParser from '../src/parsers/sigwx-low-parser.js'
import { buildSigwxLowPhenomena } from '../src/sigwx-low/sigwx-low-phenomena.js'

test('sample output can include phenomena while preserving items', () => {
  const xml = fs.readFileSync(path.resolve('reference/sigwx_low_samples/2026051411/source.xml'), 'utf8')
  const parsed = sigwxLowParser.parse(xml)
  const output = {
    type: 'sigwx_low',
    tmfc: '2026051411',
    source: {
      mode: parsed.mode,
      map_range_mode: parsed.map_range_mode,
      fpv_safe_bound_width: parsed.fpv_safe_bound_width,
      fpv_safe_bound_height: parsed.fpv_safe_bound_height,
    },
    items: parsed.items,
    phenomena: buildSigwxLowPhenomena({ items: parsed.items }),
    parserVersion: 'sigwx-low-parser-v2',
  }

  assert.equal(output.items.length, 13)
  assert.ok(output.phenomena.length > 0)
  assert.equal(output.parserVersion, 'sigwx-low-parser-v2')
})
```

- [ ] **Step 2: Run test**

Run: `npm test --prefix backend -- backend/test/sigwx-low-processor-shape.test.js`

Expected: PASS after Task 5 exists.

- [ ] **Step 3: Add phenomena to processor result**

Modify `backend/src/processors/sigwx-low-processor.js`:

```js
import { buildSigwxLowPhenomena } from '../sigwx-low/sigwx-low-phenomena.js'
```

Then include these fields in `result`:

```js
    items: parsed.items,
    phenomena: buildSigwxLowPhenomena({ items: parsed.items, source: parsed }),
    parserVersion: "sigwx-low-parser-v2",
```

Keep `items` unchanged so current frontend fallback remains safe.

- [ ] **Step 4: Run backend tests**

Run: `npm test --prefix backend`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/processors/sigwx-low-processor.js backend/test/sigwx-low-processor-shape.test.js
git commit -m "feat: add SIGWX low phenomena output"
```

---

### Task 7: Frontend Render Features From Phenomena

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.js`
- Test: `frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/sigwxData.js`

- [ ] **Step 1: Write render-feature test**

Create `frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.test.js` using `node:test`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { phenomenaToSigwxRenderFeatures } from './sigwxRenderFeatures.js'

test('converts wind phenomenon child into icon feature', () => {
  const data = phenomenaToSigwxRenderFeatures({
    phenomena: [{
      id: 'phenomenon-sigwx-low-1',
      semanticRole: 'strong-surface-wind-area',
      renderRole: 'area-boundary',
      geometry: {
        latLngs: [[35, 129], [34, 128], [33, 127]],
        isClosed: true,
      },
      render: {
        colorLine: '#0000ff',
        lineType: '1',
      },
      children: [{
        id: 'sigwx-low-2',
        renderRole: 'wind-diamond-label',
        label: '30',
        geometry: { latLngs: [[33.7, 127.6], [33.3, 128.7]] },
      }],
    }],
  })

  assert.equal(data.polygons.features.length, 1)
  assert.equal(data.windDiamonds.features.length, 1)
  assert.equal(data.windDiamonds.features[0].properties.label, '30')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement render feature converter**

Create `frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.js`:

```js
function lngLatCoords(latLngs) {
  return (latLngs || [])
    .filter((point) => Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]))
    .map(([lat, lon]) => [lon, lat])
}

function center(coords) {
  if (!coords.length) return null
  return [
    coords.reduce((sum, point) => sum + point[0], 0) / coords.length,
    coords.reduce((sum, point) => sum + point[1], 0) / coords.length,
  ]
}

export function phenomenaToSigwxRenderFeatures(payload) {
  const polygons = []
  const lines = []
  const labels = []
  const icons = []
  const windDiamonds = []

  for (const phenomenon of payload?.phenomena || []) {
    const coords = lngLatCoords(phenomenon.geometry?.latLngs)
    if (coords.length >= 2) {
      const properties = {
        id: phenomenon.id,
        semanticRole: phenomenon.semanticRole,
        renderRole: phenomenon.renderRole,
        colorLine: phenomenon.render?.colorLine || '#111827',
        lineType: phenomenon.render?.lineType || '1',
      }
      if (phenomenon.geometry?.isClosed && coords.length >= 3) {
        polygons.push({
          type: 'Feature',
          properties,
          geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
        })
      } else {
        lines.push({
          type: 'Feature',
          properties,
          geometry: { type: 'LineString', coordinates: coords },
        })
      }
    }

    for (const child of phenomenon.children || []) {
      const childCoords = lngLatCoords(child.geometry?.latLngs)
      const point = center(childCoords)
      if (!point) continue
      if (child.renderRole === 'wind-diamond-label') {
        windDiamonds.push({
          type: 'Feature',
          properties: {
            id: child.id,
            label: child.label || '',
            parentId: phenomenon.id,
          },
          geometry: { type: 'Point', coordinates: point },
        })
      }
    }
  }

  return {
    polygons: { type: 'FeatureCollection', features: polygons },
    lines: { type: 'FeatureCollection', features: lines },
    labels: { type: 'FeatureCollection', features: labels },
    icons: { type: 'FeatureCollection', features: icons },
    windDiamonds: { type: 'FeatureCollection', features: windDiamonds },
  }
}
```

- [ ] **Step 4: Run render-feature test**

Run: `node --test frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.test.js`

Expected: PASS.

- [ ] **Step 5: Wire fallback in `sigwxData.js`**

Modify `frontend/src/features/weather-overlays/lib/sigwxData.js`:

```js
import { phenomenaToSigwxRenderFeatures } from './sigwxRenderFeatures.js'
```

At the top of `sigwxLowToMapboxData(payload, options = {})`, add:

```js
  if (Array.isArray(payload?.phenomena) && payload.phenomena.length > 0) {
    const renderData = phenomenaToSigwxRenderFeatures(payload, options)
    return {
      ...renderData,
      arrowLabels: { type: 'FeatureCollection', features: [] },
      textChips: { type: 'FeatureCollection', features: [] },
      iconImages: [],
      groups: payload.phenomena.map((phenomenon) => ({
        mapKey: phenomenon.id,
        label: phenomenon.semanticRole,
        contour: phenomenon.semanticRole,
        filterKey: phenomenon.semanticRole.includes('wind') ? 'wind' : 'pressure',
        overlayRole: phenomenon.semanticRole.includes('cloud') ? 'cloud' : null,
        memberCount: phenomenon.sourceItemIds?.length || 1,
        lineColor: phenomenon.render?.colorLine || '#111827',
        hidden: false,
        enabledByFilter: true,
      })),
    }
  }
```

- [ ] **Step 6: Run frontend build**

Run: `npm run build --prefix frontend`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.js frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.test.js frontend/src/features/weather-overlays/lib/sigwxData.js
git commit -m "feat: derive SIGWX low render features from phenomena"
```

---

### Task 8: FPV-Based Front And Cloud Chart-Line Engine

**Files:**
- Create: `backend/src/sigwx-low/sigwx-low-chart-geometry.js`
- Test: `backend/test/sigwx-low-line-symbols.test.js`
- Create: `backend/src/sigwx-low/sigwx-low-special-lines.js`
- Test: `backend/test/sigwx-low-special-lines.test.js`
- Modify: `backend/src/parsers/sigwx-front-overlay.js`
- Modify: `backend/src/parsers/sigwx-cloud-overlay.js`
- Modify: `frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.js`
- Modify: `docs/SIGWX_LOW_Rendering_Matrix.md`

- [ ] **Step 1: Write deterministic FPV geometry tests**

Create `backend/test/sigwx-low-line-symbols.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fpvPointToLngLat,
  samplePolylineByDistance,
  offsetSamplesFromPolygon,
} from '../src/sigwx-low/sigwx-low-chart-geometry.js'

test('fpvPointToLngLat maps original chart coordinates to SIGWX normal bounds', () => {
  assert.deepEqual(fpvPointToLngLat({ x: 0, y: 0 }, {
    map_range_mode: 'normal',
    fpv_safe_bound_width: 740,
    fpv_safe_bound_height: 730,
  }), [121, 39])

  assert.deepEqual(fpvPointToLngLat({ x: 740, y: 730 }, {
    map_range_mode: 'normal',
    fpv_safe_bound_width: 740,
    fpv_safe_bound_height: 730,
  }), [135, 27.5])
})

test('samplePolylineByDistance returns stable symbol placements along a line', () => {
  const samples = samplePolylineByDistance([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 200, y: 0 },
  ], { offset: 50, repeat: 75 })

  assert.deepEqual(samples.map((sample) => ({
    x: Math.round(sample.x),
    y: Math.round(sample.y),
    angle: Math.round(sample.angle),
  })), [
    { x: 50, y: 0, angle: 0 },
    { x: 125, y: 0, angle: 0 },
  ])
})

test('offsetSamplesFromPolygon offsets cloud scallops outward consistently', () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]
  const samples = [{ x: 50, y: 0, angle: 0 }]
  const shifted = offsetSamplesFromPolygon(samples, polygon, 18)
  assert.equal(Math.round(shifted[0].x), 50)
  assert.equal(Math.round(shifted[0].y), 18)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- backend/test/sigwx-low-line-symbols.test.js`

Expected: FAIL with module not found for `sigwx-low-chart-geometry.js`.

- [ ] **Step 3: Implement FPV-space chart geometry helpers**

Create `backend/src/sigwx-low/sigwx-low-chart-geometry.js`:

```js
const SIGWX_MAP_RANGES = {
  normal: { minLat: 27.5, maxLat: 39, minLon: 121, maxLon: 135 },
  wide: { minLat: 27.3, maxLat: 44, minLon: 119, maxLon: 135 },
}

export function fpvPointToLngLat(point, source) {
  const width = Number(source?.fpv_safe_bound_width)
  const height = Number(source?.fpv_safe_bound_height)
  const range = SIGWX_MAP_RANGES[String(source?.map_range_mode || 'normal')] || SIGWX_MAP_RANGES.normal
  const x = Number(point?.x)
  const y = Number(point?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width === 0 || height === 0) {
    return null
  }
  const lon = range.minLon + (x / width) * (range.maxLon - range.minLon)
  const lat = range.maxLat - (y / height) * (range.maxLat - range.minLat)
  return [lon, lat]
}

function segmentLength(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt((dx * dx) + (dy * dy))
}

export function samplePolylineByDistance(points, options = {}) {
  const offset = Number(options.offset ?? 0)
  const repeat = Number(options.repeat ?? 1)
  if (!Array.isArray(points) || points.length < 2 || repeat <= 0) return []

  const segments = []
  let totalLength = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const length = segmentLength(a, b)
    if (length <= 0.0001) continue
    segments.push({
      a,
      b,
      dx: b.x - a.x,
      dy: b.y - a.y,
      length,
      start: totalLength,
      end: totalLength + length,
    })
    totalLength += length
  }

  const samples = []
  for (let distance = offset; distance < totalLength; distance += repeat) {
    const segment = segments.find((entry) => distance >= entry.start && distance <= entry.end)
    if (!segment) continue
    const local = distance - segment.start
    const ratio = local / segment.length
    samples.push({
      x: segment.a.x + (segment.dx * ratio),
      y: segment.a.y + (segment.dy * ratio),
      angle: Math.atan2(segment.dy, segment.dx) * (180 / Math.PI),
    })
  }
  return samples
}

export function polygonSignedArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += (a.x * b.y) - (b.x * a.y)
  }
  return area / 2
}

export function offsetSamplesFromPolygon(samples, polygon, offset) {
  const isClockwise = polygonSignedArea(polygon) < 0
  return samples.map((sample) => {
    const rad = (sample.angle * Math.PI) / 180
    const nx = isClockwise ? Math.sin(rad) : -Math.sin(rad)
    const ny = isClockwise ? -Math.cos(rad) : Math.cos(rad)
    return {
      ...sample,
      x: sample.x + (nx * offset),
      y: sample.y + (ny * offset),
      nx,
      ny,
    }
  })
}
```

- [ ] **Step 4: Run geometry tests**

Run: `npm test --prefix backend -- backend/test/sigwx-low-line-symbols.test.js`

Expected: PASS, 3 tests.

- [ ] **Step 5: Write special-line renderer tests for front/cloud symbol features**

Create `backend/test/sigwx-low-special-lines.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSigwxSpecialLineFeatures } from '../src/sigwx-low/sigwx-low-special-lines.js'

const source = {
  map_range_mode: 'normal',
  fpv_safe_bound_width: 740,
  fpv_safe_bound_height: 730,
}

test('builds cold front line and triangle symbol features from FPV points', () => {
  const result = buildSigwxSpecialLineFeatures({
    source,
    items: [{
      id: 'front-1',
      item_type: 4,
      contour_name: 'font_line',
      item_name: 'fl_cold',
      line_type: '302',
      fpv_points: [{ x: 100, y: 100 }, { x: 300, y: 100 }],
      color_line: '#0000ff',
    }],
  })

  assert.equal(result.lines.features.length, 1)
  assert.equal(result.symbols.features.length > 0, true)
  assert.equal(result.symbols.features[0].properties.symbolType, 'cold-front-triangle')
  assert.equal(Number.isFinite(result.symbols.features[0].properties.rotation), true)
})

test('builds CB cloud scallop symbol features outside the cloud polygon', () => {
  const result = buildSigwxSpecialLineFeatures({
    source,
    items: [{
      id: 'cloud-1',
      item_type: 4,
      contour_name: 'cld',
      item_name: 'cloud',
      line_type: '5',
      is_close: true,
      label: 'ISOL&#10;EMBD&#10;CB&#10;XXX&#10;010',
      fpv_points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 },
      ],
      color_line: '#a52a2a',
    }],
  })

  assert.equal(result.lines.features.length, 1)
  assert.equal(result.symbols.features.length > 0, true)
  assert.equal(result.symbols.features[0].properties.symbolType, 'cloud-scallop')
  assert.deepEqual(result.labels.features[0].properties.labelLines, ['ISOL', 'EMBD', 'CB', 'XXX', '010'])
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test --prefix backend -- backend/test/sigwx-low-special-lines.test.js`

Expected: FAIL with module not found for `sigwx-low-special-lines.js`.

- [ ] **Step 7: Implement FPV-based special-line feature generation**

Create `backend/src/sigwx-low/sigwx-low-special-lines.js`:

```js
import {
  fpvPointToLngLat,
  offsetSamplesFromPolygon,
  samplePolylineByDistance,
} from './sigwx-low-chart-geometry.js'

const FRONT_SYMBOLS = {
  fl_cold: { symbolType: 'cold-front-triangle', color: '#2563eb', offset: 56, repeat: 132 },
  fl_worm: { symbolType: 'warm-front-semicircle', color: '#dc2626', offset: 56, repeat: 132 },
  fl_occl: { symbolType: 'occluded-front-alternating', color: '#7c3aed', offset: 56, repeat: 132 },
  fl_stat: { symbolType: 'stationary-front-alternating', color: '#2563eb', offset: 56, repeat: 132 },
}

function labelLines(value) {
  return String(value || '')
    .split(/&#10;|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function fpvCoords(item) {
  return (item.fpv_points || [])
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
}

function lngLatLine(points, source) {
  return points.map((point) => fpvPointToLngLat(point, source)).filter(Boolean)
}

function isCloudLine(item) {
  return String(item?.contour_name || '').toLowerCase() === 'cld'
    && String(item?.item_name || '').toLowerCase() === 'cloud'
    && String(item?.line_type || '') === '5'
}

function isFrontLine(item) {
  return String(item?.contour_name || '').toLowerCase() === 'font_line'
    && FRONT_SYMBOLS[String(item?.item_name || '').toLowerCase()]
}

export function buildSigwxSpecialLineFeatures(payload) {
  const source = payload?.source || {}
  const lines = []
  const symbols = []
  const labels = []

  for (const item of payload?.items || []) {
    const points = fpvCoords(item)
    if (points.length < 2) continue

    if (isFrontLine(item)) {
      const config = FRONT_SYMBOLS[String(item.item_name).toLowerCase()]
      const coordinates = lngLatLine(points, source)
      if (coordinates.length >= 2) {
        lines.push({
          type: 'Feature',
          properties: {
            id: item.id,
            sourceItemId: item.id,
            renderRole: 'front-special-line',
            colorLine: config.color,
          },
          geometry: { type: 'LineString', coordinates },
        })
      }
      samplePolylineByDistance(points, config).forEach((sample, index) => {
        const coordinates = fpvPointToLngLat(sample, source)
        if (!coordinates) return
        symbols.push({
          type: 'Feature',
          properties: {
            id: `${item.id}-front-symbol-${index}`,
            sourceItemId: item.id,
            symbolType: config.symbolType,
            rotation: sample.angle,
            colorLine: config.color,
          },
          geometry: { type: 'Point', coordinates },
        })
      })
      continue
    }

    if (isCloudLine(item)) {
      const closedPoints = item.is_close ? [...points, points[0]] : points
      const coordinates = lngLatLine(closedPoints, source)
      if (coordinates.length >= 2) {
        lines.push({
          type: 'Feature',
          properties: {
            id: item.id,
            sourceItemId: item.id,
            renderRole: 'cloud-special-line',
            colorLine: item.color_line || '#a52a2a',
          },
          geometry: { type: item.is_close ? 'Polygon' : 'LineString', coordinates: item.is_close ? [coordinates] : coordinates },
        })
      }
      const cloudSamples = offsetSamplesFromPolygon(
        samplePolylineByDistance(closedPoints, { offset: 44, repeat: 46 }),
        points,
        18,
      )
      cloudSamples.forEach((sample, index) => {
        const coordinates = fpvPointToLngLat(sample, source)
        if (!coordinates) return
        symbols.push({
          type: 'Feature',
          properties: {
            id: `${item.id}-cloud-scallop-${index}`,
            sourceItemId: item.id,
            symbolType: 'cloud-scallop',
            rotation: sample.angle,
            colorLine: item.color_line || '#a52a2a',
          },
          geometry: { type: 'Point', coordinates },
        })
      })
      const rawLines = labelLines(item.label || item.text_label)
      if (rawLines.length > 0) {
        const labelPoint = fpvPointToLngLat(item.rect_label
          ? { x: item.rect_label.left + (item.rect_label.width / 2), y: item.rect_label.top + (item.rect_label.height / 2) }
          : points[0], source)
        if (labelPoint) {
          labels.push({
            type: 'Feature',
            properties: {
              id: `${item.id}-cloud-label`,
              sourceItemId: item.id,
              label: rawLines.join('\n'),
              labelLines: rawLines,
            },
            geometry: { type: 'Point', coordinates: labelPoint },
          })
        }
      }
    }
  }

  return {
    lines: { type: 'FeatureCollection', features: lines },
    symbols: { type: 'FeatureCollection', features: symbols },
    labels: { type: 'FeatureCollection', features: labels },
  }
}
```

- [ ] **Step 8: Run FPV special-line tests**

Run:

```bash
npm test --prefix backend -- backend/test/sigwx-low-line-symbols.test.js backend/test/sigwx-low-special-lines.test.js
```

Expected: PASS.

- [ ] **Step 9: Keep old whole-layer PNG renderers as reference/fallback only**

Modify `backend/src/parsers/sigwx-front-overlay.js`:

```js
import { samplePolylineByDistance } from '../sigwx-low/sigwx-low-chart-geometry.js'
```

Replace local `samplePolyline(...)` calls with:

```js
const samples = samplePolylineByDistance(item.smoothedPoints, {
  offset: SAMPLE_OFFSET,
  repeat: SAMPLE_REPEAT,
})
```

Modify `backend/src/parsers/sigwx-cloud-overlay.js`:

```js
import {
  offsetSamplesFromPolygon,
  samplePolylineByDistance,
} from '../sigwx-low/sigwx-low-chart-geometry.js'
```

Replace local sampling and outward offset calls with:

```js
const samples = offsetSamplesFromPolygon(
  samplePolylineByDistance(closedPoints, {
    offset: SAMPLE_OFFSET,
    repeat: SAMPLE_REPEAT,
  }),
  item.smoothedPoints,
  SCALLOP_OFFSET,
)
```

- [ ] **Step 10: Wire special-line feature collections into render output**

Modify `frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.js` so `phenomenaToSigwxRenderFeatures()` returns empty special-line collections unless backend data provides them:

```js
    specialLineSymbols: payload.specialLineFeatures?.symbols || { type: 'FeatureCollection', features: [] },
    specialLineLabels: payload.specialLineFeatures?.labels || { type: 'FeatureCollection', features: [] },
```

Do not remove the old cloud/front raster overlay yet. Treat it as a reference layer until FPV-sampled vector symbols pass visual review.

- [ ] **Step 11: Add visual acceptance notes to the rendering matrix**

Append this section to `docs/SIGWX_LOW_Rendering_Matrix.md`:

```markdown
## Front And Cloud Shape Acceptance

Front/cloud rendering must be judged against paired `target.png` samples, not only against parser output. The preferred implementation is an FPV-space chart-line engine that uses original XML `fpv_points`, not lat/lon-only geometry, because the KMA finished chart appears to be generated in the original chart coordinate space.

For each sample containing `font_line` or `cld/cloud`:

- The rendered line follows the target path without obvious lateral drift.
- Front symbols repeat at a similar density to the target image.
- Warm/cold/occluded symbol orientation follows line direction.
- CB cloud scallops sit outside the cloud area, not across the interior.
- Scallop density is close enough that the boundary reads as the same chart convention.
- The underlying source item remains available as a phenomenon for toggles, route intersection, briefing, and vertical-profile work.

Accepted implementation modes:

- `fpv-sampled-vector-symbols`: preferred final mode because it follows the original chart-engine model while preserving per-phenomenon toggles and interaction.
- `per-phenomenon-raster`: acceptable fallback only after FPV vector sampling fails visual review for a documented reason.
- `whole-layer-raster`: temporary reference mode only; do not treat it as the final interactive engine.
```

- [ ] **Step 12: Produce comparison artifacts for samples with front/cloud**

For every sample that has `font_line` or `cld/cloud`, generate or capture:

```text
reference/sigwx_low_samples/<tmfc>/target.png
reference/sigwx_low_samples/<tmfc>/rendered.png
reference/sigwx_low_samples/<tmfc>/diff.png
reference/sigwx_low_samples/<tmfc>/front-cloud-review.md
```

Each `front-cloud-review.md` must contain:

```markdown
# SIGWX_LOW <tmfc> Front/Cloud Review

## Cloud

- Target shape:
- Rendered shape:
- Difference:
- Decision: pass | tune | fallback-needed
- Engine mode: fpv-sampled-vector-symbols | per-phenomenon-raster | whole-layer-raster-reference

## Front

- Target shape:
- Rendered shape:
- Difference:
- Decision: pass | tune | fallback-needed
- Engine mode: fpv-sampled-vector-symbols | per-phenomenon-raster | whole-layer-raster-reference
```

- [ ] **Step 13: Commit**

Run:

```bash
git add backend/src/sigwx-low/sigwx-low-chart-geometry.js backend/src/sigwx-low/sigwx-low-special-lines.js backend/test/sigwx-low-line-symbols.test.js backend/test/sigwx-low-special-lines.test.js backend/src/parsers/sigwx-front-overlay.js backend/src/parsers/sigwx-cloud-overlay.js frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.js docs/SIGWX_LOW_Rendering_Matrix.md
git commit -m "feat: add FPV SIGWX low special line engine"
```

---

### Task 9: Mapbox Layer Refinement And Visual Verification Harness

**Files:**
- Modify: `frontend/src/features/map/MapView.jsx`
- Create: `scripts/compare-sigwx-low-sample.js`
- Test manually with browser screenshot and target PNG.

- [ ] **Step 1: Add wind diamond layer to MapView**

Modify `frontend/src/features/map/MapView.jsx` to add source/layer constants:

```js
const SIGWX_WIND_DIAMOND_SOURCE = 'kma-sigwx-low-wind-diamonds'
const SIGWX_WIND_DIAMOND_LAYER = 'kma-sigwx-low-wind-diamonds'
```

Include `SIGWX_WIND_DIAMOND_LAYER` in `SIGWX_VECTOR_LAYERS`.

- [ ] **Step 2: Add source update in `addOrUpdateSigwxLowLayers`**

Add:

```js
  addOrUpdateGeoJsonSource(map, SIGWX_WIND_DIAMOND_SOURCE, data?.windDiamonds || empty)
```

- [ ] **Step 3: Add symbol layer for wind diamonds**

In `addOrUpdateSigwxLowLayers`, after icon layer creation:

```js
  if (!map.getLayer(SIGWX_WIND_DIAMOND_LAYER)) {
    map.addLayer({
      id: SIGWX_WIND_DIAMOND_LAYER,
      type: 'symbol',
      source: SIGWX_WIND_DIAMOND_SOURCE,
      slot: 'top',
      layout: {
        'icon-image': 'sigwx-box-wind',
        'icon-size': 0.72,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans CJK JP Bold', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#0000ff',
      },
    })
  }
```

Before adding the layer, ensure the `box_wind.png` asset is registered with image id `sigwx-box-wind`.

- [ ] **Step 4: Run frontend build**

Run: `npm run build --prefix frontend`

Expected: PASS.

- [ ] **Step 5: Add a minimal comparison script**

Create `scripts/compare-sigwx-low-sample.js`:

```js
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const tmfc = process.argv[2]
if (!tmfc) {
  console.error('Usage: node scripts/compare-sigwx-low-sample.js YYYYMMDDHH rendered.png')
  process.exit(1)
}

const renderedPath = process.argv[3]
if (!renderedPath) {
  console.error('Usage: node scripts/compare-sigwx-low-sample.js YYYYMMDDHH rendered.png')
  process.exit(1)
}

const targetPath = path.resolve('reference', 'sigwx_low_samples', tmfc, 'target.png')
const outputPath = path.resolve('reference', 'sigwx_low_samples', tmfc, 'diff.png')

if (!fs.existsSync(targetPath)) throw new Error(`Missing target image: ${targetPath}`)
if (!fs.existsSync(renderedPath)) throw new Error(`Missing rendered image: ${renderedPath}`)

const target = sharp(targetPath).resize(1100, 780, { fit: 'contain', background: '#ffffff' })
const rendered = sharp(renderedPath).resize(1100, 780, { fit: 'contain', background: '#ffffff' })
const targetBuffer = await target.raw().toBuffer({ resolveWithObject: true })
const renderedBuffer = await rendered.raw().toBuffer({ resolveWithObject: true })

let changed = 0
const diff = Buffer.alloc(targetBuffer.data.length)
for (let i = 0; i < targetBuffer.data.length; i += targetBuffer.info.channels) {
  const dr = Math.abs(targetBuffer.data[i] - renderedBuffer.data[i])
  const dg = Math.abs(targetBuffer.data[i + 1] - renderedBuffer.data[i + 1])
  const db = Math.abs(targetBuffer.data[i + 2] - renderedBuffer.data[i + 2])
  const isChanged = dr + dg + db > 80
  if (isChanged) changed += 1
  diff[i] = isChanged ? 255 : 255
  diff[i + 1] = isChanged ? 0 : 255
  diff[i + 2] = isChanged ? 0 : 255
  if (targetBuffer.info.channels === 4) diff[i + 3] = 255
}

await sharp(diff, {
  raw: {
    width: targetBuffer.info.width,
    height: targetBuffer.info.height,
    channels: targetBuffer.info.channels,
  },
}).png().toFile(outputPath)

const total = targetBuffer.info.width * targetBuffer.info.height
console.log(JSON.stringify({
  tmfc,
  changedPixels: changed,
  totalPixels: total,
  changedRatio: changed / total,
  diffPath: outputPath,
}, null, 2))
```

- [ ] **Step 6: Run visual manual verification**

Run the app:

```bash
npm run dev
```

Open the map, enable SIGWX, select `2026051411`, capture a screenshot to `reference/sigwx_low_samples/2026051411/rendered.png`, then run:

```bash
node scripts/compare-sigwx-low-sample.js 2026051411 reference/sigwx_low_samples/2026051411/rendered.png
```

Expected: script writes `reference/sigwx_low_samples/2026051411/diff.png` and prints `changedRatio`. Use the ratio as a trend metric only; manual review decides whether the feature is acceptable.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/src/features/map/MapView.jsx scripts/compare-sigwx-low-sample.js
git commit -m "feat: add SIGWX low wind diamond render layer"
```

---

### Task 10: Broaden Samples And Lock Rules

**Files:**
- Add sample folders under `reference/sigwx_low_samples/<tmfc>/`
- Modify: `docs/SIGWX_LOW_Rendering_Matrix.md`
- Modify: tests from Tasks 4-7 as new patterns are confirmed.

- [ ] **Step 1: Collect a small diverse sample set**

Run:

```bash
node scripts/collect-sigwx-low-sample.js 2026051411 2026051311 2026051211 2026051205 2026051111 2026051105 2026050305 2026050223
```

Expected: each listed `tmfc` has `source.xml`, `parsed.json`, `target.png`, and `manifest.json`.

- [ ] **Step 2: Regenerate matrix**

Run:

```bash
node scripts/sigwx-low-matrix.js
```

Expected: `docs/SIGWX_LOW_Rendering_Matrix.md` includes rows for freezing, sfc_vis, cld/cloud, sfc_wind, ktg, icing_area, pressure, and font_line if present in the samples.

- [ ] **Step 3: Compare each sample image manually**

For each sample folder, open `target.png` and inspect `parsed.json` item rows. Confirm whether each matrix row should map to one of these render roles:

```text
area-boundary
line-boundary
dashed-freezing-line
cloud-scallop-boundary
front-overlay-source
icon-marker
multi-icon-marker
wind-diamond-label
text-label
pressure-center-icon
pressure-motion-arrow
```

Expected: every matrix row observed in two or more samples has a non-`unclassified` role, or a note explaining why it must remain unclassified.

For samples containing `front` or `cloud`, also complete `front-cloud-review.md` from Task 8 before marking the row accepted.

- [ ] **Step 4: Add classifier tests for newly confirmed rows**

Append tests to `backend/test/sigwx-low-classifier.test.js` for every newly confirmed render role. Use this pattern:

```js
test('classifies moderate turbulence icon with altitude label', () => {
  const result = classifySigwxLowItem({
    item_type: 7,
    contour_name: 'ktg',
    item_name: 'moderate_turbulence',
    icon_name: 'moderate_turbulence.png',
    label: 'XXX/060',
  })
  assert.equal(result.semanticRole, 'ktg')
  assert.equal(result.renderRole, 'icon-marker')
  assert.equal(result.visibleLabel, 'XXX/060')
})
```

- [ ] **Step 5: Run all backend tests**

Run:

```bash
npm test --prefix backend
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add reference/sigwx_low_samples docs/SIGWX_LOW_Rendering_Matrix.md backend/test/sigwx-low-classifier.test.js backend/src/sigwx-low/sigwx-low-classifier.js
git commit -m "test: expand SIGWX low rendering rule coverage"
```

---

## Final Verification

- [ ] Run backend tests:

```bash
npm test --prefix backend
```

Expected: PASS.

- [ ] Run frontend render feature test:

```bash
node --test frontend/src/features/weather-overlays/lib/sigwxRenderFeatures.test.js
```

Expected: PASS.

- [ ] Run frontend build:

```bash
npm run build --prefix frontend
```

Expected: PASS.

- [ ] Open the app and inspect `2026051411` against the target image:
  - strong wind blue area is visible
  - `30` wind diamond is near the target location
  - `LCA 5000M` labels are visible without internal item names
  - mountain obscuration icons render without unwanted `mountain_obscuration` text
  - CB cloud label preserves multiline `ISOL / EMBD / CB / XXX / 010`
  - front/cloud overlays remain available when present

## Self-Review

- Spec coverage: The plan covers sample collection, paired XML/PNG storage, item matrix generation, classification, phenomena linking, render feature generation, and visual comparison.
- Placeholder scan: No task uses `TBD`, `TODO`, or unspecified "write tests" instructions; each test task includes concrete code.
- Type consistency: The plan consistently uses `tmfc`, `items`, `phenomena`, `semanticRole`, `renderRole`, `visibleLabel`, `geometry.latLngs`, and `render.labelLines`.
