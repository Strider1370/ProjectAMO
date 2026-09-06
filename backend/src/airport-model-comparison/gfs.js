import fs from 'node:fs'
import path from 'node:path'

import { requestObservedApi as defaultRequestObservedApi } from '../lib/request-observability.js'
import { api as config, airports as configuredAirports } from '../config.js'
import { MODEL_COMPARISON_AIRPORTS } from '../../../shared/airport-model-comparison.js'
import { contentRevision, publishAirportWindow } from './store.js'
import { CEILING_METHODS, HOUR_MS, normalizeUtc, selectForecastWindow } from './model.js'
import { parseGfsGrib2, sampleGfsMessage } from '../parsers/gfs-grib2-parser.js'

const LEVELS = ['surface', 'mean_sea_level', '10_m_above_ground', '2_m_above_ground', 'cloud_ceiling',
  'entire_atmosphere', 'low_cloud_layer', 'middle_cloud_layer', 'high_cloud_layer']
const VARIABLES = ['UGRD', 'VGRD', 'GUST', 'APCP', 'TMP', 'DPT', 'RH', 'PRMSL', 'TCDC', 'LCDC', 'MCDC', 'HCDC', 'HGT', 'VIS']
const MPS_TO_KT = 1.9438444924406

export function buildGfsRequest({ run_at, forecast_hour }) {
  run_at = normalizeUtc(run_at)
  if (!Number.isInteger(forecast_hour) || forecast_hour < 0 || forecast_hour > 384) throw new Error('invalid_gfs_forecast_hour')
  const date = run_at.slice(0, 10).replaceAll('-', ''), hour = run_at.slice(11, 13), padded = String(forecast_hour).padStart(3, '0')
  const query = new URLSearchParams({ file: `gfs.t${hour}z.pgrb2.0p25.f${padded}`, dir: `/gfs.${date}/${hour}/atmos`, subregion: '',
    leftlon: '124', rightlon: '132', toplat: '39', bottomlat: '33' })
  for (const level of LEVELS) query.set(`lev_${level}`, 'on')
  for (const variable of VARIABLES) query.set(`var_${variable}`, 'on')
  return new URL(`https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25_1hr.pl?${query}`)
}

function sameGrid(a, b) {
  return ['nx', 'ny', 'firstLat', 'firstLon', 'iStep', 'jStep', 'scanningMode'].every(key => a?.[key] === b?.[key])
}

function unique(messages, predicate, label, optional = false) {
  const matches = messages.filter(predicate)
  if (matches.length === 0 && optional) return null
  if (matches.length !== 1) throw new Error(`gfs_field_count:${label}`)
  return matches[0]
}

function equivalentMessage(left, right) {
  if (!['parameter', 'units', 'stepType', 'startStep', 'endStep', 'run_at'].every(key => left[key] === right[key])
      || !sameGrid(left.grid, right.grid) || left.values.length !== right.values.length) return false
  return left.values.every((value, index) => Object.is(value, right.values[index]))
}

function equivalentOrMissing(messages, predicate) {
  const matches = messages.filter(predicate)
  return matches.length && matches.every(message => equivalentMessage(matches[0], message)) ? matches[0] : null
}

function at(messages, airport, parameter, { surface, level, stepType = 'instant', optional = false } = {}) {
  const message = unique(messages, candidate => candidate.parameter === parameter && candidate.stepType === stepType
    && (surface === undefined || candidate.typeOfLevel === surface) && (level === undefined || candidate.level === level), parameter, optional)
  return message ? { message, point: sampleGfsMessage(message, airport) } : null
}

