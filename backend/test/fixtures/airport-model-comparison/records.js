export function recordFixture({ model = 'icon', run_at = '2026-09-06T06:00:00.000Z', airport_icao = 'RKPU', offset = 0 } = {}) {
  const start = new Date(Date.parse(run_at) + offset * 3600000).toISOString()
  const end = new Date(Date.parse(start) + 12 * 3600000).toISOString()
  const values = { wind_direction_deg: 230, wind_speed_kt: 8, wind_gust_kt: 12, precipitation_mm: 0, temperature_c: 23, relative_humidity_pct: 74, dew_point_c: 18, pressure_msl_hpa: 1008, cloud_total_pct: 80, cloud_low_pct: 74, cloud_mid_pct: 20, cloud_high_pct: 10, visibility_m: null, ceiling_agl_ft: null }
  return Array.from({ length: 13 }, (_, i) => ({
    airport_icao, model, source: 'synthetic_test', run_at, available_at: '2026-09-06T10:00:00.000Z', collected_at: '2026-09-06T10:20:00.000Z', forecast_hour: offset+i,
    valid_at: new Date(Date.parse(start)+i*3600000).toISOString(), window_start_at: start, window_end_at: end,
    requested_lat: 35.5935, requested_lon: 129.3518, grid_lat: 35.6, grid_lon: 129.4, grid_elevation_m: 95,
    selection_method: 'nearest_grid', temporal_method: 'native_hourly', ...values,
    wind_gust_kt: offset+i === 0 ? null : 12, precipitation_mm: offset+i === 0 ? null : 0,
    ceiling_method: { kim: 'cloud_condensate_estimate', ecmwf: 'humidity_based_estimate', gfs: 'model_diagnostic', icon: 'pressure_level_estimate' }[model], ceiling_status: 'not_detected_below_limit', ceiling_limit_ft: 5000, ceiling_source_levels: [],
    field_provenance: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { source_variable: key, source_unit: 'test', method: 'provider_value', missing_reason: offset+i === 0 && ['wind_gust_kt', 'precipitation_mm'].includes(key) ? 'structural_f000' : value === null ? 'not_provided' : null }])), source_payload_revision: 'synthetic-test-v1',
  }))
}
