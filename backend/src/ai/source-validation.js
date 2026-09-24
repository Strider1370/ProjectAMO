import {
  CATEGORY_VALUES,
  SOURCE_META_KEYS,
  TAF_CHANGE_TYPES,
  isAbsoluteIsoInstant,
} from './contracts.js'

const COLLECTION_STATUSES = new Set(['complete', 'empty', 'partial', 'failed', 'unknown'])
const CATEGORY_SET = new Set(CATEGORY_VALUES)
const CHANGE_TYPE_SET = new Set(TAF_CHANGE_TYPES)
const READER_RESULT_KEYS = new Set(['snapshot', 'meta'])

const EMPTY_META = Object.freeze({
  snapshotId: null,
  contentHash: null,
  publicationId: null,
  runId: null,
  collectionStatus: 'unknown',
  collectionReason: null,
  sourceCategories: Object.freeze({}),
})

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function validNullableString(value) {
  return value === null || typeof value === 'string'
}

function validNullableBoolean(value) {
  return value === null || typeof value === 'boolean'
}

function validNullableNumber(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function validNullableInstant(value) {
  return value === null || isAbsoluteIsoInstant(value)
}

function invalid(path) {
  return { ok: false, path }
}

function valid() {
  return { ok: true, path: null }
}

function validateOptionalField(object, key, predicate, path) {
  if (!(key in object)) return valid()
  return predicate(object[key]) ? valid() : invalid(`${path}.${key}`)
}

function validateSourceHeader(header, path) {
  if (!isPlainObject(header)) return invalid(path)

  for (const key of ['report_type', 'report_status', 'raw_text']) {
    const result = validateOptionalField(header, key, validNullableString, path)
    if (!result.ok) return result
  }
  for (const key of ['observation_time', 'issue_time', 'issued', 'valid_start', 'valid_end']) {
    const result = validateOptionalField(header, key, validNullableInstant, path)
    if (!result.ok) return result
  }

  if ('source' in header && header.source !== null) {
    if (!isPlainObject(header.source)) return invalid(`${path}.source`)
    const identifier = validateOptionalField(
      header.source,
      'identifier',
      validNullableString,
      `${path}.source`,
    )
    if (!identifier.ok) return identifier
    const fetchTime = validateOptionalField(
      header.source,
      'fetch_time',
      validNullableInstant,
      `${path}.source`,
    )
    if (!fetchTime.ok) return fetchTime
  }

  if ('tac' in header && header.tac !== null) {
    if (!isPlainObject(header.tac)) return invalid(`${path}.tac`)
    const tacText = validateOptionalField(header.tac, 'text', validNullableString, `${path}.tac`)
    if (!tacText.ok) return tacText
  }

  if ('temperatures' in header && header.temperatures !== null) {
    if (!isPlainObject(header.temperatures)) return invalid(`${path}.temperatures`)
    for (const key of ['max', 'min']) {
      if (!(key in header.temperatures) || header.temperatures[key] === null) continue
      const temperature = header.temperatures[key]
      if (!isPlainObject(temperature)) return invalid(`${path}.temperatures.${key}`)
      const value = validateOptionalField(
        temperature,
        'value',
        validNullableNumber,
        `${path}.temperatures.${key}`,
      )
      if (!value.ok) return value
      const time = validateOptionalField(
        temperature,
        'time',
        validNullableInstant,
        `${path}.temperatures.${key}`,
      )
      if (!time.ok) return time
    }
  }

  return valid()
}

function validateWind(value, path) {
  if (value === null) return valid()
  if (!isPlainObject(value)) return invalid(path)

  for (const key of ['direction', 'speed', 'gust']) {
    const result = validateOptionalField(value, key, validNullableNumber, path)
    if (!result.ok) return result
  }
  for (const key of ['unit', 'raw']) {
    const result = validateOptionalField(value, key, validNullableString, path)
    if (!result.ok) return result
  }
  for (const key of ['variable', 'calm']) {
    const result = validateOptionalField(value, key, validNullableBoolean, path)
    if (!result.ok) return result
  }
  return valid()
}

function validateCloud(value, path) {
  if (!isPlainObject(value)) return invalid(path)
  for (const key of ['amount', 'type', 'raw']) {
    const result = validateOptionalField(value, key, validNullableString, path)
    if (!result.ok) return result
  }
  return validateOptionalField(value, 'base', validNullableNumber, path)
}

function validateWeather(value, path) {
  if (!isPlainObject(value)) return invalid(path)
  for (const key of ['raw', 'descriptor']) {
    const result = validateOptionalField(value, key, validNullableString, path)
    if (!result.ok) return result
  }
  if (
    'phenomena' in value
    && (
      !Array.isArray(value.phenomena)
      || value.phenomena.some((phenomenon) => typeof phenomenon !== 'string')
    )
  ) {
    return invalid(`${path}.phenomena`)
  }
  return valid()
}

function validateArray(value, path, maximum, validateItem) {
  if (!Array.isArray(value) || value.length > maximum) return invalid(path)
  for (let index = 0; index < value.length; index += 1) {
    const result = validateItem(value[index], `${path}.${index}`)
    if (!result.ok) return result
  }
  return valid()
}

function validateOptionalArray(object, key, path, maximum, validateItem) {
  if (!(key in object) || object[key] === null) return valid()
  return validateArray(object[key], `${path}.${key}`, maximum, validateItem)
}

function validateVisibility(value, path) {
  if (value === null) return valid()
  if (!isPlainObject(value)) return invalid(path)

  for (const key of ['value', 'minimum_value', 'minimum', 'minimum_direction_degrees', 'minimum_direction']) {
    const result = validateOptionalField(value, key, validNullableNumber, path)
    if (!result.ok) return result
  }
  return validateOptionalField(value, 'cavok', validNullableBoolean, path)
}

function validateTemperature(value, path) {
  if (value === null) return valid()
  if (!isPlainObject(value)) return invalid(path)

  const air = validateOptionalField(value, 'air', validNullableNumber, path)
  if (!air.ok) return air
  return validateOptionalField(value, 'dewpoint', validNullableNumber, path)
}

function validateQnh(value, path) {
  if (value === null) return valid()
  if (!isPlainObject(value)) return invalid(path)

  const amount = validateOptionalField(value, 'value', validNullableNumber, path)
  if (!amount.ok) return amount
  return validateOptionalField(value, 'unit', validNullableString, path)
}

function validateRvr(value, path) {
  if (!isPlainObject(value)) return invalid(path)
  for (const key of ['runway', 'tendency', 'operator']) {
    const result = validateOptionalField(value, key, validNullableString, path)
    if (!result.ok) return result
  }
  for (const key of ['mean', 'minimum', 'maximum']) {
    const result = validateOptionalField(value, key, validNullableNumber, path)
    if (!result.ok) return result
  }
  return valid()
}

function validateDisplay(value, path) {
  if (value === null) return valid()
  if (!isPlainObject(value)) return invalid(path)
  for (const key of ['wind', 'visibility', 'weather', 'clouds', 'temperature', 'qnh']) {
    const result = validateOptionalField(value, key, validNullableString, path)
    if (!result.ok) return result
  }
  return valid()
}

function validateMetar(report, icao) {
  const path = `airports.${icao}`
  if (!isPlainObject(report)) return invalid(path)

  const header = validateSourceHeader(report.header, `${path}.header`)
  if (!header.ok) return header
  if (report.header.icao !== icao) return invalid(`${path}.header.icao`)
  if (!isPlainObject(report.observation)) return invalid(`${path}.observation`)

  const observation = report.observation
  if ('wind' in observation) {
    const wind = validateWind(observation.wind, `${path}.observation.wind`)
    if (!wind.ok) return wind
  }
  if ('visibility' in observation) {
    const visibility = validateVisibility(
      observation.visibility,
      `${path}.observation.visibility`,
    )
    if (!visibility.ok) return visibility
  }
  if ('temperature' in observation) {
    const temperature = validateTemperature(
      observation.temperature,
      `${path}.observation.temperature`,
    )
    if (!temperature.ok) return temperature
  }
  if ('qnh' in observation) {
    const qnh = validateQnh(observation.qnh, `${path}.observation.qnh`)
    if (!qnh.ok) return qnh
  }

  const clouds = validateOptionalArray(
    observation,
    'clouds',
    `${path}.observation`,
    100,
    validateCloud,
  )
  if (!clouds.ok) return clouds
  const weather = validateOptionalArray(
    observation,
    'weather',
    `${path}.observation`,
    100,
    validateWeather,
  )
  if (!weather.ok) return weather
  const rvr = validateOptionalArray(
    observation,
    'rvr',
    `${path}.observation`,
    100,
    validateRvr,
  )
  if (!rvr.ok) return rvr

  if ('display' in observation) {
    const display = validateDisplay(observation.display, `${path}.observation.display`)
    if (!display.ok) return display
  }
  if (
    'wind_shear' in observation
    && observation.wind_shear !== null
    && typeof observation.wind_shear !== 'string'
    && !isPlainObject(observation.wind_shear)
  ) {
    return invalid(`${path}.observation.wind_shear`)
  }
  if ('trend' in report) {
    if (!Array.isArray(report.trend) || report.trend.some((item) => typeof item !== 'string')) {
      return invalid(`${path}.trend`)
    }
  }
  for (const key of ['cavok_flag', 'nsc_flag', '_stale']) {
    const result = validateOptionalField(report, key, validNullableBoolean, path)
    if (!result.ok) return result
  }
  return valid()
}

function validateForecastState(value, path) {
  if (!isPlainObject(value)) return invalid(path)

  if ('wind' in value) {
    const wind = validateWind(value.wind, `${path}.wind`)
    if (!wind.ok) return wind
  }
  const visibility = validateOptionalField(value, 'vis', validNullableNumber, path)
  if (!visibility.ok) return visibility

  const clouds = validateOptionalArray(value, 'clouds', path, 100, validateCloud)
  if (!clouds.ok) return clouds
  const weather = validateOptionalArray(value, 'wx', path, 100, validateWeather)
  if (!weather.ok) return weather

  for (const key of ['cavok_flag', 'wx_touched', 'clouds_touched', 'nsw_flag', 'nsc_flag']) {
    const result = validateOptionalField(value, key, validNullableBoolean, path)
    if (!result.ok) return result
  }
  return valid()
}

function validateChangeGroup(value, path) {
  if (!isPlainObject(value)) return invalid(path)
  if (!CHANGE_TYPE_SET.has(value.type)) return invalid(`${path}.type`)

  for (const key of ['start', 'end']) {
    const result = validateOptionalField(value, key, validNullableInstant, path)
    if (!result.ok) return result
  }
  if (
    value.start != null
    && value.end != null
    && Date.parse(value.start) >= Date.parse(value.end)
  ) {
    return invalid(`${path}.validity`)
  }
  return validateForecastState(value, path)
}

function validateTimelineEntry(value, path) {
  if (!isPlainObject(value)) return invalid(path)
  if (!isAbsoluteIsoInstant(value.time)) return invalid(`${path}.time`)
  if (!isPlainObject(value.visibility)) return invalid(`${path}.visibility`)

  const amount = validateOptionalField(
    value.visibility,
    'value',
    validNullableNumber,
    `${path}.visibility`,
  )
  if (!amount.ok) return amount
  const cavok = validateOptionalField(
    value.visibility,
    'cavok',
    validNullableBoolean,
    `${path}.visibility`,
  )
  if (!cavok.ok) return cavok

  const clouds = validateArray(value.clouds, `${path}.clouds`, 100, validateCloud)
  if (!clouds.ok) return clouds
  return validateArray(value.weather, `${path}.weather`, 100, validateWeather)
}

function validateTaf(report, icao) {
  const path = `airports.${icao}`
  if (!isPlainObject(report)) return invalid(path)

  const header = validateSourceHeader(report.header, `${path}.header`)
  if (!header.ok) return header
  if (report.header.icao !== icao) return invalid(`${path}.header.icao`)
  if (
    !isAbsoluteIsoInstant(report.header.valid_start)
    || !isAbsoluteIsoInstant(report.header.valid_end)
    || Date.parse(report.header.valid_start) >= Date.parse(report.header.valid_end)
  ) {
    return invalid(`${path}.header.validity`)
  }

  const base = validateForecastState(report.base, `${path}.base`)
  if (!base.ok) return base
  const changes = validateArray(
    report.change_groups,
    `${path}.change_groups`,
    200,
    validateChangeGroup,
  )
  if (!changes.ok) return changes
  return validateArray(report.timeline, `${path}.timeline`, 1000, validateTimelineEntry)
}

function validateWarningItem(value, path) {
  if (!isPlainObject(value)) return invalid(path)
  for (const key of ['wrng_type', 'wrng_type_key', 'wrng_type_name']) {
    const result = validateOptionalField(value, key, validNullableString, path)
    if (!result.ok) return result
  }
  for (const key of ['issued', 'valid_start', 'valid_end']) {
    const result = validateOptionalField(value, key, validNullableInstant, path)
    if (!result.ok) return result
  }
  return valid()
}

function validateWarningEntry(entry, icao) {
  if (entry === undefined) return valid()
  const path = `airports.${icao}`
  if (!isPlainObject(entry)) return invalid(path)
  if (!Array.isArray(entry.warnings)) return invalid(`${path}.warnings`)
  if (entry.warnings.length > 1000) return invalid(`${path}.warnings`)

  const airportName = validateOptionalField(entry, 'airport_name', validNullableString, path)
  if (!airportName.ok) return airportName
  const stale = validateOptionalField(entry, '_stale', validNullableBoolean, path)
  if (!stale.ok) return stale

  return validateArray(entry.warnings, `${path}.warnings`, 1000, validateWarningItem)
}

function validateSnapshotContainer(kind, snapshot) {
  if (!isPlainObject(snapshot)) return invalid('snapshot')
  if (!isPlainObject(snapshot.airports)) return invalid('snapshot.airports')

  const fetchedAt = validateOptionalField(snapshot, 'fetched_at', validNullableInstant, 'snapshot')
  if (!fetchedAt.ok) return fetchedAt

  if (kind === 'warning') {
    if ('type' in snapshot && snapshot.type !== 'AIRPORT_WARNINGS') {
      return invalid('snapshot.type')
    }
    if (
      'total_count' in snapshot
      && (!Number.isInteger(snapshot.total_count) || snapshot.total_count < 0)
    ) {
      return invalid('snapshot.total_count')
    }
  }
  return valid()
}

function normalizeMeta(meta) {
  if (meta === undefined || meta === null) {
    return { ok: true, value: EMPTY_META, path: null }
  }
  if (!isPlainObject(meta)) {
    return { ok: false, value: EMPTY_META, path: 'meta' }
  }
  if (Object.keys(meta).some((key) => !SOURCE_META_KEYS.has(key))) {
    return { ok: false, value: EMPTY_META, path: 'meta' }
  }

  for (const key of ['snapshotId', 'contentHash', 'publicationId', 'runId', 'collectionReason']) {
    if (key in meta && !validNullableString(meta[key])) {
      return { ok: false, value: EMPTY_META, path: `meta.${key}` }
    }
  }
  if ('collectionStatus' in meta && !COLLECTION_STATUSES.has(meta.collectionStatus)) {
    return { ok: false, value: EMPTY_META, path: 'meta.collectionStatus' }
  }

  let sourceCategories = {}
  if ('sourceCategories' in meta) {
    if (!isPlainObject(meta.sourceCategories)) {
      return { ok: false, value: EMPTY_META, path: 'meta.sourceCategories' }
    }
    sourceCategories = {}
    for (const [icao, category] of Object.entries(meta.sourceCategories)) {
      if (
        !isPlainObject(category)
        || Object.keys(category).some((key) => !['value', 'path'].includes(key))
        || !CATEGORY_SET.has(category.value)
        || typeof category.path !== 'string'
      ) {
        return {
          ok: false,
          value: EMPTY_META,
          path: `meta.sourceCategories.${icao}`,
        }
      }
      sourceCategories[icao] = { value: category.value, path: category.path }
    }
  }

  return {
    ok: true,
    path: null,
    value: {
      snapshotId: meta.snapshotId ?? null,
      contentHash: meta.contentHash ?? null,
      publicationId: meta.publicationId ?? null,
      runId: meta.runId ?? null,
      collectionStatus: meta.collectionStatus ?? 'unknown',
      collectionReason: meta.collectionReason ?? null,
      sourceCategories,
    },
  }
}

export function normalizeReaderResult(value) {
  if (
    !isPlainObject(value)
    || !Object.hasOwn(value, 'snapshot')
    || Object.keys(value).some((key) => !READER_RESULT_KEYS.has(key))
  ) {
    return {
      snapshot: isPlainObject(value) && Object.hasOwn(value, 'snapshot') ? value.snapshot : null,
      meta: EMPTY_META,
      invalidPath: 'reader.result',
    }
  }

  const meta = normalizeMeta(value.meta)
  return {
    snapshot: value.snapshot,
    meta: meta.value,
    invalidPath: meta.ok ? null : meta.path,
  }
}

export function validateSelectedSource(kind, snapshot, icao) {
  const container = validateSnapshotContainer(kind, snapshot)
  if (!container.ok) return { ...container, report: null }

  const report = snapshot.airports[icao]
  let result
  if (kind === 'metar') result = validateMetar(report, icao)
  else if (kind === 'taf') result = validateTaf(report, icao)
  else result = validateWarningEntry(report, icao)

  return { ...result, report: report ?? null }
}
