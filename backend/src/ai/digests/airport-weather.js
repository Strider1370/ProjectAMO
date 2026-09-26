import { ceilingFromClouds } from '../../briefing/airport-summary.js'
import { categoryDetail, categoryFor } from '../../briefing/flight-category.js'
import { buildMetarTac } from '../../serializers/metar-tac.js'
import { buildTafTac } from '../../serializers/taf-tac.js'
import { annotateMetarTac, annotateTafTac } from '../../parsers/tac-annotation.js'

function finite(value) {
  return Number.isFinite(value) ? value : null
}

function text(value) {
  return typeof value === 'string' ? value : null
}

function iso(value) {
  return value == null ? null : new Date(value).toISOString()
}

function projectWeather(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => text(item?.raw)).filter((item) => item !== null)
}

function projectClouds(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => ({
    amount: text(item.amount),
    baseFt: finite(item.base),
    type: text(item.type),
    raw: text(item.raw),
  }))
}

function projectWind(value) {
  if (!value || typeof value !== 'object') return null
  return {
    direction: finite(value.direction),
    speed: finite(value.speed),
    gust: finite(value.gust),
    unit: text(value.unit),
    variable: typeof value.variable === 'boolean' ? value.variable : null,
    calm: typeof value.calm === 'boolean' ? value.calm : null,
  }
}

function visibilityQualifier(value, cavok) {
  if (cavok === true || (Number.isFinite(value) && value >= 9999)) return 'at_least'
  if (Number.isFinite(value)) return 'reported'
  return 'unknown'
}

function projectForecastState(value) {
  const visibilityM = finite(value?.vis)
  const cavok = typeof value?.cavok_flag === 'boolean' ? value.cavok_flag : null
  return {
    wind: projectWind(value?.wind),
    visibilityM,
    visibilityQualifier: visibilityQualifier(visibilityM, cavok),
    cavok,
    clouds: value?.clouds == null ? null : projectClouds(value.clouds),
    weather: value?.wx == null ? null : projectWeather(value.wx),
    weatherTouched: typeof value?.wx_touched === 'boolean' ? value.wx_touched : null,
    cloudsTouched: typeof value?.clouds_touched === 'boolean' ? value.clouds_touched : null,
    nsw: typeof value?.nsw_flag === 'boolean' ? value.nsw_flag : null,
    nsc: typeof value?.nsc_flag === 'boolean' ? value.nsc_flag : null,
  }
}

function rawFor(report, kind, includeRaw, issues, icao) {
  const header = report.header ?? {}
  const provider = header.source?.identifier
  let raw = null
  let rawKind = 'unavailable'

  if (provider === 'KMA') {
    let reconstructed = null
    try {
      reconstructed = kind === 'metar' ? buildMetarTac(report) : buildTafTac(report)
    } catch {
      reconstructed = null
    }
    raw = text(header.tac?.text) ?? text(header.raw_text) ?? reconstructed
    rawKind = raw ? 'reconstructed' : 'unavailable'
  } else if (provider === 'NOAA') {
    raw = text(header.raw_text)
    rawKind = raw ? 'original' : 'unavailable'
  }

  if (raw && Buffer.byteLength(raw, 'utf8') > 16 * 1024) {
    raw = null
    rawKind = 'unavailable'
    issues.push({
      code: 'RAW_UNAVAILABLE',
      icao,
      kind,
      path: 'header.raw_text',
      reason: 'RAW_TOO_LARGE',
    })
  } else if (!raw) {
    issues.push({
      code: 'RAW_UNAVAILABLE',
      icao,
      kind,
      path: 'header.raw_text',
      reason: 'RAW_UNAVAILABLE',
    })
  }

  // Token roles let the chat card colour the report with the airport-panel rules.
  const annotated = includeRaw && raw ? (kind === 'metar' ? annotateMetarTac(raw) : annotateTafTac(raw)) : null
  return {
    rawKind,
    raw: includeRaw ? raw : null,
    rawLines: annotated ? annotated.display_lines.map((line) => line.tokens
      .filter((token) => token.role !== 'separator').map(({ text: value, role }) => ({ text: value, role }))) : null,
  }
}

function recordMetarMissingFields(observation, icao, issues) {
  const missing = []
  for (const key of ['wind', 'visibility', 'clouds', 'weather', 'temperature', 'qnh']) {
    if (!Object.hasOwn(observation, key) || observation[key] == null) {
      const path = `observation.${key}`
      missing.push(path)
      issues.push({
        code: 'MISSING_FIELD',
        icao,
        kind: 'metar',
        path,
        reason: 'MISSING_FIELD',
      })
    }
  }
  if (!Object.hasOwn(observation, 'rvr') || observation.rvr == null) {
    missing.push('observation.rvr')
  }
  return missing.sort()
}

function recordTafMissingFields(taf) {
  const missing = []
  if (taf.header.issued == null) missing.push('header.issued')
  for (const key of ['wind', 'vis', 'clouds', 'wx']) {
    if (!Object.hasOwn(taf.base, key) || taf.base[key] == null) {
      missing.push(`base.${key}`)
    }
  }
  return missing.sort()
}

