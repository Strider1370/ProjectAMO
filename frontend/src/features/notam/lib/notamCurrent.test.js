import test from 'node:test'
import assert from 'node:assert/strict'
import { filterNotamTime, deriveNotamTime, formatAltitude, formatValidPeriod } from './notamViewModel.js'
import { parseNotamAltitude } from '../../../../../shared/notam-fields.js'
import { notamToFeatureCollection, displayGeometry } from './notamGeoJson.js'

const now = Date.parse('2026-11-06T12:00:00Z')
const base = { valid_from: '2026-11-06T00:00:00Z', valid_to: '2026-11-07T00:00:00Z', category: 'danger', geometry: { type: 'Point', coordinates: [127,36] } }

test('current-only includes actual D) activity and excludes unknown, future, outside-D and exact expiry', () => {
  const items = [
    { ...base, id: 'active', schedule_text: '1100-1300' },
    { ...base, id: 'outside', schedule_text: '1400-1500' },
    { ...base, id: 'unknown', schedule_text: 'MON-FRI SR-SS' },
    { ...base, id: 'expired', valid_to: '2026-11-06T12:00:00Z' },
    { ...base, id: 'future', valid_from: '2026-11-06T13:00:00Z' },
  ]
  assert.deepEqual(filterNotamTime(items, now, true).map(item => item.id), ['active'])
  assert.deepEqual(filterNotamTime(items, now).map(item => item.id), ['active','outside','unknown','future'])
  assert.equal(deriveNotamTime(items[3], now).state, 'expired')
  assert.deepEqual(filterNotamTime(items, Date.parse('2026-11-06T14:00:00Z'), true).map(item => item.id), ['outside','future'])
  assert.equal(notamToFeatureCollection({items}, now).features.some(feature => feature.id === 'expired'), false)
})

test('the next D) activity, rather than the original B) date, can be imminent', () => {
  const state = deriveNotamTime({ ...base, schedule_text: '1230-1300' }, now)
  assert.equal(state.state, 'soon')
  assert.equal(state.nextStart, Date.parse('2026-11-06T12:30:00Z'))
})

test('display keeps independent AGL, AMSL and pressure level bounds and marks Q-only as unknown', () => {
  assert.equal(formatAltitude(parseNotamAltitude('', 'SFC', '1200FT AMSL')), 'SFC–1,200FT AMSL')
  assert.equal(formatAltitude(parseNotamAltitude('', '1000FT AGL', '6000FT AMSL')), '1,000FT AGL–6,000FT AMSL')
  assert.equal(formatAltitude(parseNotamAltitude('', '5000FT AGL', 'FL150')), '5,000FT AGL–FL150')
  assert.equal(formatAltitude(parseNotamAltitude('/000/999/3535N12700E999')), '고도 확인')
})

test('PERM and EST survive UTC and KST display', () => {
  assert.equal(formatValidPeriod(base.valid_from, base.valid_to, 'UTC', 'estimated'), '11/06 00:00 ~ 11/07 00:00 Z (EST)')
  assert.equal(formatValidPeriod(base.valid_from, base.valid_to, 'KST', 'estimated'), '11/06 09:00 ~ 11/07 09:00 KST (EST)')
  assert.equal(formatValidPeriod(base.valid_from, base.valid_to, 'UTC', 'permanent'), '11/06 00:00 ~ PERM Z')
  assert.equal(formatValidPeriod(base.valid_from, base.valid_to, 'KST', 'permanent'), '11/06 09:00 ~ PERM KST')
})

test('corridors are drawn at their NM half-width, with approximation/exclusion notes in map payloads', () => {
  const corridor = { ...base, id:'corridor', coverage:'area', scope:'fir', bufferNm:1,
    geometry:{ type:'LineString',coordinates:[[127,36],[127.1,36]] }, geographicExclusions:['EXC RKNY CTR'] }
  const geometry = displayGeometry(corridor)
  assert.equal(geometry.type, 'Polygon')
  const latitudes = geometry.coordinates[0].map(point=>point[1])
  assert.ok(Math.max(...latitudes) > 36.016 && Math.min(...latitudes) < 35.984)
  const feature = notamToFeatureCollection({items:[corridor]}, now, 'UTC').features[0]
  assert.equal(feature.properties.scope,'airspace')
  assert.match(feature.properties.geometryNote,/제외 구역 미반영/)
  assert.match(feature.properties.validPeriod,/ Z$/)
})
