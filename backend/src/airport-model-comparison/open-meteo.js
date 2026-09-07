import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { requestObservedApi } from '../lib/request-observability.js'
import config, { airports as configuredAirports } from '../config.js'
import { MODEL_COMPARISON_AIRPORTS } from '../../../shared/airport-model-comparison.js'
import { comparisonRunId, contentRevision, publishAirportWindow, resolveComparisonModelRoot, writeCollectionAttempt } from './store.js'
import { estimateCeiling, HOUR_MS, normalizeUtc, selectForecastWindow, validateAirportRecords } from './model.js'

const SURFACE_FIELDS = Object.freeze([
  'wind_direction_10m', 'wind_speed_10m', 'wind_gusts_10m', 'precipitation',
  'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'pressure_msl',
  'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
])
const LEVELS = Object.freeze({ ecmwf: [1000, 925, 850, 700], icon: [1000, 975, 950, 925, 900, 850] })
const MODEL_NAMES = Object.freeze({ ecmwf: 'ecmwf_ifs025', icon: 'icon_global' })
const META_DIRECTORIES = Object.freeze({ ecmwf: 'ecmwf_ifs025', icon: 'dwd_icon' })
const GRID_MATCH_DEGREES = Object.freeze({ ecmwf: 0.2, icon: 0.12 })

function assertModel(model) {
  if (!Object.hasOwn(MODEL_NAMES, model)) throw new Error('invalid_open_meteo_model')
}
function pressureFields(levels) {
  return levels.flatMap(level => [`cloud_cover_${level}hPa`, `geopotential_height_${level}hPa`])
}
function requestFields(levels) { return [...SURFACE_FIELDS, ...pressureFields(levels)] }
function airportCoordinates(airport) {
  const lat = airport.lat ?? airport.latitude
  const lon = airport.lon ?? airport.longitude
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('invalid_airport_coordinates')
  return { lat, lon }
}
function providerTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('invalid_open_meteo_time')
  return `${value}:00.000Z`
}
function metaTime(seconds, code) {
  if (!Number.isInteger(seconds) || seconds < 0) throw new Error(code)
  return new Date(seconds * 1000).toISOString()
}

export function buildOpenMeteoRequest({ model, airports, run_at, window, pressureLevels = LEVELS[model] }) {
  assertModel(model)
  run_at = normalizeUtc(run_at)
  if (!Array.isArray(airports) || !airports.length || !window?.forecast_hours?.length) throw new Error('invalid_open_meteo_request')
  const coordinates = airports.map(airportCoordinates)
  const query = new URLSearchParams({
    models: MODEL_NAMES[model], latitude: coordinates.map(v => v.lat).join(','), longitude: coordinates.map(v => v.lon).join(','),
    elevation: airports.map(() => 'nan').join(','), cell_selection: 'nearest', timezone: 'UTC', wind_speed_unit: 'kn',
    hourly: requestFields(pressureLevels).join(','), run: run_at.slice(0, 16),
    forecast_hours: String(Math.max(...window.forecast_hours) + 1),
  })
  return new URL(`https://single-runs-api.open-meteo.com/v1/forecast?${query}`)
}