function projectMetar({ icao, metar, sourceCategory, includeRaw, issues }) {
  const observation = metar.observation
  const missingFields = recordMetarMissingFields(observation, icao, issues)
  const visibility = finite(observation.visibility?.value)
  const cavok = typeof observation.visibility?.cavok === 'boolean'
    ? observation.visibility.cavok
    : null
  const cloudValues = Array.isArray(observation.clouds) ? observation.clouds : []
  const projectedClouds = projectClouds(cloudValues)
  const ceilingFt = ceilingFromClouds(cloudValues)
  const derivedValue = !Number.isFinite(visibility) && projectedClouds.length === 0
    ? 'UNKNOWN'
    : categoryDetail({
        visibilityM: cavok ? 9999 : visibility,
        ceilingFt,
        icao,
      }).category
  const rvrEntries = Array.isArray(observation.rvr)
    ? observation.rvr.map((entry) => ({
        runway: text(entry.runway),
        mean: finite(entry.mean),
        minimum: finite(entry.minimum),
        maximum: finite(entry.maximum),
        tendency: text(entry.tendency),
        operator: text(entry.operator),
        unit: 'm',
      }))
    : []

  if (Array.isArray(metar.trend) && metar.trend.length > 0) {
    issues.push({
      code: 'NON_PROJECTED_SIGNIFICANT_DATA',
      icao,
      kind: 'metar',
      path: 'trend',
      reason: 'STRUCTURED_DIGEST_OMITS_FIELD_CHECK_RAW',
    })
  }
  if (observation.wind_shear != null) {
    issues.push({
      code: 'NON_PROJECTED_SIGNIFICANT_DATA',
      icao,
      kind: 'metar',
      path: 'observation.wind_shear',
      reason: 'STRUCTURED_DIGEST_OMITS_FIELD_CHECK_RAW',
    })
  }

  return {
    sourceId: `metar:${icao}`,
    reportType: text(metar.header.report_type),
    observationTime: iso(metar.header.observation_time),
    issueTime: iso(metar.header.issue_time),
    wind: projectWind(observation.wind),
    visibility: {
      value: visibility,
      minimumValue: finite(
        observation.visibility?.minimum_value ?? observation.visibility?.minimum,
      ),
      minimumDirectionDegrees: finite(
        observation.visibility?.minimum_direction_degrees
          ?? observation.visibility?.minimum_direction,
      ),
      cavok,
      qualifier: visibilityQualifier(visibility, cavok),
      unit: 'm',
    },
    clouds: projectedClouds,
    weather: projectWeather(observation.weather),
    temperature: {
      air: finite(observation.temperature?.air),
      dewpoint: finite(observation.temperature?.dewpoint),
      unit: 'C',
    },
    qnh: {
      value: finite(observation.qnh?.value),
      unit: text(observation.qnh?.unit),
    },
    ceilingFt,
    rvr: {
      status: rvrEntries.length > 0 ? 'reported' : 'not_reported',
      entries: rvrEntries,
    },
    category: {
      sourceValue: sourceCategory?.value ?? null,
      sourcePath: sourceCategory?.path ?? null,
      derivedValue,
      derivedPolicy: 'airport-minima-3-level',
    },
    ...rawFor(metar, 'metar', includeRaw, issues, icao),
    missingFields,
  }
}

function changeSemantics(type) {
  if (type === 'BECMG') return 'transition'
  if (type === 'FM') return 'from'
  if (type === 'TEMPO') return 'temporary'
  return 'probabilistic'
}

function changeProbability(type) {
  if (type.startsWith('PROB30')) return 30
  if (type.startsWith('PROB40')) return 40
  return null
}

function projectTaf({ icao, taf, window, includeRaw, issues }) {
  const validStart = iso(taf.header.valid_start)
  const validEnd = iso(taf.header.valid_end)
  const changes = taf.change_groups.map((group, index) => ({
    index,
    type: group.type,
    start: iso(group.start),
    end: iso(group.end),
    probability: changeProbability(group.type),
    semantics: changeSemantics(group.type),
    state: projectForecastState(group),
  }))

  const requestedStart = Date.parse(window.start)
  const requestedEnd = Date.parse(window.end)
  const validityStart = Date.parse(validStart)
  const validityEnd = Date.parse(validEnd)
  const samples = taf.timeline
    .filter((entry) => {
      const time = Date.parse(entry.time)
      return time >= requestedStart
        && time < requestedEnd
        && time >= validityStart
        && time < validityEnd
    })
    .map((entry) => {
      const visibilityM = finite(entry.visibility.value)
      const cavok = typeof entry.visibility.cavok === 'boolean'
        ? entry.visibility.cavok
        : null
      const cloudValues = entry.clouds
      const ceilingFt = ceilingFromClouds(cloudValues)
      return {
        time: iso(entry.time),
        visibilityM,
        cavok,
        visibilityQualifier: visibilityQualifier(visibilityM, cavok),
        ceilingFt,
        derivedCategory: categoryFor({
          visibilityM: cavok ? 9999 : visibilityM,
          ceilingFt,
          icao,
        }),
        weather: projectWeather(entry.weather),
      }
    })

  const intersects = Math.max(requestedStart, validityStart)
    < Math.min(requestedEnd, validityEnd)
  if (intersects && samples.length === 0) {
    issues.push({
      code: 'TIMELINE_EMPTY',
      icao,
      kind: 'taf',
      path: 'timeline',
      reason: 'NO_TIMELINE_ENTRIES_IN_WINDOW',
    })
  }

  return {
    sourceId: `taf:${icao}`,
    issuedAt: iso(taf.header.issued),
    validity: {
      start: validStart,
      end: validEnd,
    },
    base: projectForecastState(taf.base),
    changes,
    samples,
    sampleSemantics: 'parser-merged-samples',
    ...rawFor(taf, 'taf', includeRaw, issues, icao),
    missingFields: recordTafMissingFields(taf),
  }
}

export function buildAirportDigest({
  icao,
  nameKo,
  metar,
  taf,
  warnings,
  window,
  sourceCategory = null,
  includeRaw = false,
  issues = [],
}) {
  return {
    icao,
    nameKo,
    metar: metar
      ? projectMetar({ icao, metar, sourceCategory, includeRaw, issues })
      : null,
    taf: taf
      ? projectTaf({ icao, taf, window, includeRaw, issues })
      : null,
    warnings,
  }
}
