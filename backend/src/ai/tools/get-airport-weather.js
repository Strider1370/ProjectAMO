import crypto from 'node:crypto'
import {
  AirportWeatherInputSchema,
  AirportWeatherOutputSchema,
  isAbsoluteIsoInstant,
} from '../contracts.js'
import {
  normalizeReaderResult,
  validateSelectedSource,
} from '../source-validation.js'
import { buildAirportDigest } from '../digests/airport-weather.js'
import { resolveAirport } from './resolve-airport.js'

const KINDS = ['metar', 'taf', 'warning']
const FAILURE_PRIORITY = ['READ_FAILED', 'INVALID_SOURCE', 'DATA_UNAVAILABLE']

function toIso(value) {
  return new Date(value).toISOString()
}

function sourceIso(value) {
  return isAbsoluteIsoInstant(value) ? toIso(value) : null
}

function sortIssues(issues) {
  return issues.sort((left, right) => {
    const leftKey = `${left.kind ?? ''}\0${left.icao ?? ''}\0${left.path}`
    const rightKey = `${right.kind ?? ''}\0${right.icao ?? ''}\0${right.path}`
    return leftKey.localeCompare(rightKey)
  })
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    )
  }
  return value
}

function canonicalHash(snapshot) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(snapshot)), 'utf8')
    .digest('hex')
}

function buildSource({
  kind,
  icao,
  report,
  snapshot,
  meta,
  availability,
}) {
  const header = report?.header ?? {}
  const source = header.source ?? {}
  const hasSnapshot = snapshot !== null && snapshot !== undefined
  const hasReaderHash = hasSnapshot && meta.contentHash !== null

  return {
    id: `${kind}:${icao}`,
    icao,
    kind,
    provider: kind === 'warning'
      ? (snapshot?.type === 'AIRPORT_WARNINGS' ? 'KMA' : null)
      : (typeof source.identifier === 'string' ? source.identifier : null),
    snapshotId: meta.snapshotId,
    publicationId: meta.publicationId,
    runId: meta.runId,
    contentHash: hasSnapshot
      ? (hasReaderHash ? meta.contentHash : canonicalHash(snapshot))
      : null,
    hashBasis: hasSnapshot
      ? (hasReaderHash ? 'reader' : 'canonical-snapshot')
      : null,
    observedAt: kind === 'metar' ? sourceIso(header.observation_time) : null,
    issuedAt: kind === 'metar'
      ? sourceIso(header.issue_time)
      : (kind === 'taf' ? sourceIso(header.issued) : null),
    fetchedAt: sourceIso(source.fetch_time) ?? sourceIso(snapshot?.fetched_at),
    validStart: kind === 'taf' ? sourceIso(header.valid_start) : null,
    validEnd: kind === 'taf' ? sourceIso(header.valid_end) : null,
    availability,
    collectionStatus: meta.collectionStatus,
    collectionReason: meta.collectionReason,
    retainedLastGood: report?._stale === true,
    freshness: {
      status: 'unknown',
      reason: 'NO_FRESHNESS_POLICY',
    },
  }
}

function unknownCoverage(icao, window) {
  const requested = { start: window.start, end: window.end }
  return {
    icao,
    kind: 'taf',
    requested,
    validity: null,
    intersection: null,
    state: 'unknown',
    uncovered: [requested],
  }
}

function buildCoverage(icao, taf, window, issues) {
  if (!taf) return unknownCoverage(icao, window)

  const requested = { start: window.start, end: window.end }
  const validity = {
    start: sourceIso(taf.header.valid_start),
    end: sourceIso(taf.header.valid_end),
  }
  const requestedStart = Date.parse(window.start)
  const requestedEnd = Date.parse(window.end)
  const start = Math.max(requestedStart, Date.parse(validity.start))
  const end = Math.min(requestedEnd, Date.parse(validity.end))

  if (start >= end) {
    issues.push({
      code: 'TAF_OUTSIDE_WINDOW',
      icao,
      kind: 'taf',
      path: 'header.validity',
      reason: 'NO_VALIDITY_INTERSECTION',
    })
    return {
      icao,
      kind: 'taf',
      requested,
      validity,
      intersection: null,
      state: 'none',
      uncovered: [requested],
    }
  }

  const intersection = {
    start: toIso(start),
    end: toIso(end),
  }
  const uncovered = []
  if (requestedStart < start) {
    uncovered.push({ start: window.start, end: intersection.start })
  }
  if (end < requestedEnd) {
    uncovered.push({ start: intersection.end, end: window.end })
  }

  if (uncovered.length > 0) {
    issues.push({
      code: 'TAF_PARTIAL_COVERAGE',
      icao,
      kind: 'taf',
      path: 'header.validity',
      reason: 'PARTIAL_VALIDITY_INTERSECTION',
    })
  }

  return {
    icao,
    kind: 'taf',
    requested,
    validity,
    intersection,
    state: uncovered.length > 0 ? 'partial' : 'full',
    uncovered,
  }
}

