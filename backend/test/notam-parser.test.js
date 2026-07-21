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
  assert.match(g.scheduleText, /03 0928-0931/)
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
