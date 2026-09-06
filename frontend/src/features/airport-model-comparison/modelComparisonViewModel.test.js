import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildComparisonViewModel,
  cumulativeHourly,
  firstForecastHour,
  pathSegments,
} from './modelComparisonViewModel.js'

const hour = (base, n) => new Date(Date.parse(base) + n * 3_600_000).toISOString()
const record = (model, runAt, forecastHour, values = {}) => ({
  model,
  run_at: runAt,
  valid_at: hour(runAt, forecastHour),
  forecast_hour: forecastHour,
  window_start_at: hour(runAt, model === 'ecmwf' ? 6 : 0),
  window_end_at: hour(runAt, model === 'ecmwf' ? 18 : 12),
  selection_method: 'nearest_grid',
  grid_lat: 37.5,
  grid_lon: 126.5,
  ceiling_method: model === 'ecmwf' ? 'humidity_based_estimate' : 'model_diagnostic',
  ceiling_status: 'value',
  ...values,
})

const run = '2026-09-06T06:00:00.000Z'
const ecRun = '2026-09-06T00:00:00.000Z'
const payload = {
  airport: { icao: 'RKSI', name: '인천국제공항' },
  effective_now: '2026-09-06T08:20:00.000Z',
  status: 'ready',
  issues: [],
  observations: {
    metar: [{ observed_at: '2026-09-06T08:10:00.000Z', wind_speed_kt: 7, wind_gust_kt: null, temperature_c: 22, dew_point_c: 18, clouds: [{ amount: 'SCT', base_ft: 3000 }], weather: [{ raw: '-RA' }] }],
    amos: [{ observed_at: '2026-09-06T08:00:00.000Z', precipitation_mm: 0.4 }],
    taf: { issued_at: '2026-09-06T05:00:00.000Z', valid_from: run, valid_to: hour(run, 24), base: { wind: { direction: 220, speed: 9 }, clouds: [{ amount: 'BKN', base_ft: 2500 }], wx: [] }, change_groups: [] },
  },
  models: ['kim', 'ecmwf', 'gfs', 'icon'].map(model => ({
    model,
    run_at: model === 'ecmwf' ? ecRun : run,
    available_at: '2026-09-06T08:00:00.000Z',
    records: Array.from({ length: 13 }, (_, i) => record(model, model === 'ecmwf' ? ecRun : run, model === 'ecmwf' ? i + 6 : i, {
      wind_direction_deg: 220 + i,
      wind_speed_kt: 8 + i,
      wind_gust_kt: i === 2 ? null : 12 + i,
      precipitation_mm: i === 3 && model === 'kim' ? null : i ? 0.2 : 0,
      temperature_c: i === 2 && model === 'icon' ? null : 22 - i / 2,
      relative_humidity_pct: 70 + i,
      dew_point_c: 17,
      pressure_msl_hpa: 1008,
      cloud_total_pct: 70,
      cloud_low_pct: 55,
      cloud_mid_pct: 20,
      cloud_high_pct: 10,
      ceiling_agl_ft: model === 'ecmwf' ? null : 3000 - i * 50,
      ceiling_status: model === 'ecmwf' ? 'not_detected_below_limit' : 'value',
    })),
  })),
}

test('firstForecastHour rounds the effective clock to the current or next UTC hour', () => {
  assert.equal(firstForecastHour(Date.parse('2026-09-06T15:00:00Z')), '2026-09-06T15:00:00.000Z')
  assert.equal(firstForecastHour(Date.parse('2026-09-06T15:00:01Z')), '2026-09-06T16:00:00.000Z')
  assert.equal(firstForecastHour(Date.parse('2026-09-06T14:20:00Z')), '2026-09-06T15:00:00.000Z')
})

