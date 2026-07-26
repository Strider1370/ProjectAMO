import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs, { readFileSync } from 'node:fs'
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

// 실제 NOTAM 376건 중 13건이 F)/G) 단위가 섞여 나온다(F)SFC G)FL360 등). unit 필드는 밴드당
// 하나뿐이라 한쪽 단위만 취하면 FL360이 360ft로 남는다 — 3만6천ft 구역이 360ft 조각이 되어
// 순항 중인 항공기가 구역 위에 있다고 오판한다(경보 누락 방향). 둘 다 ft로 정규화한다.
test('parseQcodeBand: mixed FT floor and FL ceiling normalizes to feet', () => {
  assert.deepEqual(parseQcodeBand('x', 'SFC', 'FL360'), { lower: 0, upper: 36000, unit: 'FT', ref: 'AGL' })
  assert.deepEqual(parseQcodeBand('x', '7000FT AMSL', 'FL430'), { lower: 7000, upper: 43000, unit: 'FT', ref: 'AMSL' })
})

test('parseQcodeBand: band never comes out inverted for mixed units', () => {
  const b = parseQcodeBand('x', '5000FT AMSL', 'FL150')
  assert.ok(b.lower < b.upper, `상한이 하한보다 낮음: ${JSON.stringify(b)}`)
})

// 단위가 같으면 기존 표기를 유지한다 — FL 밴드는 UI가 'FL200-FL300' 형태로 그대로 보여준다.
test('parseQcodeBand: matching units keep their original unit', () => {
  assert.deepEqual(parseQcodeBand('x', 'FL200', 'FL300'), { lower: 200, upper: 300, unit: 'FL', ref: null })
})

test('parseQcodeBand: falls back to Q-line FL band', () => {
  assert.deepEqual(parseQcodeBand('Q)RKRR/QGAXX/I/NBO/A/000/999/3459N12623E005', null, null), { lower: 0, upper: 999, unit: 'FL', ref: null })
})

test('parseNotamKml: 4 real records with correct fields', () => {
  const { items: recs } = parseNotamKml(KML)
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
  // 본문 좌표로 면을 만든다. 이전에는 KML LineString을 그대로 실어 경로 판정에서 빠졌다.
  assert.equal(l.geometry.type, 'Polygon')
  assert.equal(l.geometrySource, 'text')
  // 5 = notam-sample.kml의 D1181/26 본문 "AREA BOUNDED BY" 좌표 토큰 개수:
  // 372333N1291339E-372318N1291408E-373951N1300407E-374150N1300200E-372333N1291339E
  // (여는 좌표를 닫는 좌표로 반복 — 4개의 서로 다른 꼭짓점 + 닫는 반복 1개)
  assert.equal(l.geometry.coordinates[0].length, 5)
  assert.deepEqual(l.altitude, { lower: 0, upper: 6561, unit: 'FT', ref: 'AGL' })
})

test('parseNotamKml: broken placemark skipped, others survive', () => {
  const broken = KML.replace('A)RKJB B)2607030928 C)2607051057', 'A)RKJB') // strip B)/C) from G3301
  const { items: recs } = parseNotamKml(broken)
  assert.equal(recs.length, 3) // 4 minus the broken one
})

const kml = readFileSync(fileURLToPath(new URL('./fixtures/notam-2026-07-26.kml', import.meta.url)), 'utf8')

test('C)PERM NOTAM이 살아남는다', () => {
  const { items } = parseNotamKml(kml)
  for (const id of ['A0876/26', 'A0686/26', 'A0800/26', 'C1040/26']) {
    assert.ok(items.find((i) => i.id === id), `${id}가 없다`)
  }
})

test('415개 Placemark가 전부 레코드가 된다', () => {
  const r = parseNotamKml(kml)
  assert.equal(r.placemarks, 415)
  assert.equal(r.items.length, 415)
  assert.equal(r.dropped, 0)
})

test('유실이 생기면 집계에 잡힌다', () => {
  const broken = '<Placemark id=\'X0001/26_1\'><description><![CDATA[<h3>X0001/26</h3>(X0001/26 NOTAMN]]></description></Placemark>'
  const r = parseNotamKml(broken)
  assert.equal(r.placemarks, 1)
  assert.equal(r.dropped, 1)
})

test('불꽃놀이 도형이 본문 좌표에서 나온다', () => {
  const { items } = parseNotamKml(kml)
  const z = items.find((i) => i.id === 'Z0535/26')
  assert.equal(z.geometrySource, 'text')
  const lats = z.geometry.coordinates[0].map((p) => p[1])
  const mid = (Math.min(...lats) + Math.max(...lats)) / 2
  assert.ok(mid > 37.59 && mid < 37.60, `중심 위도 ${mid} — 활주로(37.56)면 안 된다`)
})