function buildIconWindowRequest({ airports, window }) {
  const coordinates = airports.map(airportCoordinates)
  const query = new URLSearchParams({
    models: MODEL_NAMES.icon, latitude: coordinates.map(v => v.lat).join(','), longitude: coordinates.map(v => v.lon).join(','),
    elevation: airports.map(() => 'nan').join(','), cell_selection: 'nearest', timezone: 'UTC', wind_speed_unit: 'kn',
    hourly: requestFields(LEVELS.icon).join(','), start_hour: normalizeUtc(window.start_at).slice(0, 13), end_hour: normalizeUtc(window.end_at).slice(0, 13),
  })
  return new URL(`https://api.open-meteo.com/v1/forecast?${query}`)
}
function metaUrl(model) { return new URL(`https://api.open-meteo.com/data/${META_DIRECTORIES[model]}/static/meta.json`) }
function operation(model, kind) {
  if (kind === 'meta') return `open_meteo_${model}_meta`
  if (kind === 'window') return 'open_meteo_icon_pressure_window'
  return `open_meteo_${model}_single_runs`
}
async function fetchJson(request, operationId, url, signal) {
  const response = await request({ operation: operationId, url, options: signal ? { signal } : {} })
  if (!response?.ok) throw new Error(`open_meteo_http_${response?.status ?? 'invalid'}`)
  return response.json()
}
function splitPayload(payload, airports) {
  const values = Array.isArray(payload) ? payload : [payload]
  if (values.length !== airports.length) throw new Error('open_meteo_response_count_mismatch')
  return values
}
export function associateOpenMeteoPayloads(payload, airports, model) {
  assertModel(model)
  const values = splitPayload(payload, airports)
  const assignments = new Map()
  for (const value of values) {
    if (!Number.isFinite(value?.latitude) || !Number.isFinite(value?.longitude)) throw new Error('invalid_open_meteo_grid')
    const candidates = airports.filter(airport => {
      const requested = airportCoordinates(airport)
      return Math.hypot(value.latitude - requested.lat, value.longitude - requested.lon) <= GRID_MATCH_DEGREES[model]
    })
    if (candidates.length > 1) throw new Error('open_meteo_ambiguous_response')
    if (candidates.length === 0) throw new Error('open_meteo_unmatched_response')
    if (assignments.has(candidates[0].icao)) throw new Error('open_meteo_duplicate_response')
    assignments.set(candidates[0].icao, value)
  }
  if (assignments.size !== airports.length) throw new Error('open_meteo_unmatched_response')
  return assignments
}
function assertResponseIdentity(payload, airport, model) {
  if (!payload || payload.utc_offset_seconds !== 0 || !['UTC', 'GMT'].includes(payload.timezone)) throw new Error('invalid_open_meteo_timezone')
  const requested = airportCoordinates(airport)
  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude) || !Number.isFinite(payload.elevation)) throw new Error('invalid_open_meteo_grid')
  if (Math.hypot(payload.latitude - requested.lat, payload.longitude - requested.lon) > GRID_MATCH_DEGREES[model]) throw new Error('open_meteo_coordinate_mismatch')
}
function assertHourly(payload, fields) {
  if (!payload.hourly || !payload.hourly_units || !Array.isArray(payload.hourly.time)) throw new Error('invalid_open_meteo_hourly')
  const expectedUnits = { wind_direction_10m: '°', wind_speed_10m: 'kn', wind_gusts_10m: 'kn', precipitation: 'mm', temperature_2m: '°C', relative_humidity_2m: '%', dew_point_2m: '°C', pressure_msl: 'hPa', cloud_cover: '%', cloud_cover_low: '%', cloud_cover_mid: '%', cloud_cover_high: '%' }
  for (const field of fields) {
    const expected = expectedUnits[field] ?? (field.startsWith('cloud_cover_') ? '%' : 'm')
    if (payload.hourly_units[field] !== expected || !Array.isArray(payload.hourly[field]) || payload.hourly[field].length !== payload.hourly.time.length) throw new Error(`invalid_open_meteo_field:${field}`)
  }
}
function provenance(source_variable, source_unit, method, missing_reason = null) { return { source_variable, source_unit, method, missing_reason } }

