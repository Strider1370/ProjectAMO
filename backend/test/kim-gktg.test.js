import { saveSnapshot, inspectSnapshot } from '../src/dev/snapshot-store.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { seedGktg } from './gktg-fixture.js'
import { readKimGktgIndex, readKimGktgLatest, readKimGktgField, publishKimGktgRun, cleanupKimNwpRuns, writeKimGktgField } from '../src/processors/kim-nwp-store.js'
import { process as collect, decodeGktgInput } from '../src/processors/kim-gktg-processor.js'
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
