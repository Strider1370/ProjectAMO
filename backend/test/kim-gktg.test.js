import { saveSnapshot, inspectSnapshot } from '../src/dev/snapshot-store.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { seedGktg } from './gktg-fixture.js'
import { readKimGktgIndex, readKimGktgLatest, readKimGktgField, publishKimGktgRun, cleanupKimNwpRuns, writeKimGktgField, writeKimNwpGrid } from '../src/processors/kim-nwp-store.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { process as collect, decodeGktgInput, engineRevision, publishKoreaGktgFromExpanded, GKTG_ALGORITHM } from '../src/processors/kim-gktg-processor.js'
import { loadGktgCrossSection } from '../src/briefing/gktg-cross-section.js'
import { summarizeEnrouteModel } from '../src/briefing/enroute-model.js'
import { resolveApiOperation } from '../src/api-operation-registry.js'
const temporary = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-gktg-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root }

test('GKTG publishes all 13 hours × 21 native levels, preserving binary32 values and exact selectors', t => {
  const root = temporary(t)
  const manifest = seedGktg(root, { hours: Array.from({ length: 13 }, (_, i) => i) })
  const index = readKimGktgIndex(root)
  assert.equal(index.times.length, 13)
  assert.equal(index.levels.length, 21)
  const field = readKimGktgField({ root, tmfc: manifest.tmfc, hf: 12, levelId: '500hPa', revision: manifest.revision })
  assert.equal(field.gktg[0], Math.fround(.22))
  assert.throws(() => readKimGktgField({ root, tmfc: manifest.tmfc, hf: 13, levelId: '500hPa', revision: manifest.revision }), { code: 'ENOENT' })
  assert.throws(() => readKimGktgField({ root, tmfc: manifest.tmfc, hf: 12, levelId: '500hPa', revision: '../../etc' }))
  assert.throws(() => publishKimGktgRun(root, { ...manifest, entries: manifest.entries.slice(1) }), /Incomplete/)
  assert.equal(readKimGktgLatest(root).revision, manifest.revision)
})

test('base waiting keeps last complete GKTG without fetching, even if radar cannot be used; retention protects it', async t => {
  const root = temporary(t)
  const manifest = seedGktg(root)
  let calls = 0
  const result = await collect({ root, tmfc: '2099010106', forecastHours: [0], fetchGrid: () => { calls++; throw new Error('must not fetch') } })
  assert.equal(result.collection.outcome, 'partial')
  assert.equal(calls, 0)
  assert.equal(readKimGktgLatest(root).tmfc, manifest.tmfc)
  cleanupKimNwpRuns({ root, maxRuns: 1 })
  assert.equal(readKimGktgField({ root, tmfc: manifest.tmfc, hf: 0, levelId: '500hPa', revision: manifest.revision }).product, 'GKTG')
})

test('cancellation records a terminal attempt and preserves the previous complete publication', async t => {
  const root = temporary(t)
  const manifest = seedGktg(root)
  const controller = new AbortController()
  controller.abort(new Error('test cancellation'))
  await assert.rejects(collect({ root, tmfc: '2099010106', forecastHours: [0], signal: controller.signal }), /test cancellation/)
  assert.equal(readKimGktgLatest(root).revision, manifest.revision)
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'kim_nwp/derived/gktg/last-attempt.json'), 'utf8')).outcome, 'cancelled')
})

test('GKTG cross-section uses same-input geometric height, preserves holes and rejects unavailable times', t => {
  const root = temporary(t)
  const manifest = seedGktg(root, { value: .3 })
  const axis = { samples: [{ lon: 126, lat: 37, distanceNm: 0 }, { lon: 140, lat: 37, distanceNm: 10 }] }
  const section = loadGktgCrossSection({ root, axis, validTime: manifest.entries[0].validTime })
  assert.equal(section.product, 'GKTG')
  assert.equal(section.levels.length, 21)
  assert.equal(section.levels[8].values[0].altFt, 4000 * 3.28084)
  assert.equal(section.levels[8].values[1].gktg, null)
  assert.equal(loadGktgCrossSection({ root, axis, validTime: '2099-01-01T01:00:00.000Z' }).available, false)
  const model = summarizeEnrouteModel({ turbulence: section, totalDistanceNm: 10, cruiseAltitudeFt: 15000 })
  assert.equal(model.elements[0].kind, 'turbulence')
  assert.equal(model.elements[0].intervals[0].level, '중')
  assert.deepEqual(summarizeEnrouteModel({ turbulence: section, totalDistanceNm: 10, cruiseAltitudeFt: 60000 }).elements, [])
})

