import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildComparisonViewModel,
  cumulativeHourly,
  directionRange,
  firstForecastHour,
  formatDirectionRange,
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

test('humidity uses only on-the-hour observations and leaves missing or future slots empty', () => {
  const data = { ...payload, effective_now: '2026-09-06T15:50:00.000Z', observations: { metar: [
    { observed_at: '2026-09-06T13:00:00.000Z', temperature_c: 23, dew_point_c: 18 },
    { observed_at: '2026-09-06T14:30:00.000Z', temperature_c: 20, dew_point_c: 20 },
    ...['15:00', '15:12', '15:17', '15:44'].map((time,i) => ({ observed_at: `2026-09-06T${time}:00.000Z`, temperature_c: 19+i, dew_point_c: 19 })),
    { observed_at: '2026-09-06T16:00:00.000Z', temperature_c: 22, dew_point_c: 22 },
  ] } }
  const vm = buildComparisonViewModel({ data })
  const humidity = vm.charts.humidity.find(row => row.id === 'metar')
  assert.deepEqual(humidity.points.map(point => point.at), vm.times)
  const byHour = new Map(humidity.points.map(point => [point.at, point]))
  assert.equal(humidity.points.filter(point => Number.isFinite(point.value)).length, 2)
  assert.equal(byHour.get('2026-09-06T14:00:00.000Z').value, null)
  assert.equal(byHour.get('2026-09-06T15:00:00.000Z').value, 100)
  assert.equal(byHour.get('2026-09-06T15:00:00.000Z').observed_at, '2026-09-06T15:00:00.000Z')
  assert.equal(byHour.get('2026-09-06T16:00:00.000Z').value, null)
  assert.equal(byHour.get('2026-09-06T16:00:00.000Z').status, 'observation_pending')
  assert.equal(vm.charts.temperatureRh.find(row => row.id === 'metar').points.filter(point => Number.isFinite(point.value)).length, 2)
})

