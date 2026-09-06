import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseGfsGrib2, readPackedUnsigned, readSignMagnitude16, sampleGfsMessage } from '../src/parsers/gfs-grib2-parser.js'
import { buildGfsRequest, collectGfs, gfsHourlyPrecipitation, normalizeGfsHour } from '../src/airport-model-comparison/gfs.js'

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/airport-model-comparison')
const readFixture = name => fs.readFileSync(path.join(fixtureRoot, name))
const expected = JSON.parse(readFixture('gfs-eccodes-expected.json'))
const airport = { lat: 37.4602, lon: 126.4407 }

test('nearest-grid sampling rejects geographic points outside the domain before rounding',()=>{
  const message={grid:{nx:2,ny:2,firstLon:129,lastLon:130,firstLat:35,lastLat:36,iStep:1,jStep:1},values:[1,2,3,4]}
  for(const point of [{lon:128.99,lat:35.5},{lon:130.01,lat:35.5},{lon:129.5,lat:34.99},{lon:129.5,lat:36.01}]) assert.equal(sampleGfsMessage(message,point),null)
  assert.equal(sampleGfsMessage(message,{lon:-230,lat:36}).value,4)
})

test('simple-packing numeric helpers use GRIB sign-magnitude and MSB bit order', () => {
  assert.equal(readPackedUnsigned(Buffer.from([0b10110000]), 0, 3), 5)
  assert.equal(readPackedUnsigned(Buffer.from([0b10110000]), 3, 3), 4)
  assert.equal(readSignMagnitude16(Buffer.from([0x80, 0x02]), 0), -2)
})

for (const hour of [8, 9]) test(`production parser matches independent ecCodes values for F${hour}`, () => {
  const messages = parseGfsGrib2(readFixture(`gfs-f${String(hour).padStart(3, '0')}.grib2`))
  assert.equal(messages.length, expected.records[String(hour)].length)
  for (const reference of expected.records[String(hour)]) {
    const matches = messages.filter(message => message.shortName === reference.shortName
      && message.stepType === reference.stepType && message.startStep === reference.startStep
      && message.endStep === reference.endStep && message.typeOfLevel === reference.typeOfLevel
      && message.level === reference.level)
    assert.equal(matches.length, 1, JSON.stringify(reference))
    const message = matches[0]
    assert.equal(message.run_at, '2026-09-06T00:00:00.000Z')
    assert.equal(message.units, reference.units)
    assert.equal(message.grid.nx * message.grid.ny, 825)
    const point = sampleGfsMessage(message, airport)
    assert.equal(point.grid_lat, reference.point.lat)
    assert.equal(point.grid_lon, reference.point.lon)
    assert.ok(Math.abs(point.value - reference.point.value) <= 1e-7, `${reference.shortName}: ${point.value}`)
  }
})

test('parser rejects corrupt message and section lengths', () => {
  const truncated = readFixture('gfs-f008.grib2').subarray(0, 100)
  assert.throws(() => parseGfsGrib2(truncated), /grib_message_length/)
  const corrupt = Buffer.from(readFixture('gfs-f008.grib2'))
  corrupt.writeUInt32BE(0xffff_ffff, 16)
  assert.throws(() => parseGfsGrib2(corrupt), /grib_section_length/)
})

test('NOMADS request fixes the run, hour, Korean bbox, levels and variables', () => {
  const url = buildGfsRequest({ run_at: '2026-09-06T00:00:00Z', forecast_hour: 9 })
  assert.equal(url.hostname, 'nomads.ncep.noaa.gov')
  assert.equal(url.searchParams.get('file'), 'gfs.t00z.pgrb2.0p25.f009')
  assert.equal(url.searchParams.get('dir'), '/gfs.20260906/00/atmos')
  assert.deepEqual(['leftlon', 'rightlon', 'toplat', 'bottomlat'].map(k => url.searchParams.get(k)), ['124', '132', '39', '33'])
  for (const key of ['lev_surface', 'lev_cloud_ceiling', 'var_APCP', 'var_TCDC', 'var_VIS']) assert.equal(url.searchParams.get(key), 'on')
})

test('hourly precipitation uses adjacent same-run 0-based accumulations', () => {
  const grid = { nx: 1, ny: 1, firstLat: 35, firstLon: 129, iStep: .25, jStep: .25 }
  const message = (run_at, startStep, endStep, value) => ({ parameter: 'APCP', stepType: 'accum', run_at, startStep, endStep, units: 'kg m**-2', grid, values: [value] })
  const run = '2026-09-06T00:00:00.000Z', airport = { lat: 35, lon: 129 }
  assert.ok(Math.abs(gfsHourlyPrecipitation({ current: [message(run, 0, 9, 3.2), message(run, 6, 9, .7)], previous: [message(run, 0, 8, 2)], forecast_hour: 9, airport }) - 1.2) < 1e-12)
  assert.throws(() => gfsHourlyPrecipitation({ current: [message(run, 0, 9, 3.2)], previous: [message('2026-09-06T06:00:00.000Z', 0, 8, 2)], forecast_hour: 9, airport }), /gfs_precipitation_identity/)
  assert.equal(gfsHourlyPrecipitation({ current: [message(run, 0, 9, 3.2)], previous: [], forecast_hour: 9, airport }), null)
  assert.equal(gfsHourlyPrecipitation({ current: [message(run, 0, 1, 1), message(run, 0, 1, 2)], previous: [], forecast_hour: 1, airport }), null)
})