export function gfsHourlyPrecipitation({ current, previous, forecast_hour, airport }) {
  if (forecast_hour === 0) return null
  const currentMessage = equivalentOrMissing(current, message => message.parameter === 'APCP' && message.stepType === 'accum'
    && message.startStep === 0 && message.endStep === forecast_hour)
  if (!currentMessage) return null
  const currentPoint = sampleGfsMessage(currentMessage, airport)
  if (forecast_hour === 1) return currentPoint?.value ?? null
  const previousMessage = equivalentOrMissing(previous, message => message.parameter === 'APCP' && message.stepType === 'accum'
    && message.startStep === 0 && message.endStep === forecast_hour - 1)
  if (!previousMessage) return null
  const previousPoint = sampleGfsMessage(previousMessage, airport)
  if (currentMessage.run_at !== previousMessage.run_at || currentMessage.units !== previousMessage.units
      || !sameGrid(currentMessage.grid, previousMessage.grid) || currentPoint?.grid_lat !== previousPoint?.grid_lat
      || currentPoint?.grid_lon !== previousPoint?.grid_lon) throw new Error('gfs_precipitation_identity')
  if (!Number.isFinite(currentPoint?.value) || !Number.isFinite(previousPoint?.value)) return null
  const result = currentPoint.value - previousPoint.value
  if (result < -1e-9) throw new Error('gfs_precipitation_negative_difference')
  return Math.max(0, result)
}

function provenance(source_variable, source_unit, method = 'provider_value', missing_reason = null) {
  return { source_variable, source_unit, method, missing_reason }
}

const converted = (value, convert) => Number.isFinite(value) ? convert(value) : null

function ceilingState(entry) {
  if (!entry?.point || !Number.isFinite(entry.point.value)) return { ceiling_agl_ft: null, ceiling_status: 'missing_input' }
  const tolerance = entry.message.packing.quantization / 2 + Number.EPSILON * 20_000 * 4
  if (Math.abs(entry.point.value - 20_000) <= tolerance) return { ceiling_agl_ft: null, ceiling_status: 'no_ceiling' }
  return { ceiling_agl_ft: entry.point.value / .3048, ceiling_status: 'value' }
}

