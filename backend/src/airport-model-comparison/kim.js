import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'
import { MODEL_COMPARISON_AIRPORTS } from '../../../shared/airport-model-comparison.js'
import { fetchKimGrid } from '../api-client.js'
import { parseKimGridText } from '../parsers/kim-grid-parser.js'
import { decodeComponent, KIM_AIRPORT_SURFACE_REQUESTS, KIM_NWP_LEVELS, KIM_NWP_MODEL } from '../processors/kim-nwp-model.js'
import { readKimNwpGridSafe, resolveKimNwpRunDir } from '../processors/kim-nwp-store.js'
import { estimateCeiling, selectForecastWindow, WEATHER_FIELDS } from './model.js'
import { cleanupComparisonRuns, publishAirportWindow, readAirportComparison, writeCollectionAttempt } from './store.js'

const KNOTS_PER_MPS = 1.943844492
const KIM_MISSING_VALUE = -99999
const SURFACE_REQUESTS = [{ name: 'u10m', unit: 'm/s' }, { name: 'v10m', unit: 'm/s' }, { name: 't2m', unit: 'K' }, ...KIM_AIRPORT_SURFACE_REQUESTS]

function componentFromStored(grid, variable) {
  const item = grid?.variables?.[variable]
  if (!item) return null
  const values = decodeComponent(item.values, item).map((value, index) => (
    item.encoding === 'int16-scaled-json-v1' && item.values[index] === -32767 ? Number.NaN : value
  ))
  return { nx: grid.grid.nx, ny: grid.grid.ny, bounds: grid.grid, values }
}

function decodeKimMissingValues(grid) {
  return { ...grid, values: grid.values.map(value => value === KIM_MISSING_VALUE ? Number.NaN : value) }
}

function rawPath({ root, tmfc, hf, levelId, name }) {
  const fileName = name === 'u10m' ? 'u.txt' : name === 'v10m' ? 'v.txt' : name === 't2m' ? 'T.txt' : `${name}.txt`
  return path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc }), 'raw', `hf${String(hf).padStart(3, '0')}`, levelId, fileName)
}

function assertSameGrid(reference, candidate) {
  if (!reference || !candidate || reference.nx !== candidate.nx || reference.ny !== candidate.ny
    || ['lonMin','lonMax','latMin','latMax','dx','dy'].some(key => reference.bounds?.[key] !== candidate.bounds?.[key])) throw new Error('kim_grid_definition_mismatch')
}