export function normalizeOpenMeteoAirport({ payload, airport, model, run_at, window, available_at, collected_at = new Date().toISOString() }) {
  assertModel(model)
  assertResponseIdentity(payload, airport, model)
  const fields = requestFields(LEVELS[model])
  assertHourly(payload, fields)
  run_at = normalizeUtc(run_at)
  const expectedTimes = window.forecast_hours.map(hour => new Date(Date.parse(run_at) + hour * HOUR_MS).toISOString())
  const indices = expectedTimes.map(time => payload.hourly.time.findIndex(value => providerTime(value) === time))
  if (indices.some(index => index < 0)) throw new Error('incomplete_forecast_window')
  const { lat, lon } = airportCoordinates(airport)
  const revision = contentRevision(payload)
  const mapping = {
    wind_direction_deg: ['wind_direction_10m', '°', 'provider_value'], wind_speed_kt: ['wind_speed_10m', 'kn', 'provider_value'],
    wind_gust_kt: ['wind_gusts_10m', 'kn', 'provider_value'], precipitation_mm: ['precipitation', 'mm', 'provider_value'],
    temperature_c: ['temperature_2m', '°C', 'provider_value'], relative_humidity_pct: ['relative_humidity_2m', '%', 'provider_value'],
    dew_point_c: ['dew_point_2m', '°C', 'provider_value'], pressure_msl_hpa: ['pressure_msl', 'hPa', 'provider_value'],
    cloud_total_pct: ['cloud_cover', '%', 'provider_value'], cloud_low_pct: ['cloud_cover_low', '%', model === 'ecmwf' ? 'derived' : 'provider_value'],
    cloud_mid_pct: ['cloud_cover_mid', '%', model === 'ecmwf' ? 'derived' : 'provider_value'], cloud_high_pct: ['cloud_cover_high', '%', model === 'ecmwf' ? 'derived' : 'provider_value'],
  }
  const records = indices.map((index, position) => {
    const forecast_hour = window.forecast_hours[position]
    const record = {
      airport_icao: airport.icao, source: 'open_meteo', model, run_at, available_at: available_at === null ? null : normalizeUtc(available_at), collected_at: normalizeUtc(collected_at),
      forecast_hour, valid_at: expectedTimes[position], window_start_at: normalizeUtc(window.start_at), window_end_at: normalizeUtc(window.end_at),
      requested_lat: lat, requested_lon: lon, grid_lat: payload.latitude, grid_lon: payload.longitude, grid_elevation_m: payload.elevation,
      selection_method: 'nearest_grid', temporal_method: model === 'ecmwf' ? 'interpolated_hourly' : 'native_hourly', field_provenance: {}, source_payload_revision: revision,
    }
    for (const [target, [source, unit, method]] of Object.entries(mapping)) {
      const structural = forecast_hour === 0 && (target === 'wind_gust_kt' || target === 'precipitation_mm')
      const value = payload.hourly[source][index]
      record[target] = structural ? null : (typeof value === 'number' && Number.isFinite(value) ? value : null)
      const missing = structural ? 'structural_f000' : value === null ? 'provider_missing' : record[target] === null ? 'invalid_value' : null
      record.field_provenance[target] = provenance(source, unit, method, missing)
    }
    const layers = LEVELS[model].map(level => {
      const cover = payload.hourly[`cloud_cover_${level}hPa`][index]
      return { pressure_hpa: level, cloud_fraction: Number.isFinite(cover) ? cover / 100 : null, height_m: payload.hourly[`geopotential_height_${level}hPa`][index] }
    })
    const ceiling = estimateCeiling({ model, grid_elevation_m: payload.elevation, layers })
    Object.assign(record, ceiling, { visibility_m: null })
    record.field_provenance.ceiling_agl_ft = provenance(LEVELS[model].map(v => `cloud_cover_${v}hPa+geopotential_height_${v}hPa`).join(','), 'm,%', 'derived', ceiling.ceiling_agl_ft === null ? ceiling.ceiling_status === 'missing_input' ? 'provider_missing' : 'not_provided' : null)
    record.field_provenance.visibility_m = provenance(null, 'm', 'provider_value', 'not_provided')
    return record
  })
  return validateAirportRecords({ airport_icao: airport.icao, model, run_at, window, records })
}