export function normalizeGfsHour({ airport, messages, previousMessages = [], run_at, forecast_hour, window, available_at, collected_at, source_payload_revision }) {
  run_at = normalizeUtc(run_at)
  if (messages.some(message => message.run_at !== run_at || message.endStep !== forecast_hour)) throw new Error('gfs_file_identity')
  const get = (parameter, options = {}) => at(messages, airport, parameter, { optional: true, ...options })
  const u = get('UGRD', { surface: 'heightAboveGround', level: 10 }), v = get('VGRD', { surface: 'heightAboveGround', level: 10 })
  const gust = forecast_hour === 0 ? null : get('GUST', { surface: 'surface', optional: true })
  const temperature = get('TMP', { surface: 'heightAboveGround', level: 2 }), dewpoint = get('DPT', { surface: 'heightAboveGround', level: 2 })
  const rh = get('RH', { surface: 'heightAboveGround', level: 2 }), pressure = get('PRMSL', { surface: 'meanSea' })
  const terrain = at(messages, airport, 'HGT', { surface: 'surface' }), visibility = get('VIS', { surface: 'surface' })
  const ceiling = get('HGT', { surface: 'cloudCeiling', optional: true }), ceilingValue = ceilingState(ceiling)
  const clouds = Object.fromEntries([['total', ['TCDC', 'atmosphere']], ['low', ['LCDC', 'lowCloudLayer']],
    ['mid', ['MCDC', 'middleCloudLayer']], ['high', ['HCDC', 'highCloudLayer']]].map(([key, [parameter, surface]]) => [key, at(messages, airport, parameter, { surface })]))
  const precipitation = forecast_hour === 0 ? null : gfsHourlyPrecipitation({ current: messages, previous: previousMessages, forecast_hour, airport })
  const cumulativeMessage = forecast_hour === 0 ? null : equivalentOrMissing(messages, message => message.parameter === 'APCP'
    && message.stepType === 'accum' && message.startStep === 0 && message.endStep === forecast_hour)
  const cumulative = cumulativeMessage ? sampleGfsMessage(cumulativeMessage, airport)?.value : null
  if (!Number.isFinite(terrain.point.value)) throw new Error('gfs_missing_grid_elevation')
  const hasWind = Number.isFinite(u?.point?.value) && Number.isFinite(v?.point?.value)
  const windSpeed = hasWind ? Math.hypot(u.point.value, v.point.value) * MPS_TO_KT : null
  const windDirection = hasWind ? (Math.atan2(-u.point.value, -v.point.value) * 180 / Math.PI + 360) % 360 : null
  const values = {
    wind_direction_deg: windDirection, wind_speed_kt: windSpeed, wind_gust_kt: Number.isFinite(gust?.point?.value) ? gust.point.value * MPS_TO_KT : null,
    precipitation_mm: precipitation, temperature_c: converted(temperature?.point?.value, value => value - 273.15), relative_humidity_pct: rh?.point?.value ?? null,
    dew_point_c: converted(dewpoint?.point?.value, value => value - 273.15), pressure_msl_hpa: converted(pressure?.point?.value, value => value / 100),
    cloud_total_pct: clouds.total?.point?.value ?? null, cloud_low_pct: clouds.low?.point?.value ?? null, cloud_mid_pct: clouds.mid?.point?.value ?? null,
    cloud_high_pct: clouds.high?.point?.value ?? null, ceiling_agl_ft: ceilingValue.ceiling_agl_ft, visibility_m: visibility?.point?.value ?? null,
  }
  const field_provenance = {
    wind_direction_deg: provenance('UGRD+VGRD', 'm s**-1', 'derived', hasWind ? null : 'provider_missing'), wind_speed_kt: provenance('UGRD+VGRD', 'm s**-1', 'converted', hasWind ? null : 'provider_missing'),
    wind_gust_kt: provenance('GUST', 'm s**-1', 'converted', forecast_hour === 0 ? 'structural_f000' : gust?.point?.value == null ? 'provider_missing' : null),
    precipitation_mm: provenance('APCP(0-h)-APCP(0-(h-1))', 'kg m**-2', 'derived', forecast_hour === 0 ? 'structural_f000' : precipitation == null ? 'provider_missing' : null),
    temperature_c: provenance('TMP:2m', 'K', 'converted', values.temperature_c == null ? 'provider_missing' : null), relative_humidity_pct: provenance('RH:2m', '%', 'provider_value', values.relative_humidity_pct == null ? 'provider_missing' : null), dew_point_c: provenance('DPT:2m', 'K', 'converted', values.dew_point_c == null ? 'provider_missing' : null),
    pressure_msl_hpa: provenance('PRMSL', 'Pa', 'converted', values.pressure_msl_hpa == null ? 'provider_missing' : null), cloud_total_pct: provenance('TCDC:entire_atmosphere', '%', 'provider_value', values.cloud_total_pct == null ? 'provider_missing' : null),
    cloud_low_pct: provenance('LCDC:low_cloud_layer', '%', 'provider_value', values.cloud_low_pct == null ? 'provider_missing' : null), cloud_mid_pct: provenance('MCDC:middle_cloud_layer', '%', 'provider_value', values.cloud_mid_pct == null ? 'provider_missing' : null), cloud_high_pct: provenance('HCDC:high_cloud_layer', '%', 'provider_value', values.cloud_high_pct == null ? 'provider_missing' : null),
    ceiling_agl_ft: provenance('HGT:cloud_ceiling', 'gpm', 'converted', ceilingValue.ceiling_status === 'value' ? null : ceilingValue.ceiling_status === 'no_ceiling' ? 'not_provided' : 'provider_missing'),
    visibility_m: provenance('VIS', 'm', 'provider_value', values.visibility_m == null ? 'provider_missing' : null),
  }
  return { airport_icao: airport.icao, model: 'gfs', source: 'NOAA NOMADS GFS 0.25 degree', run_at,
    available_at: available_at === null ? null : normalizeUtc(available_at), collected_at: normalizeUtc(collected_at),
    valid_at: new Date(Date.parse(run_at) + forecast_hour * HOUR_MS).toISOString(), forecast_hour,
    window_start_at: normalizeUtc(window.start_at), window_end_at: normalizeUtc(window.end_at), temporal_method: 'native_hourly', selection_method: 'nearest_grid_point',
    requested_lat: airport.lat, requested_lon: airport.lon, grid_lat: terrain.point.grid_lat, grid_lon: terrain.point.grid_lon,
    grid_elevation_m: terrain.point.value, ...values, precipitation_accumulated_mm: cumulative,
    ceiling_method: CEILING_METHODS.gfs, ceiling_status: ceilingValue.ceiling_status, ceiling_limit_ft: null,
    ceiling_source_levels: ceiling ? [{ source_variable: 'HGT:cloud_ceiling', value_gpm: ceiling.point.value, quantization: ceiling.message.packing.quantization }] : [],
    field_provenance, source_payload_revision: source_payload_revision || contentRevision(messages.map(message => [message.parameter, message.startStep, message.endStep, message.packing, message.values])) }
}