test('GKTG rejects invalid inputs at the boundary and supplementary operation has a unique registry match', () => {
  assert.equal(resolveApiOperation({ url: 'https://apihub.kma.go.kr/api/typ06/cgi-bin/url/nph-kim_nc_xy_txt2_std?name=ps' }).id, 'kim_grid_gktg')
  assert.equal(resolveApiOperation({ url: 'https://apihub.kma.go.kr/api/typ06/cgi-bin/url/nph-kim_nc_xy_txt2_std?name=u&level=250' }).id, 'kim_grid')
  assert.throws(() => decodeGktgInput({ unit: 'K', encoding: 'int16-scaled-json-v1', scale: .01, values: [-32768] }, 'T', 1), /Incomplete/)
  assert.throws(() => decodeGktgInput({ unit: 'C', values: [250] }, 'T', 1), /Invalid/)
})

test('snapshots capture GKTG inside the KIM directory and detect missing immutable fields', t => {
  const root = temporary(t)
  const manifest = seedGktg(root)
  fs.writeFileSync(path.join(root, 'kim_nwp/latest.json'), JSON.stringify({ latestRun: manifest.tmfc }))
  fs.writeFileSync(path.join(root, 'kim_nwp/index.json'), '{}')
  saveSnapshot(root, 'gktg')
  const snapshotRoot = path.join(root, 'snapshots/gktg')
  const inspection = inspectSnapshot(root, 'gktg')
  assert.equal(inspection.summaries.kim_gktg.fields, 21)
  const entry = manifest.entries[0]
  const removed = path.join(snapshotRoot, 'kim_nwp/runs', manifest.runId, 'normalized/hf000', entry.levelId, 'gktg', `${entry.revision}`)
  for (const extension of ['json', 'nc']) fs.rmSync(`${removed}.${extension}`, { force: true })
  assert.ok(inspectSnapshot(root, 'gktg').blockers.includes(`kim_gktg:missing_field:0:${entry.levelId}`))
})

test('a corrupt immutable field is rejected and restored only from recalculation, preserving damaged bytes', t => {
  // JSON 파일 손상을 직접 만든다. NC 손상은 kim-doc-store.test.js에서 본다.
  const savedFormat = process.env.KIM_STORE_FORMAT
  process.env.KIM_STORE_FORMAT = 'json'
  t.after(() => { if (savedFormat === undefined) delete process.env.KIM_STORE_FORMAT; else process.env.KIM_STORE_FORMAT = savedFormat })
  const root = temporary(t)
  const manifest = seedGktg(root)
  const entry = manifest.entries[0]
  const original = JSON.parse(fs.readFileSync(entry.path, 'utf8'))
  const damaged = { ...original, gktg: [1, ...original.gktg.slice(1)] }
  fs.writeFileSync(entry.path, JSON.stringify(damaged))
  assert.throws(() => readKimGktgField({ root, tmfc: manifest.tmfc, hf: 0, levelId: entry.levelId, revision: entry.revision }), /Corrupt/)
  writeKimGktgField(root, original)
  assert.equal(readKimGktgField({ root, tmfc: manifest.tmfc, hf: 0, levelId: entry.levelId, revision: entry.revision }).gktg[0], original.gktg[0])
  assert.ok(fs.readdirSync(path.dirname(entry.path)).some(name => name.includes('.corrupt-')))
  fs.writeFileSync(entry.path, '{invalid JSON')
  assert.throws(() => readKimGktgField({ root, tmfc: manifest.tmfc, hf: 0, levelId: entry.levelId, revision: entry.revision }))
  writeKimGktgField(root, original)
  assert.equal(readKimGktgField({ root, tmfc: manifest.tmfc, hf: 0, levelId: entry.levelId, revision: entry.revision }).gktg[0], original.gktg[0])
  assert.ok(fs.readdirSync(path.dirname(entry.path)).filter(name => name.includes('.corrupt-')).length >= 2)
  fs.writeFileSync(entry.path, '{"content_hash":"invalid"}')
  writeKimGktgField(root, original)
  assert.equal(readKimGktgField({ root, tmfc: manifest.tmfc, hf: 0, levelId: entry.levelId, revision: entry.revision }).product, 'GKTG')
})