function runFromMeta(meta) { return metaTime(meta?.last_run_initialisation_time, 'invalid_open_meteo_meta_run') }
export function mergeIconPressureWindow({ single, general, airport, window, run_at, metaBefore, metaAfter }) {
  const expected = normalizeUtc(run_at)
  if (runFromMeta(metaBefore) !== expected || runFromMeta(metaAfter) !== expected) throw new Error('icon_run_changed')
  assertResponseIdentity(single, airport, 'icon')
  assertResponseIdentity(general, airport, 'icon')
  if (Math.abs(single.latitude - general.latitude) > 1e-6 || Math.abs(single.longitude - general.longitude) > 1e-6) throw new Error('open_meteo_coordinate_mismatch')
  assertHourly(single, requestFields(LEVELS.icon))
  assertHourly(general, pressureFields(LEVELS.icon))
  const expectedTimes = window.forecast_hours.map(hour => new Date(Date.parse(expected) + hour * HOUR_MS).toISOString())
  const generalTimes = new Set(general.hourly.time.map(providerTime))
  if (expectedTimes.some(time => !generalTimes.has(time))) throw new Error('incomplete_forecast_window')
  const overlap = single.hourly.time.filter(time => general.hourly.time.includes(time))
  if (!overlap.length) throw new Error('icon_overlap_mismatch')
  for (const field of pressureFields(LEVELS.icon)) for (const time of overlap) {
    const a = single.hourly[field]?.[single.hourly.time.indexOf(time)]
    const b = general.hourly[field]?.[general.hourly.time.indexOf(time)]
    if (a === null && Number.isFinite(b)) continue
    if (Number.isFinite(a) && Number.isFinite(b) && a === b) continue
    throw new Error('icon_overlap_mismatch')
  }
  const merged = structuredClone(single)
  for (const field of pressureFields(LEVELS.icon)) merged.hourly[field] = single.hourly.time.map((time, i) => {
    const j = general.hourly.time.indexOf(time)
    return j < 0 ? single.hourly[field]?.[i] : general.hourly[field]?.[j]
  })
  return merged
}

function cacheKey(model, run_at, airports) {
  return JSON.stringify([model, normalizeUtc(run_at), airports.map(a => Object.values(airportCoordinates(a))), requestFields(LEVELS[model]), 'nearest', 'nan'])
}
function rawCacheFile({ root, model, run_at, key }) {
  return path.join(resolveComparisonModelRoot({ root, model }), 'runs', comparisonRunId(run_at), 'raw', `open-meteo-${contentRevision(key)}.json.gz`)
}
function readPersistentRaw(args) {
  try {
    const value = JSON.parse(gunzipSync(fs.readFileSync(rawCacheFile(args))).toString('utf8'))
    if (value.schema_version !== 1 || value.key !== args.key || value.run_at !== normalizeUtc(args.run_at) || !value.payload || !value.collected_at) return null
    normalizeUtc(value.collected_at)
    return value
  } catch { return null }
}
function writePersistentRaw(args, entry) {
  const file = rawCacheFile(args), temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  try {
    fs.writeFileSync(temporary, gzipSync(JSON.stringify({ schema_version: 1, key: args.key, ...entry })))
    fs.renameSync(temporary, file)
  } finally { fs.rmSync(temporary, { force: true }) }
}
function cacheCovers(entry, windows) {
  if (!entry) return false
  const payloads = splitPayload(entry.payload, windows.map(v => v.airport))
  return windows.every(({ window }, index) => {
    const times = new Set((payloads[index]?.hourly?.time || []).map(providerTime))
    return window.forecast_hours.every(hour => times.has(new Date(Date.parse(entry.run_at) + hour * HOUR_MS).toISOString()))
  })
}

