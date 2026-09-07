import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  associateOpenMeteoPayloads,
  buildOpenMeteoRequest,
  collectOpenMeteo,
  mergeIconPressureWindow,
  normalizeOpenMeteoAirport,
} from '../src/airport-model-comparison/open-meteo.js'

const fixtureDir = new URL('./fixtures/airport-model-comparison/', import.meta.url)
const read = name => JSON.parse(fs.readFileSync(new URL(name, fixtureDir), 'utf8'))
const airport = { icao: 'RKSI', lat: 37.46, lon: 126.44, elevation_m: 7 }
const run_at = '2026-09-06T00:00:00.000Z'
const window = {
  start_at: '2026-09-06T06:00:00.000Z', end_at: '2026-09-06T18:00:00.000Z',
  forecast_hours: Array.from({ length: 13 }, (_, i) => i + 6),
}

test('first collection and a new provider run do not require an existing model pointer',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'amo-first-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}))
  const request=async({operation})=>new Response(JSON.stringify(operation.endsWith('_meta')?{last_run_initialisation_time:1788652800,last_run_availability_time:1788678540}:read('open-meteo-ecmwf-rksi-f000-f018.json')))
  const result=await collectOpenMeteo({model:'ecmwf',selectedRuns:{RKSI:[{model:'icon',run_at:'2026-09-06T06:00:00Z'}]},root,airports:[airport],nowMs:Date.parse('2026-09-06T08:00:00Z'),request})
  assert.deepEqual(result.publishedAirports,['RKSI']);assert.equal(result.windows.RKSI.forecast_hours[0],6)
})

test('builds a batched run-fixed UTC request through F18', () => {
  const url = buildOpenMeteoRequest({ model: 'ecmwf', airports: [airport, { icao: 'RKSS', lat: 37.56, lon: 126.8 }], run_at, window })
  assert.equal(url.origin + url.pathname, 'https://single-runs-api.open-meteo.com/v1/forecast')
  assert.equal(url.searchParams.get('run'), '2026-09-06T00:00')
  assert.equal(url.searchParams.get('timezone'), 'UTC')
  assert.equal(url.searchParams.get('elevation'), 'nan,nan')
  assert.equal(url.searchParams.get('forecast_hours'), '19')
  assert.match(url.searchParams.get('hourly'), /cloud_cover_700hPa/)
})

test('normalizes the real EC fixture to F6-F18 and preserves first-slot precipitation', () => {
  const records = normalizeOpenMeteoAirport({ payload: read('open-meteo-ecmwf-rksi-f000-f018.json'), airport, model: 'ecmwf', run_at, window, available_at: '2026-09-06T07:09:00Z', collected_at: '2026-09-06T07:20:00Z' })
  assert.equal(records.length, 13)
  assert.equal(Object.keys(records[0].field_provenance).length, 14)
  assert.equal(records[0].forecast_hour, 6)
  assert.equal(records[0].precipitation_mm, 0)
  assert.equal(records.at(-1).forecast_hour, 18)
  assert.equal(records[0].temporal_method, 'interpolated_hourly')
})

test('rejects a nonzero response timezone and an incomplete target window', () => {
  const payload = read('open-meteo-ecmwf-rksi-f000-f018.json')
  assert.throws(() => normalizeOpenMeteoAirport({ payload: { ...payload, utc_offset_seconds: 32400 }, airport, model: 'ecmwf', run_at, window, available_at: null }), /invalid_open_meteo_timezone/)
  const shortened = structuredClone(payload)
  for (const key of Object.keys(shortened.hourly)) shortened.hourly[key].pop()
  assert.throws(() => normalizeOpenMeteoAirport({ payload: shortened, airport, model: 'ecmwf', run_at, window, available_at: null }), /incomplete_forecast_window/)
})

test('associates reversed batch payloads by a unique resolution-scale grid match', () => {
  const rksi = read('open-meteo-ecmwf-rksi-f000-f018.json')
  const rkssAirport = { icao: 'RKSS', lat: 37.56, lon: 126.8 }
  const rkss = { ...structuredClone(rksi), latitude: 37.5, longitude: 126.75 }
  const associated = associateOpenMeteoPayloads([rkss, rksi], [airport, rkssAirport], 'ecmwf')
  assert.equal(associated.get('RKSI'), rksi)
  assert.equal(associated.get('RKSS'), rkss)
  assert.throws(() => associateOpenMeteoPayloads([rksi, structuredClone(rksi)], [airport, rkssAirport], 'ecmwf'), /open_meteo_(ambiguous|duplicate|unmatched)_response/)
})