export function createKimComparisonHourLoader({ root, credential, signal, fetchGrid = fetchKimGrid, bounds = config.kim_surface_wind.bounds } = {}) {
  let topoCache = null
  const readOrFetch = async ({ tmfc, hf, levelId, request }) => {
    const file = rawPath({ root, tmfc, hf, levelId, name: request.name })
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (!text) {
      signal?.throwIfAborted()
      text = await fetchGrid({ data: request.data, name: request.name, level: request.level, tmfc, hf, sub: config.kim_surface_wind.sub, map: 'S', disp: 'A', credential, signal })
      if (config.kim_nwp.keep_raw !== false) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8') }
    }
    return { ...decodeKimMissingValues(parseKimGridText(text, { variable: request.name, level: request.level, bounds })), precision_source: 'raw' }
  }
  return async ({ tmfc, hf }) => {
    const surface = {}
    const storedSurface = readKimNwpGridSafe({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: '10m' })
    const storedNames = { u10m: 'u', v10m: 'v', t2m: 'T' }
    for (const base of SURFACE_REQUESTS) {
      if (hf === 0 && ['gust','pr','prec_acc'].includes(base.name)) continue
      if (base.name === 'topo' && topoCache) { surface.topo = topoCache; continue }
      const request = { data: 'U', level: 0, ...base }
      const stored = componentFromStored(storedSurface, storedNames[base.name] || base.name)
      surface[base.name] = stored ? { ...stored, precision_source: 'normalized_scaled' } : await readOrFetch({ tmfc, hf, levelId: '10m', request })
      if (base.name === 'topo') topoCache = surface.topo
    }
    const layers = []
    for (const level of KIM_NWP_LEVELS.filter(level => level.kind === 'pressure' && level.value >= 300)) {
      const stored = readKimNwpGridSafe({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id })
      const layer = { pressure_hpa: level.level }
      for (const [output, variable] of [['hgt','hgt'],['cld','cld'],['tqc','tqc'],['tqi','tqi']]) {
        const file = rawPath({ root, tmfc, hf, levelId: level.id, name: variable })
        let raw = null
        try { raw = decodeKimMissingValues(parseKimGridText(fs.readFileSync(file, 'utf8'), { variable, level: level.level, bounds })) } catch {}
        const normalized = componentFromStored(stored, variable)
        layer[output] = raw ? { ...raw, precision_source: 'raw' } : normalized ? { ...normalized, precision_source: 'normalized_scaled' } : await readOrFetch({ tmfc, hf, levelId: level.id, request: { data: 'P', name: variable, level: level.level, unit: variable === 'hgt' ? 'm' : variable === 'cld' ? '1' : 'kg/kg' } })
      }
      layers.push(layer)
    }
    const grids = [...Object.values(surface), ...layers.flatMap(layer => [layer.hgt,layer.cld,layer.tqc,layer.tqi])].filter(Boolean)
    for (const grid of grids.slice(1)) assertSameGrid(grids[0], grid)
    return { surface, layers, revision: createHash('sha256').update(JSON.stringify({ tmfc, hf, grids: grids.map(grid => grid.values) })).digest('hex') }
  }
}

function coordinates(airport) {
  return { lat: Number(airport.lat ?? airport.latitude), lon: Number(airport.lon ?? airport.longitude) }
}

export function sampleKimAirport(grid, airport) {
  const bounds = grid?.bounds || grid?.grid || {}
  const { lat, lon } = coordinates(airport)
  const { lonMin, lonMax, latMin, latMax, dx, dy } = bounds
  if (![lat, lon, lonMin, lonMax, latMin, latMax, dx, dy, grid?.nx ?? bounds.nx, grid?.ny ?? bounds.ny].every(Number.isFinite)
      || lon < lonMin || lon > lonMax || lat < latMin || lat > latMax) throw new Error('outside_kim_grid')
  const nx = grid.nx ?? bounds.nx
  const ny = grid.ny ?? bounds.ny
  const x = Math.round((lon - lonMin) / dx)
  const y = Math.round((lat - latMin) / dy)
  if (x < 0 || x >= nx || y < 0 || y >= ny) throw new Error('outside_kim_grid')
  const index = y * nx + x
  return { index, grid_lat: latMin + y * dy, grid_lon: lonMin + x * dx, value: grid.values[index] }
}

function sample(grid, airport) {
  if (!grid) return null
  const result = sampleKimAirport(grid, airport)
  return Number.isFinite(result.value) ? result.value : null
}

function provenance(source_variable, source_unit, method = 'provider_value', missing_reason = null) {
  return { source_variable, source_unit, method, missing_reason }
}