test('view model shares one UTC axis, preserves actual METAR time, and retains EC F18', () => {
  const vm = buildComparisonViewModel({ data: payload, selectedValidAt: hour(run, 12), tz: 'KST' })
  assert.equal(vm.times.at(-1), hour(run, 12))
  assert.equal(vm.rows.wind.find(row => row.id === 'metar').cells.find(Boolean).valid_at, '2026-09-06T08:10:00.000Z')
  assert.equal(vm.rows.wind.find(row => row.id === 'ecmwf').cells.at(-1).forecast_hour, 18)
  assert.match(vm.timeLabels[0], /KST/)
  const utc = buildComparisonViewModel({ data: payload, selectedValidAt: hour(run, 12), tz: 'UTC' })
  assert.deepEqual(utc.times, vm.times)
  assert.notEqual(utc.timeLabels[0], vm.timeLabels[0])
})

test('temperature and RH stay paired, TAF is excluded, and summary counts complete model records', () => {
  const selected = hour(run, 2)
  const vm = buildComparisonViewModel({ data: payload, selectedValidAt: selected, tz: 'UTC' })
  assert.equal(vm.rows.temperatureRh.some(row => row.id === 'taf'), false)
  assert.equal(vm.rows.temperatureRh.find(row => row.id === 'icon').cells.find(cell => cell?.slot_at === selected).text, '자료 없음 / 72%')
  assert.equal(vm.summary.modelCount, 4)
  assert.match(vm.summary.wind, /4개 모델/)
  assert.deepEqual(vm.rows.precipitation.slice(0, 3).map(row => row.id), ['metar', 'taf', 'amos'])
})

test('TAF conditional groups merge over the base state and remain labelled', () => {
  const conditional = structuredClone(payload)
  conditional.observations.taf.change_groups = [{ type: 'TEMPO', start: hour(run, 2), end: hour(run, 4), wx: [{ raw: 'RA' }], wx_touched: true }]
  const vm = buildComparisonViewModel({ data: conditional, selectedValidAt: hour(run, 2), tz: 'UTC' })
  const wind = vm.rows.wind.find(row => row.id === 'taf').cells.find(cell => cell?.slot_at === hour(run, 2))
  const rain = vm.rows.precipitation.find(row => row.id === 'taf').cells.find(cell => cell?.slot_at === hour(run, 2))
  assert.equal(wind.value, 9)
  assert.equal(wind.condition, 'TEMPO')
  assert.equal(rain.text, 'NSW')
  assert.equal(rain.condition, 'TEMPO')
  assert.match(rain.conditionText, /RA/)
})

test('missing TAF retains explicit wind, weather and ceiling rows without inventing values', () => {
  const data = structuredClone(payload)
  data.observations.taf = null
  const vm = buildComparisonViewModel({ data })
  for (const kind of ['wind', 'precipitation', 'ceiling']) {
    const row = vm.rows[kind].find(row => row.id === 'taf')
    assert.ok(row, kind)
    assert.ok(row.cells.every(cell => cell.value === null && cell.text === '자료 없음'))
  }
  for (const kind of ['wind', 'ceiling']) {
    assert.ok(vm.charts[kind].find(series => series.id === 'taf').points.every(point => point.value === null))
  }
  assert.equal(vm.rows.temperatureRh.some(row => row.id === 'taf'), false)
  assert.equal(vm.charts.precipitation.some(row => row.id === 'taf'), false)
})

test('a valid past selection remains on the shared axis while an outside-window selection reports zero participating models', () => {
  const past = '2026-09-06T04:00:00.000Z'
  const pastVm = buildComparisonViewModel({ data: payload, selectedValidAt: past, tz: 'UTC' })
  assert.equal(pastVm.times[0], past)
  const outside = '2026-09-06T20:00:00.000Z'
  const outsideVm = buildComparisonViewModel({ data: payload, selectedValidAt: outside, tz: 'UTC' })
  assert.equal(outsideVm.times.at(-1), outside)
  assert.equal(outsideVm.summary.modelCount, 0)
})