test('uses only contract missing reasons for provider nulls, invalid values, and planned absence', () => {
  const payload = read('open-meteo-ecmwf-rksi-f000-f018.json')
  payload.hourly.wind_speed_10m[6] = null
  payload.hourly.temperature_2m[6] = 'bad'
  const records = normalizeOpenMeteoAirport({ payload, airport, model: 'ecmwf', run_at, window, available_at: null })
  assert.equal(records[0].field_provenance.wind_speed_kt.missing_reason, 'provider_missing')
  assert.equal(records[0].field_provenance.temperature_c.missing_reason, 'invalid_value')
  assert.equal(records[0].field_provenance.visibility_m.missing_reason, 'not_provided')
})

test('keeps synthetic ICON F000 gust and precipitation structurally null', () => {
  const iconWindow = { start_at: run_at, end_at: '2026-09-06T12:00:00.000Z', forecast_hours: Array.from({ length: 13 }, (_, i) => i) }
  const records = normalizeOpenMeteoAirport({ payload: read('open-meteo-icon-rksi-f000-f012-synthetic.json'), airport, model: 'icon', run_at, window: iconWindow, available_at: '2026-09-06T04:03:00Z' })
  assert.equal(records[0].wind_gust_kt, null)
  assert.equal(records[0].precipitation_mm, null)
  assert.equal(records[0].field_provenance.precipitation_mm.missing_reason, 'structural_f000')
  assert.notEqual(records[6].wind_gust_kt, null)
})

test('missing pressure-level cloud cover remains missing input instead of becoming clear sky', () => {
  for (const missing of [null, '', '80']) {
    const payload = read('open-meteo-ecmwf-rksi-f000-f018.json')
    for (const field of Object.keys(payload.hourly).filter(key => /^cloud_cover_\d+hPa$/.test(key))) payload.hourly[field][6] = missing
    const records = normalizeOpenMeteoAirport({ payload, airport, model: 'ecmwf', run_at, window, available_at: null })
    assert.equal(records[0].ceiling_status, 'missing_input')
    assert.equal(records[0].ceiling_agl_ft, null)
    assert.equal(records[0].field_provenance.ceiling_agl_ft.missing_reason, 'provider_missing')
  }
})

test('requires stable ICON metadata and exact numeric overlap', () => {
  const single = read('open-meteo-icon-rksi-f000-f012-synthetic.json')
  const general = structuredClone(single)
  for (const level of [975, 950, 900]) for (const prefix of ['cloud_cover', 'geopotential_height']) general.hourly[`${prefix}_${level}hPa`].fill(0)
  const iconWindow = { start_at: run_at, end_at: '2026-09-06T12:00:00.000Z', forecast_hours: Array.from({ length: 13 }, (_, i) => i) }
  const merge = overrides => mergeIconPressureWindow({ single, general, airport, window: iconWindow, run_at, metaBefore: { last_run_initialisation_time: 1788652800 }, metaAfter: { last_run_initialisation_time: 1788652800 }, ...overrides })
  assert.equal(merge().hourly.time.length, 13)
  assert.throws(() => merge({ metaAfter: { last_run_initialisation_time: 1788674400 } }), /icon_run_changed/)
  general.hourly.cloud_cover_1000hPa[2] = null
  assert.throws(() => merge(), /icon_overlap_mismatch/)
  general.hourly.cloud_cover_1000hPa[2] = single.hourly.cloud_cover_1000hPa[2]
  general.hourly_units.cloud_cover_975hPa = 'fraction'
  assert.throws(() => merge(), /invalid_open_meteo_field/)
  general.hourly_units.cloud_cover_975hPa = '%'
  general.longitude = 129.5
  assert.throws(() => merge(), /open_meteo_coordinate_mismatch/)
  general.longitude = single.longitude
  general.hourly.time = general.hourly.time.map(value => value.replace('2026-09-06', '2026-09-07'))
  assert.throws(() => merge(), /incomplete_forecast_window/)
})

