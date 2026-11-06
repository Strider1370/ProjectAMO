import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parseNotamKml } from '../src/parsers/notam-parser.js'
import { reconcileNotamSources, process as processNotams } from '../src/processors/notam-processor.js'
import { splitNotamFields, hydrateNotamItem } from '../../shared/notam-fields.js'
import { notamBandToFt, matchRouteNotams } from '../src/briefing/notam-briefing.js'
import { scheduleStateOverWindow } from '../src/briefing/schedule-window.js'

const unzip = name => gunzipSync(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url))).toString('utf8')
const kml = unzip('notam-2026-11-06.kml.gz')
const source = JSON.parse(unzip('notam-search-2026-11-06.json.gz')).DATA
// Independent Python audit of the original TAC, created before implementation.
const truth = JSON.parse(unzip('notam-fields-truth-2026-11-06.json.gz'))
const records = new Map(parseNotamKml(kml).items.map(item => [item.id, item]))

test('production 336 records preserve all original validity, D, F and G fields', () => {
  assert.equal(records.size, 336)
  for (const row of truth) {
    const record = records.get(row.id)
    const fields = splitNotamFields(record.rawText)
    for (const key of ['B', 'C', 'D', 'F', 'G']) {
      assert.equal((fields[key] || '').replace(/\s+/g, ' '), (row.fields[key] || '').replace(/\s+/g, ' '), `${row.id} ${key}`)
    }
    if (row.height_source) {
      for (const [name, expected] of Object.entries(row.height_source)) {
        const bound = record.altitude[`${name}Bound`]
        assert.equal(bound.value, expected.value, `${row.id} ${name} value`)
        assert.equal(bound.unit, expected.ref === 'surface' ? 'SFC' : expected.unit, `${row.id} ${name} unit`)
        assert.equal(bound.ref, expected.ref === 'surface' ? 'AGL' : expected.ref === 'pressure' ? 'STD' : expected.ref, `${row.id} ${name} reference`)
      }
    }
  }
})

test('all 336 E) texts match the official search including final contact parentheses', () => {
  const normalize = text => text.replace(/\s+/g, ' ').trim()
  for (const row of source) {
    const record = records.get(row.NOTAM_NO)
    if (record) assert.equal(normalize(record.summary), normalize(row.ECODE), row.NOTAM_NO)
  }
})

test('search supplements all ten KML omissions including multipart checklist identities', () => {
  const result = reconcileNotamSources(kml, source)
  assert.equal(result.items.length, 346)
  assert.equal(result.audit.supplementedCount, 10)
  assert.equal(new Set(result.items.map(item => item.id)).size, 346)
  assert.ok(result.items.find(item => item.id === 'D3444/26B02'))
  assert.throws(() => reconcileNotamSources(kml, source.slice(1)), /identity mismatch/)
  assert.throws(() => reconcileNotamSources(kml, [...source, source[0]]), /duplicate/)
})

test('legacy snapshots recover altitude and false D fields from original text', () => {
  const row = source.find(row => row.NOTAM_NO === 'C1771/26')
  const item = hydrateNotamItem({ id: row.NOTAM_NO, rawText: row.FULL_TEXT, altitude: { ref: 'AGL' } })
  assert.equal(item.altitude.upperBound.ref, 'AMSL')
  for (const id of ['C1941/26', 'C2009/26', 'Z0688/26', 'Z0622/26']) assert.equal(records.get(id).scheduleText, null, id)
  assert.equal(records.get('A1415/26').validityEnd, 'estimated')
  assert.equal(records.get('C1941/26').validityEnd, 'permanent')
})

test('mixed ground-relative heights are never compared with MSL cruise altitude as if absolute', () => {
  assert.equal(notamBandToFt(records.get('E4686/26').altitude), null)
  assert.equal(notamBandToFt(records.get('E4952/26').altitude), null)
  assert.deepEqual(notamBandToFt(records.get('C1771/26').altitude), { lowFt: 0, highFt: 1200 })
})

test('geographic exceptions and uncertain shapes remain explicit', () => {
  for (const id of ['E4687/26', 'E4690/26', 'D3168/26', 'E5170/26']) assert.ok(records.get(id).geographicExclusions.length, id)
  assert.equal(records.get('E4739/26').approximated, true)
})

test('a one-minute activity between previous five-minute samples is still active', () => {
  assert.equal(scheduleStateOverWindow({ scheduleText: '0901-0902', validFrom: '2026-11-06T00:00:00Z', validTo: '2026-11-07T00:00:00Z', etd: '2026-11-06T09:00:00Z', eta: '2026-11-06T09:05:00Z' }), 'active')
})

test('a malformed or incomplete collection never replaces the last publication', async () => {
  let saves = 0
  const result = await processNotams({ crawl: async () => ({ kml, searchItems: source.slice(1) }),
    save: () => { saves++; return { saved:true } }, archive: () => ({}) })
  assert.equal(result.saved,false)
  assert.equal(saves,0)
  assert.match(result.reason,/identity mismatch/)
})

test('approximated or excluded geometry cannot become a definite route conflict', () => {
  // Exercise this through a real axis to avoid a no-intersection false pass.
  return import('../src/briefing/route-axis.js').then(({buildRouteAxis}) => {
    const route = buildRouteAxis({type:'LineString',coordinates:[[126,35.5],[128,35.5]]})
    const ctx = {axis:route,etd:'2026-11-06T12:00:00Z',eta:'2026-11-06T13:00:00Z',cruiseAltitudeFt:10000}
    const item = {id:'A0001/26',category:'danger',scope:'fir',valid_from:'2026-11-06T00:00:00Z',valid_to:'2026-11-07T00:00:00Z',
      altitude:{lower:0,upper:999,unit:'FL'},geometry:{type:'Polygon',coordinates:[[[126.5,35],[127.5,35],[127.5,36],[126.5,36],[126.5,35]]]},approximated:true}
    const result=matchRouteNotams([item],ctx)
    assert.equal(result.routeNotams.length,1)
    assert.equal(result.routeNotams[0].onRoute,true)
    assert.equal(result.routeNotams[0].comparisonStatus,'undetermined')
    assert.equal(result.routeConflicts.length,0)
  })
})
