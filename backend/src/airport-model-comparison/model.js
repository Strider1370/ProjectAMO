import { MODEL_COMPARISON_AIRPORTS, MODEL_ORDER } from '../../../shared/airport-model-comparison.js'

export const HOUR_MS = 3_600_000
export const CEILING_METHODS = Object.freeze({ kim: 'cloud_condensate_estimate', ecmwf: 'humidity_based_estimate', gfs: 'model_diagnostic', icon: 'pressure_level_estimate' })
export const WEATHER_FIELDS = Object.freeze(['wind_direction_deg', 'wind_speed_kt', 'wind_gust_kt', 'precipitation_mm', 'temperature_c', 'relative_humidity_pct', 'dew_point_c', 'pressure_msl_hpa', 'cloud_total_pct', 'cloud_low_pct', 'cloud_mid_pct', 'cloud_high_pct', 'ceiling_agl_ft', 'visibility_m'])

export function normalizeUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('invalid_utc_timestamp')
  const datePart = value.slice(0, 10)
  const day = new Date(`${datePart}T00:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== datePart || !Number.isFinite(Date.parse(value))) throw new Error('invalid_utc_timestamp')
  return new Date(value).toISOString()
}

export function assertComparisonIdentity({ model, airport_icao }) {
  if (!MODEL_ORDER.includes(model)) throw new Error('invalid_comparison_model')
  if (airport_icao !== undefined && !MODEL_COMPARISON_AIRPORTS.includes(airport_icao)) throw new Error('invalid_comparison_airport')
}

export function selectForecastWindow({ model, run_at, selectedRuns = [] }) {
  assertComparisonIdentity({ model })
  const runMs = Date.parse(normalizeUtc(run_at))
  const peers = selectedRuns.filter(r => MODEL_ORDER.includes(r.model) && r.model !== 'ecmwf').map(r => Date.parse(normalizeUtc(r.run_at)))
  const anchorMs = peers.length ? Math.max(...peers) : runMs
  const offset = model === 'ecmwf' ? Math.max(0, (anchorMs - runMs) / HOUR_MS) : 0
  if (!Number.isInteger(offset) || runMs % HOUR_MS !== 0) throw new Error('unaligned_forecast_window')
  return { start_at: new Date(runMs + offset * HOUR_MS).toISOString(), end_at: new Date(runMs + (offset + 12) * HOUR_MS).toISOString(), forecast_hours: Array.from({ length: 13 }, (_, i) => offset + i) }
}

export function estimateCeiling({ model, grid_elevation_m, layers }) {
  assertComparisonIdentity({ model })
  if (model === 'gfs') throw new Error('gfs_requires_model_diagnostic')
  const evidence = []
  const result = (status, value = null) => ({ ceiling_agl_ft: value, ceiling_method: CEILING_METHODS[model], ceiling_status: status, ceiling_limit_ft: 5000, ceiling_source_levels: evidence })
  if (!Number.isFinite(grid_elevation_m) || !Array.isArray(layers) || !layers.length) return result('missing_input')
  // Unknown layer heights cannot safely be ordered below a candidate ceiling.
  if (layers.some(l => !Number.isFinite(l.height_m))) return result('missing_input')
  const ordered = layers.map(l => ({ ...l, agl_m: l.height_m - grid_elevation_m })).sort((a,b) => a.agl_m-b.agl_m)
  for (const layer of ordered) {
    const agl_ft = layer.agl_m / .3048
    if (layer.agl_m < 30 || agl_ft > 5000) continue
    evidence.push({ ...layer, agl_ft, selected: false })
    if (!Number.isFinite(layer.cloud_fraction) || layer.cloud_fraction < 0 || layer.cloud_fraction > 1 || (model === 'kim' && (!Number.isFinite(layer.tqc_kgkg) || !Number.isFinite(layer.tqi_kgkg)))) return result('missing_input')
    if (layer.cloud_fraction > .5 && (model !== 'kim' || Math.max(0, layer.tqc_kgkg) + Math.max(0, layer.tqi_kgkg) > 1e-6)) {
      evidence.at(-1).selected = true
      return result('value', agl_ft)
    }
  }
  return result('not_detected_below_limit')
}

export function validateAirportRecords({ airport_icao, model, run_at, window, records }) {
  assertComparisonIdentity({ airport_icao, model })
  const run = normalizeUtc(run_at)
  if (!window || !Array.isArray(window.forecast_hours) || window.forecast_hours.length !== 13 || window.forecast_hours.some((h,i,a) => !Number.isInteger(h) || h < 0 || (i && h !== a[i-1]+1)) || (model !== 'ecmwf' && window.forecast_hours[0] !== 0)) throw new Error('invalid_forecast_window')
  const expected = window.forecast_hours.map(h => new Date(Date.parse(run)+h*HOUR_MS).toISOString())
  const start = normalizeUtc(window.start_at), end = normalizeUtc(window.end_at)
  if (expected[0] !== start || expected.at(-1) !== end || !Array.isArray(records) || records.length !== 13) throw new Error('incomplete_forecast_window')
  const normalized = records.map(record => {
    const r = { ...record }
    for (const key of ['run_at','valid_at','window_start_at','window_end_at','collected_at']) r[key] = normalizeUtc(r[key])
    if (r.available_at !== null) r.available_at = normalizeUtc(r.available_at)
    if (r.airport_icao !== airport_icao || r.model !== model || r.run_at !== run || r.window_start_at !== start || r.window_end_at !== end || !window.forecast_hours.includes(r.forecast_hour) || Date.parse(r.valid_at) !== Date.parse(run)+r.forecast_hour*HOUR_MS) throw new Error('record_identity_mismatch')
    for (const key of ['source','selection_method','temporal_method','source_payload_revision']) if (typeof r[key] !== 'string' || !r[key]) throw new Error(`missing_record_field:${key}`)
    for (const key of ['requested_lat','requested_lon','grid_lat','grid_lon','grid_elevation_m']) if (!Number.isFinite(r[key])) throw new Error(`invalid_record_field:${key}`)
    for (const key of ['requested_lat','grid_lat']) if (Math.abs(r[key]) > 90) throw new Error(`invalid_record_field:${key}`)
    for (const key of ['requested_lon','grid_lon']) if (Math.abs(r[key]) > 180) throw new Error(`invalid_record_field:${key}`)
    if (!['native_hourly','interpolated_hourly'].includes(r.temporal_method)) throw new Error('invalid_temporal_method')
    for (const key of WEATHER_FIELDS) {
      const value = r[key], p = r.field_provenance?.[key]
      if (value === undefined || !p || !Object.hasOwn(p,'missing_reason') || !Object.hasOwn(p,'source_variable') || !Object.hasOwn(p,'source_unit') || !['provider_value','derived','converted'].includes(p.method)) throw new Error(`missing_record_field:${key}`)
      if (value === null) { if (!['not_provided','structural_f000','provider_missing','invalid_value'].includes(p.missing_reason)) throw new Error(`missing_null_reason:${key}`); continue }
      if (p.missing_reason !== null) throw new Error(`unexpected_missing_reason:${key}`)
      if (!Number.isFinite(value)) throw new Error(`invalid_record_field:${key}`)
      if ((key.endsWith('_pct') && (value < 0 || value > 100)) || (key === 'wind_direction_deg' && (value < 0 || value > 360)) || (['wind_speed_kt','wind_gust_kt','precipitation_mm','visibility_m','ceiling_agl_ft'].includes(key) && value < 0) || (key === 'pressure_msl_hpa' && value <= 0)) throw new Error(`invalid_record_field:${key}`)
    }
    if (r.ceiling_method !== CEILING_METHODS[model] || !['value','not_detected_below_limit','no_ceiling','missing_input','outside_run'].includes(r.ceiling_status) || (r.ceiling_status === 'value') !== Number.isFinite(r.ceiling_agl_ft) || !Array.isArray(r.ceiling_source_levels) || (model !== 'gfs' && r.ceiling_limit_ft !== 5000) || (model === 'gfs' && r.ceiling_limit_ft !== null && !Number.isFinite(r.ceiling_limit_ft))) throw new Error('invalid_ceiling_state')
    if (r.forecast_hour === 0 && ['wind_gust_kt','precipitation_mm'].some(key => r[key] !== null || r.field_provenance[key].missing_reason !== 'structural_f000')) throw new Error('invalid_structural_f000')
    return r
  })
  const times = normalized.map(r => r.valid_at)
  if (new Set(times).size !== 13 || expected.some(t => !times.includes(t))) throw new Error('incomplete_forecast_window')
  return normalized.sort((a,b) => a.forecast_hour-b.forecast_hour)
}
