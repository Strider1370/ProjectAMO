import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  kimDocumentStoragePath,
  kimNcPath,
  kimRawTextExists,
  kimStoreCheckSummary,
  readKimDocument,
  readKimNcDocument,
  readKimNcTyped,
  readKimRawText,
  writeKimDocument,
  writeKimRawText,
} from '../src/processors/kim-doc-store.js'
import { appendKimRunEvent, kimRunDirForPath, readKimRunEvents } from '../src/processors/kim-run-events.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpGrid } from '../src/processors/kim-nwp-model.js'
import {
  cleanupKimNwpRuns,
  fingerprintKimNwpBase,
  listKimTropopauseFields,
  readKimGktgField,
  readKimNwpGrid,
  readKimTropopauseField,
  readKimTropopauseUpper,
  resolveKimNwpGridPath,
  writeKimGktgField,
  writeKimNwpGrid,
  writeKimNwpManifest,
  writeKimTropopauseField,
  writeKimTropopauseUpper,
} from '../src/processors/kim-nwp-store.js'

const FIXTURE = JSON.parse(fs.readFileSync(new URL('./fixtures/kim-grid-850hpa-24x24.json', import.meta.url), 'utf8'))
const BOUNDS = { lonMin: 127.333333, latMin: 36.666667, lonMax: 129.25, latMax: 38.583333, dx: 0.083333, dy: 0.083333 }

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-kim-doc-'))
}

function withFormat(format, fn) {
  const previous = process.env.KIM_STORE_FORMAT
  process.env.KIM_STORE_FORMAT = format
  try { return fn() } finally {
    if (previous === undefined) delete process.env.KIM_STORE_FORMAT
    else process.env.KIM_STORE_FORMAT = previous
  }
}

// 실제 KIM 850 hPa 24×24 값으로 만든 기본 격자. 결측(-32768)·포화값을 일부 넣는다.
function fixtureGrid({ tmfc = '2026100700', hf = 6 } = {}) {
  const level = KIM_NWP_LEVELS.find(entry => entry.id === '850hPa')
  const grid = buildKimNwpGrid({
    model: KIM_NWP_MODEL, tmfc, hf, level, fetchedAt: '2026-10-07T05:30:00.000Z',
    components: Object.entries(FIXTURE.variables).map(([variable, spec]) => ({
      variable, unit: spec.unit, level: 850, nx: FIXTURE.nx, ny: FIXTURE.ny, bounds: BOUNDS,
      values: spec.values.map(value => value * spec.scale),
    })),
  })
  grid.variables.T.values[3] = -32768
  return grid
}

function gktgField(grid, revision) {
  const size = grid.grid.nx * grid.grid.ny
  return {
    type: 'kim_nwp_gktg', product: 'GKTG', model: grid.model, grid: grid.grid,
    time: { tmfc: grid.tmfc, hf: grid.hf, validTime: grid.validTime }, level: grid.level,
    encoding: 'float32-json-v1', scale: 1, offset: 0, units: { gktg: 'm⅔ s⁻¹' },
    gktg: Array.from({ length: size }, (_, i) => (i % 9 === 0 ? null : Math.fround((i % 37) / 113))),
    geopotentialHeight: grid.variables.hgt.values,
    geopotentialHeightEncoding: { encoding: 'int16-scaled-json-v1', scale: 1, offset: 0, missing: -32768, unit: 'm' },
    revision, inputRevision: 'input-a', algorithm: 'kim-gktg-python-v5', engineRevision: 'engine-a',
  }
}

function tropopauseField(grid, revision) {
  const size = grid.grid.nx * grid.grid.ny
  return {
    type: 'kim_nwp_tropopause', product: 'TROP_JET', model: grid.model, grid: grid.grid,
    time: { tmfc: grid.tmfc, hf: grid.hf, validTime: grid.validTime }, encoding: 'float-json-v1',
    units: { trop: 'hPa', tropT: '°C', vmax: 'kt', pmax: 'hPa' },
    trop: Array.from({ length: size }, (_, i) => (i === 7 ? null : 100 + (i % 50) / 10)),
    tropT: Array.from({ length: size }, (_, i) => -60 - (i % 300) / 100),
    tropAboveTop: Array.from({ length: size }, (_, i) => (i % 13 === 0 ? 1 : 0)),
    vmax: Array.from({ length: size }, (_, i) => (i % 900) / 10),
    pmax: Array.from({ length: size }, (_, i) => 150 + (i % 600) / 10),
    jets: [{ id: 1, points: [[128.1, 37.2, 120.5], [128.3, 37.4, 118.2]] }],
    checks: { note: '한글 메타' }, revision, inputRevision: 'input-t', algorithm: 'kim-tropopause-jet-v1', engineRevision: 'engine-t',
  }
}