test('publishes a valid ICON airport when a sibling supplement has an invalid unit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-om-'))
  const rkss = { icao: 'RKSS', lat: 37.56, lon: 126.8, elevation_m: 18 }
  const makePayload = (gridLon, badUnit = false) => {
    const value = read('open-meteo-icon-rksi-f000-f012-synthetic.json')
    value.longitude = gridLon
    for (const level of [975, 950, 900]) for (const prefix of ['cloud_cover', 'geopotential_height']) value.hourly[`${prefix}_${level}hPa`].fill(0)
    if (badUnit) value.hourly_units.cloud_cover_975hPa = 'fraction'
    return value
  }
  const singles = [makePayload(126.75), makePayload(126.5)]
  const generals = [makePayload(126.75, true), makePayload(126.5)]
  const meta = { last_run_initialisation_time: 1788652800, last_run_availability_time: 1788678540 }
  const request = async ({ operation }) => new Response(JSON.stringify(operation.endsWith('_meta') ? meta : operation.endsWith('pressure_window') ? generals : singles))
  const runs = Object.fromEntries(['RKSI', 'RKSS'].map(icao => [icao, [{ model: 'icon', run_at }]]))
  const report = await collectOpenMeteo({ model: 'icon', selectedRuns: runs, root, airports: [airport, rkss], nowMs: Date.parse('2026-09-06T08:00:00Z'), request })
  assert.deepEqual(report.publishedAirports, ['RKSI'])
  assert.deepEqual(report.failedAirports, ['RKSS'])
  assert.equal(report.errors[0].code, 'invalid_open_meteo_field:cloud_cover_975hPa')
})

test('defers until ten minutes after provider availability', async () => {
  const report = await collectOpenMeteo({ model: 'ecmwf', selectedRuns: { RKSI: [{ model: 'ecmwf', run_at }] }, root: fs.mkdtempSync(path.join(os.tmpdir(), 'amo-om-')), airports: [airport], now: () => new Date('2026-09-06T07:18:59Z'), request: async ({ operation }) => new Response(JSON.stringify(operation.endsWith('_meta') ? { last_run_initialisation_time: 1788652800, last_run_availability_time: 1788678540 } : {})) })
  assert.equal(report.deferred, true)
  assert.deepEqual(report.publishedAirports, [])
})

test('re-slices a cached expanded EC response when the airport anchor advances', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-om-'))
  const payload = read('open-meteo-ecmwf-rksi-f000-f018.json')
  let forecasts = 0
  const request = async ({ operation }) => {
    if (operation.endsWith('_meta')) return new Response(JSON.stringify({ last_run_initialisation_time: 1788652800, last_run_availability_time: 1788678540 }))
    forecasts += 1
    return new Response(JSON.stringify(payload))
  }
  const base = { model: 'ecmwf', run_at }
  const first = await collectOpenMeteo({ model: 'ecmwf', selectedRuns: { RKSI: [base, { model: 'kim', run_at }] }, root, airports: [airport], now: () => new Date('2026-09-06T08:00:00Z'), request })
  const second = await collectOpenMeteo({ model: 'ecmwf', selectedRuns: { RKSI: [base, { model: 'kim', run_at: '2026-09-06T06:00:00Z' }] }, root, airports: [airport], now: () => new Date('2026-09-06T08:01:00Z'), request })
  assert.deepEqual(first.publishedAirports, ['RKSI'])
  assert.deepEqual(second.publishedAirports, ['RKSI'])
  assert.equal(second.windows.RKSI.forecast_hours[0], 6)
  assert.equal(forecasts, 1)
  const rawDir = path.join(root, 'airport_model_comparison', 'ecmwf', 'runs', '202609060000', 'raw')
  assert.equal(fs.readdirSync(rawDir).filter(name => name.endsWith('.json.gz')).length, 1)

  const restarted = await import(`../src/airport-model-comparison/open-meteo.js?restart=${Date.now()}`)
  const third = await restarted.collectOpenMeteo({ model: 'ecmwf', selectedRuns: { RKSI: [base, { model: 'kim', run_at: '2026-09-06T06:00:00Z' }] }, root, airports: [airport], nowMs: Date.parse('2026-09-06T08:02:00Z'), request })
  assert.deepEqual(third.reusedAirports, ['RKSI'])
  assert.equal(forecasts, 1)
})

test('rejects an already-aborted collection before making a request', async () => {
  const controller = new AbortController()
  controller.abort()
  let requests = 0
  await assert.rejects(collectOpenMeteo({ model: 'ecmwf', selectedRuns: { RKSI: [{ model: 'ecmwf', run_at }] }, root: fs.mkdtempSync(path.join(os.tmpdir(), 'amo-om-')), airports: [airport], signal: controller.signal, request: async () => { requests += 1 } }), /AbortError/)
  assert.equal(requests, 0)
})
