import { recordFixture } from './fixtures/airport-model-comparison/records.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUtc, selectForecastWindow, estimateCeiling, validateAirportRecords } from '../src/airport-model-comparison/model.js'

test('UTC normalization rejects ambiguous instants and preserves offset instant', () => {
  assert.equal(normalizeUtc('2026-09-06T09:00:00+09:00'), '2026-09-06T00:00:00.000Z')
  for (const value of ['09:00', '2026-09-06T00:00:00', 'bad', '2026-02-30T00:00:00Z']) assert.throws(() => normalizeUtc(value))
})

test('EC keeps actual run and shifts its thirteen forecast hours to complete peer anchor', () => {
  const window = selectForecastWindow({ model: 'ecmwf', run_at: '2026-09-06T00:00:00Z', selectedRuns: [{ model: 'kim', run_at: '2026-09-06T06:00:00Z' }] })
  assert.deepEqual(window.forecast_hours, [6,7,8,9,10,11,12,13,14,15,16,17,18])
  assert.equal(window.end_at, '2026-09-06T18:00:00.000Z')
  assert.equal(selectForecastWindow({ model: 'ecmwf', run_at: '2026-09-06T00:00:00Z' }).forecast_hours[0], 0)
  assert.throws(() => selectForecastWindow({ model: 'ecmwf', run_at: '2026-09-06T00:00:00Z', selectedRuns: [{ model: 'kim', run_at: '2026-09-06T06:30:00Z' }] }))
})

const layer = { pressure_hpa: 850, height_m: 1474, cloud_fraction: .53, tqc_kgkg: 2e-6, tqi_kgkg: 0 }
test('EC real layer is about 4524 ft AGL; exact cloud threshold is excluded', () => {
  const result = estimateCeiling({ model: 'ecmwf', grid_elevation_m: 95, layers: [layer] })
  assert.equal(result.ceiling_status, 'value')
  assert.ok(Math.abs(result.ceiling_agl_ft - 4524.278215) < .00001)
  assert.equal(estimateCeiling({ model: 'icon', grid_elevation_m: 95, layers: [{ ...layer, cloud_fraction: .5 }] }).ceiling_status, 'not_detected_below_limit')
})

test('KIM condensate boundary and tiny negatives preserve original evidence', () => {
  assert.equal(estimateCeiling({ model: 'kim', grid_elevation_m: 95, layers: [{ ...layer, tqc_kgkg: 1e-6 }] }).ceiling_status, 'not_detected_below_limit')
  const result = estimateCeiling({ model: 'kim', grid_elevation_m: 95, layers: [{ ...layer, tqc_kgkg: -5.82e-11, tqi_kgkg: 2e-6 }] })
  assert.equal(result.ceiling_status, 'value')
  assert.equal(result.ceiling_source_levels[0].tqc_kgkg, -5.82e-11)
})

test('unknown lower cloud cannot be skipped; irrelevant upper missing cloud does not erase ceiling', () => {
  const lower = { ...layer, pressure_hpa: 925, height_m: 500, cloud_fraction: null }
  assert.equal(estimateCeiling({ model: 'icon', grid_elevation_m: 95, layers: [lower, layer] }).ceiling_status, 'missing_input')
  assert.equal(estimateCeiling({ model: 'icon', grid_elevation_m: 95, layers: [layer, { ...lower, height_m: 1600 }] }).ceiling_status, 'value')
  assert.equal(estimateCeiling({ model: 'icon', grid_elevation_m: 95, layers: [{ ...layer, height_m: 2000 }] }).ceiling_status, 'not_detected_below_limit')
  assert.equal(estimateCeiling({ model: 'icon', grid_elevation_m: 95, layers: [{ ...layer, height_m: 100 }] }).ceiling_status, 'not_detected_below_limit')
  assert.equal(estimateCeiling({ model: 'icon', grid_elevation_m: 95, layers: [{ ...lower, height_m: null }, layer] }).ceiling_status, 'missing_input')
})


test('publication validates exact time set, explicit missing fields and ranges', () => {
  const records = recordFixture()
  const input = { airport_icao: 'RKPU', model: 'icon', run_at: records[0].run_at, window: { start_at: records[0].window_start_at, end_at: records[0].window_end_at, forecast_hours: [0,1,2,3,4,5,6,7,8,9,10,11,12] }, records }
  assert.equal(validateAirportRecords(input).length, 13)
  for (const mutate of [r => {r[8] = {...r[7]}}, r => {delete r[2].temperature_c}, r => {r[2].relative_humidity_pct=101}, r => {r[2].wind_speed_kt=-1}, r => {r[2].temperature_c=null}, r => {r[2].forecast_hour=7}, r => {r[2].visibility_m=null;r[2].field_provenance.visibility_m.missing_reason='invented_reason'}, r => {r[2].field_provenance.temperature_c.missing_reason='provider_missing'}]) {
    const changed = structuredClone(records); mutate(changed)
    assert.throws(() => validateAirportRecords({...input, records: changed}))
  }
})