function projectWarningItem(item, icao, index, relation) {
  return {
    id: `warning:${icao}:${index}`,
    type: typeof item.wrng_type === 'string' ? item.wrng_type : null,
    key: typeof item.wrng_type_key === 'string' ? item.wrng_type_key : null,
    name: typeof item.wrng_type_name === 'string' ? item.wrng_type_name : null,
    issuedAt: sourceIso(item.issued),
    validStart: sourceIso(item.valid_start),
    validEnd: sourceIso(item.valid_end),
    relation,
  }
}

function buildWarningDigest({
  icao,
  report,
  meta,
  window,
  issues,
  availability,
}) {
  const sourceId = `warning:${icao}`
  if (availability === 'failed') {
    return { sourceId, status: 'failed', items: [], unassessedCount: 0 }
  }
  if (availability !== 'available') {
    return { sourceId, status: 'unavailable', items: [], unassessedCount: 0 }
  }

  const warningItems = report?.warnings ?? []
  const items = []
  let unassessedCount = 0
  const requestedStart = Date.parse(window.start)
  const requestedEnd = Date.parse(window.end)

  for (const [index, item] of warningItems.entries()) {
    const validStart = item.valid_start == null ? null : Date.parse(item.valid_start)
    const validEnd = item.valid_end == null ? null : Date.parse(item.valid_end)
    const validityKnown = Number.isFinite(validStart)
      && Number.isFinite(validEnd)
      && validStart < validEnd

    if (!validityKnown) {
      unassessedCount += 1
      items.push(projectWarningItem(item, icao, index, 'unknown'))
      issues.push({
        code: 'UNKNOWN_WARNING_VALIDITY',
        icao,
        kind: 'warning',
        path: `airports.${icao}.warnings.${index}`,
        reason: Number.isFinite(validStart) && Number.isFinite(validEnd)
          ? 'INVALID_VALIDITY_RANGE'
          : 'MISSING_VALIDITY',
      })
      continue
    }

    if (validStart < requestedEnd && validEnd > requestedStart) {
      items.push(projectWarningItem(item, icao, index, 'overlap'))
    }
  }

  let status = 'unknown'
  if (items.some((item) => item.relation === 'overlap')) {
    status = 'present'
  } else if (unassessedCount === 0 && ['complete', 'empty'].includes(meta.collectionStatus)) {
    status = 'none'
  }

  return {
    sourceId,
    status,
    items,
    unassessedCount,
  }
}

async function readSource(kind, reader) {
  try {
    const value = await reader()
    const normalized = normalizeReaderResult(value)
    return {
      kind,
      failed: false,
      snapshot: normalized.snapshot,
      meta: normalized.meta,
      invalidPath: normalized.invalidPath,
    }
  } catch {
    return {
      kind,
      failed: true,
      snapshot: null,
      meta: normalizeReaderResult({ snapshot: null }).meta,
      invalidPath: null,
    }
  }
}

function classifySource(read, icao) {
  if (read.failed) {
    return { availability: 'failed', report: null, invalidPath: null }
  }
  if (read.invalidPath) {
    return { availability: 'invalid', report: null, invalidPath: read.invalidPath }
  }
  if (read.snapshot === null) {
    return { availability: 'missing', report: null, invalidPath: null }
  }

  const validation = validateSelectedSource(read.kind, read.snapshot, icao)
  if (!validation.ok) {
    return {
      availability: 'invalid',
      report: validation.report,
      invalidPath: validation.path,
    }
  }
  return {
    availability: 'available',
    report: validation.report,
    invalidPath: null,
  }
}

function addAvailabilityIssue({ issues, kind, icao, availability, invalidPath }) {
  if (availability === 'failed') {
    issues.push({
      code: 'READ_FAILED',
      icao,
      kind,
      path: 'reader',
      reason: 'READER_REJECTED',
    })
  } else if (availability === 'missing') {
    issues.push({
      code: 'DATA_UNAVAILABLE',
      icao,
      kind,
      path: 'snapshot',
      reason: 'NULL_SNAPSHOT',
    })
  } else if (availability === 'invalid') {
    issues.push({
      code: 'INVALID_SOURCE',
      icao,
      kind,
      path: invalidPath ?? 'snapshot',
      reason: invalidPath?.startsWith('meta') || invalidPath === 'reader.result'
        ? 'INVALID_READER_METADATA'
        : 'INVALID_SOURCE_SHAPE',
    })
  }
}