export async function collectOpenMeteo({ model, selectedRuns, signal, root = config.storage.base_path,
  airports = configuredAirports.filter(airport => MODEL_COMPARISON_AIRPORTS.includes(airport.icao)), request = requestObservedApi, now = () => new Date(), nowMs } = {}) {
  assertModel(model)
  signal?.throwIfAborted()
  const currentDate = () => nowMs === undefined ? now() : new Date(typeof nowMs === 'function' ? nowMs() : nowMs)
  if (!(currentDate() instanceof Date) || !Number.isFinite(currentDate().getTime())) throw new Error('invalid_collection_clock')
  const report = { model, publishedAirports: [], reusedAirports: [], failedAirports: [], run_at: null, windows: {}, deferred: false, errors: [] }
  const meta = await fetchJson(request, operation(model, 'meta'), metaUrl(model), signal)
  const run_at = runFromMeta(meta), available_at = metaTime(meta.last_run_availability_time, 'invalid_open_meteo_meta_availability')
  report.run_at = run_at
  const readyAt = Date.parse(available_at) + 10 * 60_000
  if (currentDate().getTime() < readyAt) {
    report.deferred = true
    writeCollectionAttempt({ root, model, report: { ...report, next_check_at: new Date(readyAt).toISOString() } })
    return report
  }
  const targets = airports.map(airport => {
    const window = selectForecastWindow({ model, run_at, selectedRuns: selectedRuns?.[airport.icao] || [] })
    report.windows[airport.icao] = window
    return { airport, window }
  })
  if (!targets.length) { writeCollectionAttempt({ root, model, report }); return report }
  const key = cacheKey(model, run_at, targets.map(v => v.airport))
  const cacheArgs = { root, model, run_at, key }
  let cached = readPersistentRaw(cacheArgs)
  try {
    if (!cacheCovers(cached, targets)) {
      const widest = targets.reduce((a, b) => a.window.forecast_hours.at(-1) > b.window.forecast_hours.at(-1) ? a : b).window
      let payload = await fetchJson(request, operation(model, 'single'), buildOpenMeteoRequest({ model, airports: targets.map(v => v.airport), run_at, window: widest }), signal)
      if (model === 'icon') {
        const before = meta
        const general = await fetchJson(request, operation(model, 'window'), buildIconWindowRequest({ airports: targets.map(v => v.airport), window: widest }), signal)
        const after = await fetchJson(request, operation(model, 'meta'), metaUrl(model), signal)
        const targetAirports = targets.map(v => v.airport)
        const singles = associateOpenMeteoPayloads(payload, targetAirports, model)
        const generals = associateOpenMeteoPayloads(general, targetAirports, model)
        payload = targets.map(({ airport, window }) => {
          try { return mergeIconPressureWindow({ single: singles.get(airport.icao), general: generals.get(airport.icao), airport, window, run_at, metaBefore: before, metaAfter: after }) }
          catch (error) {
            report.failedAirports.push(airport.icao)
            report.errors.push({ airport_icao: airport.icao, code: error.message, message: error.message })
            return null
          }
        })
      } else {
        const associated = associateOpenMeteoPayloads(payload, targets.map(v => v.airport), model)
        payload = targets.map(({ airport }) => associated.get(airport.icao))
      }
      cached = { payload, run_at, collected_at: currentDate().toISOString() }
      writePersistentRaw(cacheArgs, cached)
    }
    const payloads = splitPayload(cached.payload, targets.map(v => v.airport))
    for (let i = 0; i < targets.length; i++) {
      const { airport, window } = targets[i]
      if (!payloads[i]) continue
      try {
        const records = normalizeOpenMeteoAirport({ payload: payloads[i], airport, model, run_at, window, available_at, collected_at: cached.collected_at })
        const result = publishAirportWindow({ root, model, airport_icao: airport.icao, run_at, window, records, metadata: { provider: 'Open-Meteo' } })
        ;(result.published ? report.publishedAirports : report.reusedAirports).push(airport.icao)
      } catch (error) {
        report.failedAirports.push(airport.icao)
        report.errors.push({ airport_icao: airport.icao, code: error.message, message: error.message })
      }
    }
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error
    report.failedAirports.push(...targets.map(v => v.airport.icao))
    report.errors.push({ airport_icao: null, code: error.message, message: error.message })
  }
  writeCollectionAttempt({ root, model, report })
  return report
}