function targetRun(nowMs) {
  const cycle = 6 * HOUR_MS, requestDelay = (6 * 60 + 10) * 60_000
  return new Date(Math.floor((nowMs - requestDelay) / cycle) * cycle).toISOString()
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('gfs_collection_cancelled')
}

function actualHttpInstant(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString()
}

export async function collectGfs({ signal, root = config.storage.base_path,
  airports = configuredAirports.filter(airport => MODEL_COMPARISON_AIRPORTS.includes(airport.icao)),
  requestObservedApi = defaultRequestObservedApi, clock = Date.now, run_at = targetRun(clock()) } = {}) {
  run_at = normalizeUtc(run_at)
  const window = selectForecastWindow({ model: 'gfs', run_at }), collected_at = new Date(clock()).toISOString()
  const byHour = new Map(), revisions = new Map(), availability = new Map(), errors = [], publishedAirports = [], reusedAirports = [], failedAirports = []
  const runId = run_at.replace(/\D/g, '').slice(0, 12)
  try {
    for (let hour = 0; hour <= 12; hour += 1) {
      throwIfAborted(signal)
      const rawDir = path.join(root, 'airport_model_comparison', 'gfs', 'runs', runId, 'raw')
      const rawFile = path.join(rawDir, `gfs-f${String(hour).padStart(3, '0')}.grib2`), metadataFile = `${rawFile}.json`
      let body, lastModified = null, messages
      if (fs.existsSync(rawFile)) {
        try {
          body = fs.readFileSync(rawFile); messages = parseGfsGrib2(body)
          const metadata = fs.existsSync(metadataFile) ? JSON.parse(fs.readFileSync(metadataFile, 'utf8')) : {}
          lastModified = actualHttpInstant(metadata.last_modified)
        } catch { body = messages = undefined }
      }
      if (!messages?.length || messages.some(message => message.run_at !== run_at || message.endStep !== hour)) {
        const response = await requestObservedApi({ operation: 'nomads_gfs_filter', url: buildGfsRequest({ run_at, forecast_hour: hour }), options: signal ? { signal } : {} })
        body = Buffer.from(await response.arrayBuffer())
        if (!response.ok || !body.subarray(0, 4).equals(Buffer.from('GRIB'))) throw new Error('invalid_gfs_response')
        messages = parseGfsGrib2(body); lastModified = actualHttpInstant(response.headers.get('last-modified'))
      }
      if (!messages.length || messages.some(message => message.run_at !== run_at || message.endStep !== hour)) throw new Error('gfs_file_identity')
      byHour.set(hour, messages)
      revisions.set(hour, contentRevision(body.toString('base64')))
      availability.set(hour, lastModified)
      fs.mkdirSync(rawDir, { recursive: true }); fs.writeFileSync(rawFile, body)
      fs.writeFileSync(metadataFile, `${JSON.stringify({ last_modified: lastModified, revision: revisions.get(hour) })}\n`, 'utf8')
    }
  } catch (error) {
    return { model: 'gfs', publishedAirports, reusedAirports, failedAirports: airports.map(a => a.icao), run_at, windows: {}, deferred: false,
      errors: [{ airport_icao: null, code: error.code || error.message, message: error.message }] }
  }
  for (const airport of airports) {
    try {
      throwIfAborted(signal)
      const records = window.forecast_hours.map(hour => normalizeGfsHour({ airport, messages: byHour.get(hour), previousMessages: byHour.get(hour - 1) || [],
        run_at, forecast_hour: hour, window, available_at: availability.get(hour), collected_at, source_payload_revision: revisions.get(hour) }))
      throwIfAborted(signal)
      const result = publishAirportWindow({ root, model: 'gfs', airport_icao: airport.icao, run_at, window, records, metadata: { provider: 'NOAA NOMADS' } })
      ;(result.published ? publishedAirports : reusedAirports).push(airport.icao)
    } catch (error) {
      failedAirports.push(airport.icao); errors.push({ airport_icao: airport.icao, code: error.code || error.message, message: error.message })
    }
  }
  return { model: 'gfs', publishedAirports, reusedAirports, failedAirports, run_at, windows: Object.fromEntries(airports.map(a => [a.icao, window])), deferred: false, errors }
}