test('cumulative precipitation and SVG paths stop at the first missing value without treating zero as missing', () => {
  assert.deepEqual(cumulativeHourly([0, 0.5, null, 0.2]), [0, 0.5, null, null])
  assert.deepEqual(pathSegments([{ x: 0, value: 0 }, { x: 1, value: 2 }, { x: 2, value: null }, { x: 3, value: 4 }]), [[{ x: 0, value: 0 }, { x: 1, value: 2 }], [{ x: 3, value: 4 }]])
})

test('source chips preserve observation, run, and availability timestamps and KIM uses the approved method label', () => {
  const withMethods = structuredClone(payload)
  withMethods.models.find(model => model.model === 'kim').records.forEach(item => { item.ceiling_method = 'cloud_condensate_estimate' })
  const vm = buildComparisonViewModel({ data: withMethods, selectedValidAt: hour(run, 2), tz: 'UTC' })
  assert.deepEqual(vm.observationChips.map(chip => chip.id), ['metar', 'taf'])
  assert.equal(vm.observationChips[0].at, '2026-09-06T08:10:00.000Z')
  assert.equal(vm.modelChips[0].available_at, '2026-09-06T08:00:00.000Z')
  assert.equal(vm.rows.ceiling.find(row => row.id === 'kim').cells.find(cell => cell?.slot_at === hour(run, 2)).method, '운량·응결물 기반 추정')
})

test('a wildly old selected instant stays selected without expanding the rendered hourly axis', () => {
  const vm = buildComparisonViewModel({ data: payload, selectedValidAt: '1970-01-01T00:00:00.000Z', tz: 'UTC' })
  assert.equal(vm.selectedValidAt, '1970-01-01T00:00:00.000Z')
  assert.ok(vm.times.length < 48)
  assert.equal(vm.summary.modelCount, 0)
})

test('details retain model timing, terrain and ceiling evidence and charts include gust and conditional values', () => {
  const data = structuredClone(payload)
  data.airport.elevation_ft = 100
  const item = data.models[0].records[3]
  Object.assign(item, { temporal_method: 'native_hourly', available_at: run, collected_at: hour(run, 1), grid_elevation_m: 50,
    ceiling_source_levels: [{ pressure_hpa: 925, agl_m: 700, agl_ft: 2296.59, cloud_fraction: 0.8, selected: true, tqc_kgkg: 0.00001, tqi_kgkg: 0 }],
    field_provenance: { wind_gust_kt: { source_variable: 'gust', source_unit: 'm/s', method: 'converted', missing_reason: null } } })
  const vm = buildComparisonViewModel({ data })
  const point = vm.charts.wind.find(s => s.id === 'kim').points.find(p => p.at === item.valid_at)
  assert.match(point.text, /G 15 kt/)
  assert.equal(point.detail.temporal_method, 'native_hourly')
  assert.equal(point.detail.airport_icao, 'RKSI')
  assert.equal(point.detail.grid_elevation_difference_m, 19.52)
  assert.equal(point.detail.available_at, run)
  assert.equal(point.detail.collected_at, hour(run, 1))
  assert.equal(point.detail.ceiling_source_levels[0].selected, true)
  assert.deepEqual(point.detail.field_provenance, item.field_provenance)
  assert.match(vm.summary.ceiling, /5,000 ft 이하 조건 미검출/)
})

test('each past METAR report retains its real instant in charts and the hourly cell and future reports are excluded', () => {
  const data = structuredClone(payload)
  data.observations.metar.push({ ...data.observations.metar[0], observed_at: '2026-09-06T08:15:00.000Z', wind_speed_kt: 10 })
  data.observations.metar.push({ ...data.observations.metar[0], observed_at: '2026-09-06T08:30:00.000Z', wind_speed_kt: 15 })
  const vm = buildComparisonViewModel({ data })
  const reports = vm.rows.wind.find(r => r.id === 'metar').cells.find(Boolean).reports
  assert.deepEqual(reports.map(r => r.valid_at), ['2026-09-06T08:10:00.000Z', '2026-09-06T08:15:00.000Z'])
  assert.deepEqual(vm.charts.wind.find(r => r.id === 'metar').points.filter(p => p.at).map(p => p.at), reports.map(r => r.valid_at))
})