const payload = {
  airport: { icao: 'RKSI', name: '인천국제공항' },
  effective_now: '2026-09-06T08:20:00.000Z',
  status: 'ready',
  issues: [],
  observations: {
    metar: [{ observed_at: '2026-09-06T08:00:00.000Z', wind_speed_kt: 7, wind_gust_kt: null, temperature_c: 22, dew_point_c: 18, clouds: [{ amount: 'SCT', base_ft: 3000 }], weather: [{ raw: '-RA' }] }],
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

test('compact summary keeps model order, zero rain, NSC and missing values distinct', () => {
  const vm = buildComparisonViewModel({ data: payload, selectedValidAt: hour(run, 0) })
  assert.equal(vm.summary.compact.windRange, '8–8')
  assert.equal(vm.summary.compact.gustRange, '12–12')
  assert.deepEqual(vm.summary.compact.models.map(m => m.id), ['kim', 'ecmwf', 'gfs', 'icon'])
  assert.equal(vm.summary.compact.models[0].precipitation, '0.0')
  assert.equal(vm.summary.compact.models[1].ceiling, 'NSC')
  const missing = buildComparisonViewModel({ data: { ...payload, models: [] }, selectedValidAt: run })
  assert.equal(missing.summary.compact.windRange, null)
  assert.equal(missing.summary.compact.gustRange, null)
  assert.equal(missing.summary.compact.models[0].precipitation, '예보 범위 밖')
  assert.equal(missing.summary.compact.models[0].ceiling, '예보 범위 밖')
})

test('view model shares one UTC axis, preserves actual METAR time, and retains EC F18', () => {
  const vm = buildComparisonViewModel({ data: payload, selectedValidAt: hour(run, 12), tz: 'KST' })
  assert.equal(vm.times.at(-1), hour(run, 12))
  assert.equal(vm.rows.wind.find(row => row.id === 'metar').cells.find(Boolean).valid_at, '2026-09-06T08:00:00.000Z')
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

test('TAF temporary periods display one active value and restore the prevailing value afterwards', () => {
  const conditional = structuredClone(payload)
  conditional.observations.taf.change_groups = [{ type: 'TEMPO', start: hour(run, 2), end: hour(run, 4), wx: [{ raw: 'RA' }], wx_touched: true }]
  const vm = buildComparisonViewModel({ data: conditional, selectedValidAt: hour(run, 2), tz: 'UTC' })
  const wind = vm.rows.wind.find(row => row.id === 'taf').cells.find(cell => cell?.slot_at === hour(run, 2))
  const rain = vm.rows.precipitation.find(row => row.id === 'taf').cells.find(cell => cell?.slot_at === hour(run, 2))
  assert.equal(wind.value, 9)
  assert.equal(rain.text, 'RA')
  assert.equal(rain.conditionText, undefined)
  const later = vm.rows.precipitation.find(row => row.id === 'taf').cells.find(cell => cell?.slot_at === hour(run, 4))
  assert.equal(later.text, 'NSW')
})

test('TAF wind, weather and ceiling each switch a single value at BECMG, TEMPO and FM boundaries', () => {
  const data=structuredClone(payload)
  data.observations.taf={issued_at:run,valid_from:run,valid_to:hour(run,24),base:{wind:{direction:30,speed:10},wx:[],clouds:[]},change_groups:[
    {type:'BECMG',start:hour(run,3),end:hour(run,5),wind:{direction:80,speed:20},wx:[{raw:'RA'}],clouds:[{amount:'BKN',base:500}]},
    {type:'TEMPO',start:hour(run,6),end:hour(run,8),wind:{direction:100,speed:30},wx:[{raw:'SN'}],clouds:[{amount:'BKN',base:200}]},
    {type:'FM',start:hour(run,9),wind:{direction:20,speed:5},wx:[],clouds:[]},
  ]}
  const vm=buildComparisonViewModel({data})
  for(const [hf,speed,weather,ceiling] of [[3,10,'NSW','NSC'],[5,20,'RA','500 ft'],[6,30,'SN','200 ft'],[8,20,'RA','500 ft'],[9,5,'NSW','NSC']]) {
    const cell=kind=>vm.rows[kind].find(row=>row.id==='taf').cells.find(cell=>cell?.slot_at===hour(run,hf))
    assert.equal(cell('wind').value,speed)
    assert.equal(cell('precipitation').text,weather)
    assert.equal(cell('ceiling').text,ceiling)
    for(const kind of ['wind','precipitation','ceiling']) assert.equal(cell(kind).conditionText,undefined)
  }
})

test('wind omits absent gusts and spells available gusts in full', () => {
  const vm = buildComparisonViewModel({ data: payload })
  const metar = vm.rows.wind.find(row => row.id === 'metar').cells.find(Boolean)
  const kim = vm.rows.wind.find(row => row.id === 'kim').cells.find(cell => cell?.forecast_hour === 1)
  assert.equal(metar.subtext, null)
  assert.equal(kim.subtext, 'Gust 13 kt')
  assert.doesNotMatch(vm.charts.wind.find(row => row.id === 'metar').points.find(point => point.at).text, /돌풍 없음|돌풍 자료 없음/)
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
  assert.equal(vm.charts.precipitation.find(row => row.id === 'taf').categorical, true)
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

test('cumulative charts share an interval boundary, tolerate structural F000, and do not bridge later gaps', () => {
  const data = structuredClone(payload)
  for (const model of data.models) model.records[0].precipitation_mm = null
  const vm = buildComparisonViewModel({ data, selectedValidAt: hour(run, -2), tz: 'KST' })
  assert.equal(vm.precipitationStartAt, run)
  assert.match(vm.precipitationStartLabel, /09.06 15:00 KST/)
  const kim = vm.charts.precipitation.find(s => s.id === 'kim').points
  assert.deepEqual(kim.slice(0, 7).map(p => p.value), [null, null, 0, 0.2, 0.4, null, null])
  assert.equal(vm.charts.precipitation.find(s => s.id === 'ecmwf').points.at(-1).value, 2.4)
  assert.equal(vm.rows.precipitation.find(s => s.id === 'kim').cells[2].value, null)
  const utc = buildComparisonViewModel({ data, tz: 'UTC' })
  assert.equal(utc.precipitationStartAt, run)
  assert.match(utc.precipitationStartLabel, /06:00 UTC/)
})

test('a later model window defines the common accumulation start without model-specific totals', () => {
  const data = structuredClone(payload)
  data.models[1].records = data.models[1].records.slice(2)
  const vm = buildComparisonViewModel({ data })
  assert.equal(vm.precipitationStartAt, hour(run, 2))
  for (const s of vm.charts.precipitation.filter(s => ['kim', 'ecmwf', 'gfs', 'icon'].includes(s.id))) {
    assert.equal(s.points[2].value, 0)
    assert.equal(s.points[1].value, null)
  }
  data.models[0].records = data.models[0].records.slice(0, 1)
  const stale = buildComparisonViewModel({ data, selectedValidAt: hour(run, -2) })
  assert.ok(stale.charts.precipitation.find(s => s.id === 'kim').points.every(p => p.value === null))
})

test('graph empty states distinguish all-zero precipitation and all-NSC ceiling from missing input', () => {
  const data = structuredClone(payload)
  data.observations.metar[0].weather = []
  data.observations.amos = [{ observed_at: '2026-09-06T08:00:00.000Z', precipitation_mm: 0 }]
  data.observations.metar[0].clouds = []
  data.observations.taf.base.clouds = []
  for (const model of data.models) for (const item of model.records) {
    item.precipitation_mm = 0
    item.ceiling_agl_ft = null
    item.ceiling_status = 'not_detected_below_limit'
  }
  const vm = buildComparisonViewModel({ data, selectedValidAt: hour(run, 12), tz: 'UTC' })
  assert.equal(vm.chartEmptyStates.precipitation, '강수량 없음')
  assert.equal(vm.chartEmptyStates.ceiling, '구름 없음')
  for (const model of data.models) model.records[0].precipitation_mm = null
  assert.equal(buildComparisonViewModel({ data }).chartEmptyStates.precipitation, '강수량 없음')
  data.observations.metar[0].weather = [{ raw: '-RA' }]
  assert.equal(buildComparisonViewModel({ data }).chartEmptyStates.precipitation, null)
  data.models[0].records[0].ceiling_status = 'missing_input'
  assert.equal(buildComparisonViewModel({ data, selectedValidAt: hour(run, 12), tz: 'UTC' }).chartEmptyStates.ceiling, null)
})

test('source chips preserve observation, run, and availability timestamps and KIM uses the approved method label', () => {
  const withMethods = structuredClone(payload)
  withMethods.models.find(model => model.model === 'kim').records.forEach(item => { item.ceiling_method = 'cloud_condensate_estimate' })
  const vm = buildComparisonViewModel({ data: withMethods, selectedValidAt: hour(run, 2), tz: 'UTC' })
  assert.deepEqual(vm.observationChips.map(chip => chip.id), ['metar', 'taf'])
  assert.equal(vm.observationChips[0].at, '2026-09-06T08:00:00.000Z')
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
  assert.match(point.text, /Gust 15 kt/)
  assert.equal(point.detail.temporal_method, 'native_hourly')
  assert.equal(point.detail.airport_icao, 'RKSI')
  assert.equal(point.detail.grid_elevation_difference_m, 19.52)
  assert.equal(point.detail.available_at, run)
  assert.equal(point.detail.collected_at, hour(run, 1))
  assert.equal(point.detail.ceiling_source_levels[0].selected, true)
  assert.deepEqual(point.detail.field_provenance, item.field_provenance)
  assert.match(vm.summary.ceiling, /ECMWF NSC/)
})

test('only on-the-hour METAR reports appear in every chart and table', () => {
  const data = structuredClone(payload)
  data.observations.metar.push({ ...data.observations.metar[0], observed_at: '2026-09-06T08:15:00.000Z', wind_speed_kt: 10 })
  data.observations.metar.push({ ...data.observations.metar[0], observed_at: '2026-09-06T08:30:00.000Z', wind_speed_kt: 15 })
  const vm = buildComparisonViewModel({ data })
  const reports = vm.rows.wind.find(r => r.id === 'metar').cells.find(Boolean).reports
  assert.deepEqual(reports.map(r => r.valid_at), ['2026-09-06T08:00:00.000Z'])
  assert.deepEqual(vm.charts.wind.find(r => r.id === 'metar').points.filter(p => p.at).map(p => p.at), reports.map(r => r.valid_at))
  for (const kind of ['wind', 'ceiling', 'temperatureRh', 'precipitation', 'humidity']) {
    assert.ok(vm.charts[kind].find(row => row.id === 'metar').points.every(point => !point.at || Date.parse(point.at) % 3_600_000 === 0))
  }
  assert.equal(vm.observationChips[0].at, '2026-09-06T08:00:00.000Z')
})

test('future METAR and AMOS cells are marked as observation-pending instead of missing data', () => {
  const vm = buildComparisonViewModel({ data: payload, selectedValidAt: hour(run, 12), tz: 'UTC' })
  const future = hour(run, 3)
  assert.deepEqual(vm.rows.wind.find(row => row.id === 'metar').cells.find(cell => cell?.slot_at === future), {
    slot_at: future, valid_at: future, status: 'observation_pending', value: null, text: '관측 전',
  })
  assert.deepEqual(vm.rows.precipitation.find(row => row.id === 'amos').cells.find(cell => cell?.slot_at === future), {
    slot_at: future, valid_at: future, status: 'observation_pending', value: null, text: '관측 전',
  })
})

test('ceiling text uses NSC whenever no ceiling is found below 5,000 ft', () => {
  const data = structuredClone(payload)
  data.observations.metar[0].nsc_flag = true
  data.observations.metar[0].clouds = []
  data.observations.taf.base.clouds = [{ amount: 'SCT', base_ft: 3000 }]
  const vm = buildComparisonViewModel({ data, selectedValidAt: hour(run, 2), tz: 'UTC' })
  const metar = vm.rows.ceiling.find(row => row.id === 'metar').cells.find(Boolean)
  const taf = vm.rows.ceiling.find(row => row.id === 'taf').cells.find(cell => cell?.slot_at === hour(run, 2))
  const ecmwf = vm.rows.ceiling.find(row => row.id === 'ecmwf').cells.find(cell => cell?.slot_at === hour(run, 2))
  assert.equal(metar.text, 'NSC')
  assert.equal(taf.text, 'NSC')
  assert.equal(ecmwf.text, 'NSC')
})

test('wind direction range takes the short arc across north and reads as aviation degrees', () => {
  assert.deepEqual(directionRange([250, 290, 270]), { from: 250, to: 290, span: 40 })
  // 350°와 010°는 20° 차이다. 단순 최소-최대라면 010–350°(340°)로 뒤집힌다.
  assert.deepEqual(directionRange([350, 10]), { from: 350, to: 10, span: 20 })
  assert.deepEqual(directionRange([270, 270.4]), { from: 270, to: 270, span: 0 })
  assert.equal(directionRange([null, undefined, NaN]), null)
  assert.equal(formatDirectionRange(directionRange([250, 290])), '250–290°')
  assert.equal(formatDirectionRange(directionRange([350, 10])), '350–010°')
  assert.equal(formatDirectionRange(directionRange([0])), '360°')
  assert.equal(formatDirectionRange(null), null)
})

test('summary reports the model wind direction spread alongside speed', () => {
  const data = structuredClone(payload)
  const directions = { kim: 250, ecmwf: 290, gfs: 270, icon: 260 }
  for (const model of data.models) for (const item of model.records) item.wind_direction_deg = directions[model.model]
  const vm = buildComparisonViewModel({ data, selectedValidAt: hour(run, 2), tz: 'UTC' })
  assert.match(vm.summary.wind, /풍향 250–290°/)
  assert.match(vm.summary.wind, /풍속 /)
  assert.equal(vm.summary.compact.directionRange, '250–290°')
})