function windDirection(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null
  return (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
}

function recordFor({ airport, tmfc, hf, window, hour, collectedAt }) {
  const s = hour.surface || {}
  const u = sample(s.u10m, airport), v = sample(s.v10m, airport)
  const topo = sample(s.topo, airport)
  if (!Number.isFinite(topo)) throw new Error('missing_kim_topography')
  const position = sampleKimAirport(s.topo, airport)
  const layers = (hour.layers || []).map(layer => ({
    pressure_hpa: layer.pressure_hpa,
    height_m: sample(layer.hgt, airport),
    cloud_fraction: sample(layer.cld, airport),
    tqc_kgkg: sample(layer.tqc, airport),
    tqi_kgkg: sample(layer.tqi, airport),
  }))
  const ceiling = estimateCeiling({ model: 'kim', grid_elevation_m: topo, layers })
  const values = {
    wind_direction_deg: windDirection(u, v), wind_speed_kt: Number.isFinite(u) && Number.isFinite(v) ? Math.hypot(u, v) * KNOTS_PER_MPS : null,
    wind_gust_kt: hf === 0 ? null : (sample(s.gust, airport) == null ? null : sample(s.gust, airport) * KNOTS_PER_MPS),
    precipitation_mm: hf === 0 ? null : (sample(s.pr, airport) == null ? null : sample(s.pr, airport) * 3600),
    temperature_c: sample(s.t2m, airport) == null ? null : sample(s.t2m, airport) - 273.15,
    relative_humidity_pct: sample(s.rh2m, airport), dew_point_c: sample(s.td2m, airport) == null ? null : sample(s.td2m, airport) - 273.15,
    pressure_msl_hpa: sample(s.psl, airport) == null ? null : sample(s.psl, airport) / 100,
    cloud_total_pct: sample(s.tcld, airport) == null ? null : sample(s.tcld, airport) * 100,
    cloud_low_pct: sample(s.lcld, airport) == null ? null : sample(s.lcld, airport) * 100,
    cloud_mid_pct: sample(s.mcld, airport) == null ? null : sample(s.mcld, airport) * 100,
    cloud_high_pct: sample(s.hcld, airport) == null ? null : sample(s.hcld, airport) * 100,
    ceiling_agl_ft: ceiling.ceiling_agl_ft, visibility_m: null,
  }
  const source = { wind_direction_deg: ['u10m/v10m','m/s','derived'], wind_speed_kt: ['u10m/v10m','m/s','converted'], wind_gust_kt: ['gust','m/s','converted'], precipitation_mm: ['pr','kg/m²/s','converted'], temperature_c: ['t2m','K','converted'], relative_humidity_pct: ['rh2m','%','provider_value'], dew_point_c: ['td2m','K','converted'], pressure_msl_hpa: ['psl','Pa','converted'], cloud_total_pct: ['tcld','1','converted'], cloud_low_pct: ['lcld','1','converted'], cloud_mid_pct: ['mcld','1','converted'], cloud_high_pct: ['hcld','1','converted'], ceiling_agl_ft: ['cld+tqc+tqi+hgt','1+kg/kg+m','derived'], visibility_m: ['','', 'provider_value'] }
  const field_provenance = Object.fromEntries(WEATHER_FIELDS.map(key => {
    const [variable, unit, method] = source[key]
    const missing = values[key] === null ? (hf === 0 && ['wind_gust_kt','precipitation_mm'].includes(key) ? 'structural_f000' : key === 'visibility_m' ? 'not_provided' : key === 'ceiling_agl_ft' && ceiling.ceiling_status !== 'missing_input' ? 'not_provided' : 'provider_missing') : null
    const detail = provenance(variable, unit, method, missing)
    if (key === 'ceiling_agl_ft') detail.precision_source = layers.some((_, index) => hour.layers[index]?.tqc?.precision_source === 'normalized_scaled' || hour.layers[index]?.tqi?.precision_source === 'normalized_scaled') ? 'normalized_scaled' : 'raw'
    return [key, detail]
  }))
  const run_at = new Date(Date.UTC(+tmfc.slice(0,4), +tmfc.slice(4,6)-1, +tmfc.slice(6,8), +tmfc.slice(8,10))).toISOString()
  return { airport_icao: airport.icao, model: 'kim', run_at, forecast_hour: hf, valid_at: new Date(Date.parse(run_at)+hf*3600000).toISOString(), window_start_at: window.start_at, window_end_at: window.end_at, available_at: null, collected_at: collectedAt, source: 'KMA KIM NE57', requested_lat: coordinates(airport).lat, requested_lon: coordinates(airport).lon, grid_lat: position.grid_lat, grid_lon: position.grid_lon, grid_elevation_m: topo, selection_method: 'nearest_grid_point', temporal_method: 'native_hourly', source_payload_revision: hour.revision || createHash('sha256').update(JSON.stringify(hour)).digest('hex'), ...values, ...ceiling, field_provenance }
}

export async function collectKimAirportComparison({ tmfc, forecastHours, credential, signal,
  root = config.storage.base_path,
  airports = config.airports.filter(airport => MODEL_COMPARISON_AIRPORTS.includes(airport.icao)),
  loadHour = createKimComparisonHourLoader({ root, credential, signal }) } = {}) {
  if (!/^\d{10}$/.test(String(tmfc)) || !Array.isArray(forecastHours) || forecastHours.length !== 13) throw new Error('invalid_kim_comparison_window')
  if (typeof loadHour !== 'function') throw new Error('kim_comparison_grid_loader_required')
  const run_at = new Date(Date.UTC(+tmfc.slice(0,4), +tmfc.slice(4,6)-1, +tmfc.slice(6,8), +tmfc.slice(8,10))).toISOString()
  const window = selectForecastWindow({ model: 'kim', run_at, selectedRuns: [{ model: 'kim', run_at }] })
  if (forecastHours.some((hf, index) => hf !== window.forecast_hours[index])) throw new Error('invalid_kim_comparison_window')
  const complete = []
  for (const airport of airports) {
    signal?.throwIfAborted()
    const entry = readAirportComparison({ root, airport_icao: airport.icao }).models.find(model => model.model === 'kim')
    if (entry?.run_at === run_at && entry.window_start_at === window.start_at && entry.window_end_at === window.end_at && entry.records?.length === 13) complete.push(airport)
  }
  const report = { model: 'kim', run_at, publishedAirports: [], reusedAirports: complete.map(airport => airport.icao), failedAirports: [], windows: Object.fromEntries(airports.map(airport => [airport.icao, window])), deferred: false, errors: [] }
  const pending = airports.filter(airport => !complete.includes(airport))
  if (!pending.length) return report
  const started_at = new Date().toISOString()
  const finishAttempt = () => {
    report.failed = report.failedAirports.length > 0
    writeCollectionAttempt({ root, model: 'kim', report: { ...report, started_at, finished_at: new Date().toISOString(), target_run_at: run_at, next_check_at: null } })
    cleanupComparisonRuns({ root, model: 'kim', maxRuns: 4 })
  }
  const hours = new Map()
  try {
    for (const hf of forecastHours) { signal?.throwIfAborted(); hours.set(hf, await loadHour({ tmfc, hf, signal })) }
  } catch (error) {
    report.failedAirports.push(...pending.map(airport => airport.icao))
    report.errors.push({ airport_icao: null, code: signal?.aborted ? 'collection_cancelled' : error.code || 'kim_grid_load_failed', message: error.message })
    finishAttempt()
    if (signal?.aborted || error?.name === 'AbortError') throw error
    return report
  }
  const collectedAt = new Date().toISOString()
  for (const airport of pending) {
    try {
      signal?.throwIfAborted()
      const records = forecastHours.map(hf => recordFor({ airport, tmfc, hf, window, hour: hours.get(hf), collectedAt }))
      signal?.throwIfAborted()
      const result = publishAirportWindow({ root, model: 'kim', airport_icao: airport.icao, run_at, window, records, metadata: { source: 'KMA KIM NE57' } })
      ;(result.published ? report.publishedAirports : report.reusedAirports).push(airport.icao)
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') {
        const partitioned = new Set([...report.publishedAirports, ...report.reusedAirports, ...report.failedAirports])
        report.failedAirports.push(...pending.map(candidate => candidate.icao).filter(icao => !partitioned.has(icao)))
        report.errors.push({ airport_icao: airport.icao, code: 'collection_cancelled', message: error.message })
        finishAttempt()
        throw error
      }
      report.failedAirports.push(airport.icao); report.errors.push({ airport_icao: airport.icao, code: error.code || 'kim_airport_failed', message: error.message })
    }
  }
  finishAttempt()
  return report
}