test('actual GFS 06Z F001 equivalent duplicate APCP messages normalize as one provider field', () => {
  const messages = parseGfsGrib2(readFixture('gfs-20260906-06-f001.grib2'))
  const precipitation = messages.filter(message => message.parameter === 'APCP')
  assert.equal(precipitation.length, 2)
  assert.deepEqual(precipitation.map(message => [message.startStep, message.endStep]), [[0, 1], [0, 1]])
  assert.deepEqual(precipitation[0].values, precipitation[1].values)
  assert.equal(gfsHourlyPrecipitation({ current: messages, previous: [], forecast_hour: 1, airport }), 0)
})

test('bitmap point counts and average-only cloud fields are rejected', () => {
  const corrupt = Buffer.from(readFixture('gfs-f009.grib2'))
  let messageStart = 0
  while (messageStart < corrupt.length) {
    const end = messageStart + Number(corrupt.readBigUInt64BE(messageStart + 8))
    let cursor = messageStart + 16
    while (cursor < end - 4) {
      const length = corrupt.readUInt32BE(cursor)
      if (corrupt[cursor + 4] === 6) { corrupt[cursor + 5] = 0; assert.throws(() => parseGfsGrib2(corrupt), /invalid_grib_bitmap_count/); cursor = end; messageStart = corrupt.length; break }
      cursor += length
    }
    messageStart = end
  }
  const messages = parseGfsGrib2(readFixture('gfs-f009.grib2')).filter(message => message.parameter !== 'LCDC' || message.stepType !== 'instant')
  assert.throws(() => normalizeGfsHour({ airport: { icao: 'RKSI', lat: 37.4602, lon: 126.4407 }, messages,
    previousMessages: parseGfsGrib2(readFixture('gfs-f008.grib2')), run_at: '2026-09-06T00:00:00Z', forecast_hour: 9,
    window: { start_at: '2026-09-06T00:00:00Z', end_at: '2026-09-06T12:00:00Z' }, available_at: null, collected_at: '2026-09-06T06:10:00Z' }), /gfs_field_count:LCDC/)
})

test('diagnostic ceiling recognizes quantized no-ceiling marker and real RKPU height', () => {
  const messages = parseGfsGrib2(readFixture('gfs-f009.grib2'))
  const base = { airport: { icao: 'RKSI', lat: 37.4602, lon: 126.4407 }, messages, previousMessages: parseGfsGrib2(readFixture('gfs-f008.grib2')),
    run_at: '2026-09-06T00:00:00Z', forecast_hour: 9, window: { start_at: '2026-09-06T00:00:00Z', end_at: '2026-09-06T12:00:00Z' }, available_at: '2026-09-06T05:36:00Z', collected_at: '2026-09-06T06:10:00Z' }
  assert.equal(normalizeGfsHour(base).ceiling_status, 'no_ceiling')
  const rkpu = normalizeGfsHour({ ...base, airport: { icao: 'RKPU', lat: 35.5935, lon: 129.3518 } })
  assert.equal(rkpu.ceiling_status, 'value')
  assert.ok(Math.abs(rkpu.ceiling_agl_ft - 3679.585374) < .001)
  assert.equal(rkpu.field_provenance.ceiling_agl_ft.source_unit, 'gpm')
})

test('collector uses injected observable request and clock and reports invalid upstream without publishing', async () => {
  const calls = []
  const report = await collectGfs({ root: '/unused', airports: [{ icao: 'RKSI', lat: 37.4602, lon: 126.4407 }],
    clock: () => Date.parse('2026-09-06T06:10:00Z'), requestObservedApi: async request => {
      calls.push(request)
      return new Response('<html>not ready</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].operation, 'nomads_gfs_filter')
  assert.equal(new URL(calls[0].url).searchParams.get('file'), 'gfs.t00z.pgrb2.0p25.f000')
  assert.deepEqual(report.publishedAirports, [])
  assert.deepEqual(report.failedAirports, ['RKSI'])
  assert.equal(report.run_at, '2026-09-06T00:00:00.000Z')
})

test('collector honors an already-aborted signal before any request', async () => {
  const controller = new AbortController(); controller.abort(new Error('stop'))
  let calls = 0
  const report = await collectGfs({ root: '/unused', airports: [{ icao: 'RKSI', lat: 37.4602, lon: 126.4407 }], signal: controller.signal,
    run_at: '2026-09-06T00:00:00Z', requestObservedApi: async () => { calls += 1 } })
  assert.equal(calls, 0)
  assert.deepEqual(report.failedAirports, ['RKSI'])
  assert.equal(report.errors[0].message, 'stop')
})