test('supplement bounds accept the padded single-digit latitude of the expanded domain', async () => {
  const { supplementBoundsMatch } = await import('../src/processors/kim-gktg-processor.js')
  const expanded = '# w, unit = m/s, level =     250, i =     541, j =     529, map = S (lon1 = 100.0, lat1 =  6.0, lon2 = 145.0, lat2 = 50.0, x_min = 1201'
  const korea = 'map = S (lon1 = 119.0, lat1 = 30.0, lon2 = 136.0, lat2 = 44.0, x_min = 1429'
  assert.equal(supplementBoundsMatch(expanded, { lonMin: 100, latMin: 6, lonMax: 145, latMax: 50 }), true)
  assert.equal(supplementBoundsMatch(korea, { lonMin: 119, latMin: 30, lonMax: 136, latMax: 44 }), true)
  assert.equal(supplementBoundsMatch(korea, { lonMin: 100, latMin: 6, lonMax: 145, latMax: 50 }), false)
  assert.equal(supplementBoundsMatch(expanded, { lonMin: 100, latMin: 6, lonMax: 145, latMax: 5 }), false)
})

test('Korea GKTG cropped from the expanded run keeps the same lon/lat cells, and the regular Korea job then sees it as unchanged', async t => {
  const root = temporary(t)
  const tmfc = '2099010106'
  const step = 1 / 12
  const kr = { nx: 4, ny: 3, lonMin: 119, latMin: 30, lonMax: 119 + 3 * step, latMax: 30 + 2 * step, dx: 0.083333, dy: 0.083333 }
  const ea = { nx: 8, ny: 6, lonMin: 118.75, latMin: 29.75, lonMax: 118.75 + 7 * step, latMax: 29.75 + 5 * step, dx: 0.083333, dy: 0.083333 }
  const levels = KIM_NWP_LEVELS.filter(level => level.kind === 'pressure')
  const engine = engineRevision()
  const eaValues = Array.from({ length: ea.nx * ea.ny }, (_, i) => Math.fround(i / 100))
  for (const level of levels) {
    writeKimNwpGrid({ root, domain: 'kr', grid: { type: 'kim_nwp_grid', model: KIM_NWP_MODEL, tmfc, hf: 0, validTime: addForecastHours(tmfc, 0), level, grid: kr,
      variables: { hgt: { unit: 'm', encoding: 'int16-scaled-json-v1', scale: 1, offset: 0, values: Array(kr.nx * kr.ny).fill(1500) } }, fetched_at: '2099-01-01T06:00:00.000Z' } })
    writeKimGktgField(root, { type: 'kim_nwp_gktg', product: 'GKTG', model: KIM_NWP_MODEL, grid: ea, time: { tmfc, hf: 0, validTime: addForecastHours(tmfc, 0) }, level,
      encoding: 'float32-json-v1', scale: 1, offset: 0, units: { gktg: 'm⅔ s⁻¹' }, gktg: eaValues, geopotentialHeight: Array(ea.nx * ea.ny).fill(1500),
      geopotentialHeightEncoding: { encoding: 'int16-scaled-json-v1', scale: 1, offset: 0, missing: -32768, unit: 'm' },
      revision: 'c'.repeat(20), inputRevision: 'd'.repeat(20), algorithm: GKTG_ALGORITHM, engineRevision: engine }, 'ea')
  }
  const hourResults = [{ engineRevision: engine, entries: levels.map(level => ({ hf: 0, levelId: level.id, validTime: addForecastHours(tmfc, 0), revision: 'c'.repeat(20), inputRevision: 'd'.repeat(20), grid: ea })) }]

  const published = await publishKoreaGktgFromExpanded({ root, tmfc, hours: [0], hourResults })
  assert.equal(published.entries.length, levels.length)
  assert.equal(readKimGktgLatest(root).source, 'expanded_crop')
  const field = readKimGktgField({ root, tmfc, hf: 0, levelId: '850hPa' })
  assert.deepEqual(field.grid, kr)
  assert.deepEqual(field.gktg, Array.from({ length: kr.nx * kr.ny }, (_, i) => eaValues[(3 + Math.floor(i / kr.nx)) * ea.nx + 3 + (i % kr.nx)]))

  let calculated = 0
  const again = await collect({ root, tmfc, forecastHours: [0], calculate: async () => { calculated++; throw new Error('should not recalculate') } })
  assert.equal(again.unchanged, true)
  assert.equal(calculated, 0)

  await assert.rejects(publishKoreaGktgFromExpanded({ root, tmfc, hours: [0], hourResults: [{ ...hourResults[0], engineRevision: 'f'.repeat(20) }] }), /kim_gktg_engine_mismatch/)
})