test('NC documents read back as the same object, key order included', () => {
  const root = tempRoot()
  const grid = fixtureGrid()
  const file = path.join(root, 'doc.json')
  writeKimDocument(file, grid, { format: 'nc' })
  assert.ok(!fs.existsSync(file))
  const read = readKimNcDocument(kimNcPath(file))
  assert.deepStrictEqual(read, JSON.parse(JSON.stringify(grid)))
  assert.equal(JSON.stringify(read), JSON.stringify(grid))
})

test('NC documents keep nulls, float32/float64 values, -0, large integers and nested arrays exactly', () => {
  const root = tempRoot()
  const doc = {
    grid: { nx: 300, ny: 1 },
    float32WithNull: Array.from({ length: 300 }, (_, i) => (i % 5 ? Math.fround(i / 7) : null)),
    decimals: Array.from({ length: 300 }, (_, i) => -68.69 + i / 100),
    bigInts: Array.from({ length: 300 }, (_, i) => 40000 + i),
    negativeZero: Array.from({ length: 300 }, (_, i) => (i === 0 ? -0 : i / 3)),
    nested: { levels: [{ pressure: 100, T: Array.from({ length: 300 }, (_, i) => 200 + i / 10) }] },
    small: [1, 2, 3],
    mixed: Array.from({ length: 300 }, (_, i) => (i ? i : 'x')),
    text: 'm⅔ s⁻¹',
  }
  const file = path.join(root, 'doc.json')
  writeKimDocument(file, doc, { format: 'nc' })
  const read = readKimNcDocument(kimNcPath(file))
  assert.deepStrictEqual(read, JSON.parse(JSON.stringify(doc)))
  assert.ok(Object.is(read.negativeZero[0], 0), 'JSON.stringify(-0) is 0, so NC must give 0 as well')
  const typed = readKimNcTyped(kimNcPath(file))
  assert.equal(typed.arrays['/bigInts'].dtype, '<i')
  assert.equal(typed.arrays['/float32WithNull'].dtype, '<f')
  assert.ok(Number.isNaN(typed.arrays['/float32WithNull'].values[0]))
  assert.equal(typed.arrays['/decimals'].dtype, '<d')
  assert.equal(typed.meta.mixed.length, 300, 'non-numeric arrays stay in metadata')
})

test('storage formats: json writes JSON only, both writes and verifies NC, nc reads NC with JSON fallback', () => {
  const root = tempRoot()
  const grid = fixtureGrid()
  const file = path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026100700', 'normalized', 'hf006', '850hPa', 'grid.json')
  writeKimDocument(file, grid, { format: 'json' })
  assert.ok(fs.existsSync(file))
  assert.ok(!fs.existsSync(kimNcPath(file)))

  const before = kimStoreCheckSummary()
  writeKimDocument(file, grid, { format: 'both' })
  assert.ok(fs.existsSync(kimNcPath(file)))
  const after = kimStoreCheckSummary()
  assert.equal(after.checked, before.checked + 1)
  assert.equal(after.mismatches, before.mismatches)
  assert.equal(kimDocumentStoragePath(file, { format: 'both' }), file, 'both reads JSON')
  assert.equal(kimDocumentStoragePath(file, { format: 'nc' }), kimNcPath(file), 'nc reads NC first')

  fs.rmSync(kimNcPath(file))
  assert.deepStrictEqual(readKimDocument(file, { format: 'nc' }), JSON.parse(JSON.stringify(grid)), 'nc falls back to an older JSON run')
  fs.rmSync(file)
  assert.throws(() => readKimDocument(file, { format: 'nc' }), (error) => error.code === 'ENOENT')
})

test('store reads and writes grids, GKTG, tropopause and upper documents identically in nc format', () => {
  const grid = fixtureGrid()
  const results = {}
  for (const format of ['json', 'nc']) {
    const root = tempRoot()
    results[format] = withFormat(format, () => {
      writeKimNwpGrid({ root, grid })
      const gktgRevision = 'a'.repeat(20)
      const tropRevision = 'b'.repeat(20)
      writeKimGktgField(root, gktgField(grid, gktgRevision))
      writeKimGktgField(root, gktgField(grid, gktgRevision))
      writeKimTropopauseField(root, tropopauseField(grid, tropRevision))
      writeKimTropopauseUpper(root, { tmfc: grid.tmfc, hf: grid.hf, revision: tropRevision, grid: grid.grid,
        levels: [{ pressure: 100, hgt: grid.variables.hgt.values.map(v => v + 10000), T: grid.variables.T.values.map(v => v / 100), u: grid.variables.u.values, v: grid.variables.v.values }] })
      const base = { root, model: KIM_NWP_MODEL, tmfc: grid.tmfc, hf: grid.hf, levelId: '850hPa' }
      const out = {
        grid: readKimNwpGrid(base),
        gktg: readKimGktgField({ root, tmfc: grid.tmfc, hf: grid.hf, levelId: '850hPa', revision: gktgRevision }),
        trop: readKimTropopauseField({ root, tmfc: grid.tmfc, hf: grid.hf, revision: tropRevision }),
        upper: readKimTropopauseUpper({ root, tmfc: grid.tmfc, hf: grid.hf, revision: tropRevision }),
        listed: listKimTropopauseFields(root),
        files: fs.readdirSync(path.dirname(resolveKimNwpGridPath(base))),
      }
      return out
    })
  }
  for (const key of ['grid', 'gktg', 'trop', 'upper', 'listed']) assert.deepStrictEqual(results.nc[key], results.json[key], key)
  assert.equal(JSON.stringify(results.nc.grid), JSON.stringify(results.json.grid))
  assert.ok(results.nc.files.includes('grid.nc') && !results.nc.files.includes('grid.json'))
  assert.ok(results.json.files.includes('grid.json') && !results.json.files.includes('grid.nc'))
})