function addCollectionIssue({ issues, kind, icao, meta }) {
  if (meta.collectionStatus === 'failed') {
    issues.push({
      code: 'COLLECTION_FAILED',
      icao,
      kind,
      path: 'meta.collectionStatus',
      reason: meta.collectionReason ?? 'FAILED',
    })
  } else if (meta.collectionStatus === 'partial') {
    issues.push({
      code: 'COLLECTION_PARTIAL',
      icao,
      kind,
      path: 'meta.collectionStatus',
      reason: meta.collectionReason ?? 'PARTIAL',
    })
  }
}

function errorEnvelope(reference, code, message, candidates = []) {
  return {
    schemaVersion: '1',
    status: 'error',
    reference,
    data: { airports: [] },
    sources: [],
    coverage: [],
    issues: [],
    truncation: { omittedCount: 0, nextCursor: null },
    error: { code, message, candidates },
  }
}

function internalErrorEnvelope(reference) {
  return errorEnvelope(
    reference,
    'INTERNAL_ERROR',
    'Airport weather output could not be validated',
  )
}

function firstFailure(issues) {
  for (const code of FAILURE_PRIORITY) {
    const issue = issues.find((candidate) => candidate.code === code)
    if (issue) return issue
  }
  return null
}

export async function getAirportWeather(input, context) {
  const reference = {
    effectiveNow: toIso(context.weatherNow()),
    generatedAt: toIso(context.realNow()),
    clockMode: context.clockMode,
    displayTimezone: context.displayTimezone,
  }
  const parsed = AirportWeatherInputSchema.safeParse(input)
  if (!parsed.success) {
    return errorEnvelope(reference, 'INVALID_INPUT', 'Invalid airport weather input')
  }

  const inputValue = {
    ...parsed.data,
    window: {
      start: toIso(parsed.data.window.start),
      end: toIso(parsed.data.window.end),
    },
  }
  const selected = []
  for (const query of inputValue.airports) {
    const resolved = resolveAirport(query)
    if (!resolved.ok) {
      return errorEnvelope(
        reference,
        resolved.code,
        'Airport could not be resolved',
        resolved.candidates,
      )
    }
    if (!selected.some((airport) => airport.icao === resolved.airport.icao)) {
      selected.push(resolved.airport)
    }
  }

  try {
    const reads = Object.fromEntries(
      (await Promise.all(
        KINDS.map((kind) => readSource(kind, context.readers[kind])),
      )).map((read) => [read.kind, read]),
    )
    const issues = []
    const sources = []
    const coverage = []
    const airportDigests = []

    for (const airport of selected) {
      const classified = {}

      for (const kind of KINDS) {
        const read = reads[kind]
        const result = classifySource(read, airport.icao)
        classified[kind] = result

        addAvailabilityIssue({
          issues,
          kind,
          icao: airport.icao,
          availability: result.availability,
          invalidPath: result.invalidPath,
        })
        addCollectionIssue({
          issues,
          kind,
          icao: airport.icao,
          meta: read.meta,
        })

        const source = buildSource({
          kind,
          icao: airport.icao,
          report: result.report,
          snapshot: read.snapshot,
          meta: read.meta,
          availability: result.availability,
        })
        sources.push(source)
      }

      const usableMetar = classified.metar.availability === 'available'
        ? classified.metar.report
        : null
      const usableTaf = classified.taf.availability === 'available'
        ? classified.taf.report
        : null
      const tafCoverage = buildCoverage(
        airport.icao,
        usableTaf,
        inputValue.window,
        issues,
      )
      coverage.push(tafCoverage)

      const warnings = buildWarningDigest({
        icao: airport.icao,
        report: classified.warning.report,
        meta: reads.warning.meta,
        window: inputValue.window,
        issues,
        availability: classified.warning.availability,
      })

      airportDigests.push(buildAirportDigest({
        icao: airport.icao,
        nameKo: airport.nameKo,
        metar: usableMetar,
        taf: usableTaf,
        warnings,
        window: inputValue.window,
        sourceCategory: reads.metar.meta.sourceCategories[airport.icao] ?? null,
        includeRaw: inputValue.includeRaw,
        issues,
      }))
    }

    const anyAvailable = sources.some((source) => source.availability === 'available')
    const status = !anyAvailable ? 'error' : (issues.length > 0 ? 'partial' : 'ok')
    const failure = firstFailure(issues)
    const output = {
      schemaVersion: '1',
      status,
      reference,
      data: { airports: airportDigests },
      sources,
      coverage,
      issues: sortIssues(issues),
      truncation: { omittedCount: 0, nextCursor: null },
      error: status === 'error'
        ? {
            code: failure?.code ?? 'DATA_UNAVAILABLE',
            message: 'No requested airport data is available',
            candidates: [],
          }
        : null,
    }

    return AirportWeatherOutputSchema.safeParse(output).success
      ? output
      : internalErrorEnvelope(reference)
  } catch {
    return internalErrorEnvelope(reference)
  }
}

export default { getAirportWeather }