test('base fingerprint follows the stored NC file', () => {
  const root = tempRoot()
  withFormat('nc', () => {
    const levels = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
    const base = fixtureGrid()
    for (const level of levels) writeKimNwpGrid({ root, grid: { ...base, level: { ...base.level, id: level.id } } })
    const first = fingerprintKimNwpBase({ root, tmfc: base.tmfc, hours: [6] })
    assert.match(first, /^[a-f0-9]{20}$/)
    writeKimNwpGrid({ root, grid: { ...base, fetched_at: '2026-10-07T06:00:00.000Z' } })
    assert.notEqual(fingerprintKimNwpBase({ root, tmfc: base.tmfc, hours: [6] }), first)
  })
})

test('raw text caches are gzipped outside json format and readable either way', () => {
  const root = tempRoot()
  const file = path.join(root, 'raw', 'gktg', 'hf6-w-250.txt')
  const text = '# lon1 = 119.0, lat1 = 30.0\n 1.00968e+05 1.01047e+05\n'
  assert.equal(readKimRawText(file), null)
  assert.equal(kimRawTextExists(file), false)
  writeKimRawText(file, text, { format: 'both' })
  assert.ok(fs.existsSync(`${file}.gz`) && !fs.existsSync(file))
  assert.equal(readKimRawText(file), text)
  assert.equal(kimRawTextExists(file), true)
  writeKimRawText(file, text, { format: 'json' })
  assert.ok(fs.existsSync(file))
  assert.equal(readKimRawText(file), text)
})

test('derived-publish cleanup never removes a run that is still being collected', () => {
  const root = tempRoot()
  for (const tmfc of ['2026100600', '2026100606']) {
    writeKimNwpManifest(root, { type: 'kim_nwp_manifest', model: KIM_NWP_MODEL, tmfc, usable: true, complete: true })
  }
  const collecting = path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026100612', 'normalized')
  fs.mkdirSync(collecting, { recursive: true })
  const removed = cleanupKimNwpRuns({ root, maxRuns: 1, latestRunId: 'KIMG_NE57_2026100606', onlyComplete: true, reason: 'gktg_published' })
  assert.deepStrictEqual(removed, ['KIMG_NE57_2026100600'])
  assert.ok(fs.existsSync(collecting))
  const events = readKimRunEvents(path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026100606'))
  assert.equal(events.at(-1).type, 'runs_cleaned')
  assert.equal(events.at(-1).reason, 'gktg_published')
})

test('run events are appended per run and stop at the size cap', () => {
  const root = tempRoot()
  const runDir = path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026100700')
  assert.equal(kimRunDirForPath(path.join(runDir, 'normalized', 'hf000', '850hPa', 'grid.json')), runDir)
  assert.equal(kimRunDirForPath(path.join(root, 'elsewhere', 'grid.json')), null)
  for (let i = 0; i < 20; i++) appendKimRunEvent(runDir, { type: 'tick', i }, { maxBytes: 400 })
  const events = readKimRunEvents(runDir)
  assert.ok(events.length < 20)
  assert.equal(events.at(-1).type, 'events_truncated')
})

test('a damaged NC result is quarantined and rewritten, like a damaged JSON result', () => {
  const root = tempRoot()
  withFormat('nc', () => {
    const grid = fixtureGrid()
    const revision = 'c'.repeat(20)
    writeKimGktgField(root, gktgField(grid, revision))
    const selector = { root, tmfc: grid.tmfc, hf: grid.hf, levelId: '850hPa', revision }
    const original = readKimGktgField(selector)
    const ncFile = kimDocumentStoragePath(path.join(path.dirname(resolveKimNwpGridPath({ root, model: KIM_NWP_MODEL, tmfc: grid.tmfc, hf: grid.hf, levelId: '850hPa' })), 'gktg', `${revision}.json`))
    assert.ok(ncFile.endsWith('.nc'))
    fs.writeFileSync(ncFile, 'not an hdf5 file')
    assert.throws(() => readKimGktgField(selector))
    const { content_hash: _hash, ...field } = original
    writeKimGktgField(root, field)
    assert.deepStrictEqual(readKimGktgField(selector), original)
    assert.ok(fs.readdirSync(path.dirname(ncFile)).some(name => name.includes('.nc.corrupt-')))
  })
})
