import { createHash } from 'node:crypto'
import { AdvisoryInputSchema, AdvisoryOutputSchema, AdvisoryRecordSchema } from '../advisory-contracts.js'
import { isAbsoluteIsoInstant } from '../contracts.js'
import { briefingFailure } from '../briefing-contracts.js'

const iso = (value) => isAbsoluteIsoInstant(value) ? new Date(value).toISOString() : null
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
// Existing domestic advisory health policy regards >20 minutes as late.
const MAX_AGE_MS = 20 * 60_000
const fields = ['sequence_number', 'report_status', 'fir', 'fir_name', 'atsu', 'atsu_name', 'mwo', 'mwo_name',
  'phenomenon_code', 'phenomenon_label', 'time_indicator', 'intensity_change', 'raw_xml_id',
  'motion', 'surface_visibility_m', 'surface_visibility_causes', 'surface_visibility_cause_labels', 'surface_wind']

function project(item, kind, query, weatherNow) {
  const from = iso(item.valid_from)
  const to = iso(item.valid_to)
  const issued = iso(item.issue_time)
  const validityKnown = from && to && Date.parse(from) < Date.parse(to)
  const futureIssue = issued && Date.parse(issued) > weatherNow
  let timeStatus = 'unknown'
  if (validityKnown && !futureIssue) {
    const matches = query.at
      ? Date.parse(from) <= Date.parse(query.at) && Date.parse(query.at) < Date.parse(to)
      : Date.parse(from) < Date.parse(query.window.end) && Date.parse(to) > Date.parse(query.window.start)
    if (!matches) return null
    timeStatus = query.at ? 'active' : 'overlap'
  }
  const result = {
    id: `${kind}:${item.id}`, sourceId: item.id, kind, validFrom: from, validTo: to, issuedAt: issued,
    timeStatus, unknownReason: futureIssue ? 'FUTURE_ISSUE_TIME' : validityKnown ? null : 'INVALID_OR_MISSING_VALIDITY',
    // Bounding box is only a location summary, NOT route intersection evidence.
    bbox: item.bbox ?? null, geometryIncluded: false,
    altitude: {
      lower: { value: item.altitude?.lower_fl ?? null, unit: item.altitude?.lower_uom ?? null, reference: item.altitude?.lower_ref ?? null },
      upper: { value: item.altitude?.upper_fl ?? null, unit: item.altitude?.upper_uom ?? null, reference: item.altitude?.upper_ref ?? null },
    },
  }
  for (const field of fields) result[field] = item[field] ?? null
  return result
}

function page(saved, ref, cursor, limit) {
  const { value, contentHash, expiresAt } = saved
  if (cursor > value.items.length) return briefingFailure('INVALID_CURSOR')
  const items = []
  let bytes = 0
  for (const item of value.items.slice(cursor, cursor + limit)) {
    const size = Buffer.byteLength(JSON.stringify(item))
    if (bytes + size > 24 * 1024) break
    bytes += size
    items.push(item)
  }
  if (cursor < value.items.length && !items.length) return briefingFailure('DETAIL_ITEM_TOO_LARGE')
  const end = cursor + items.length
  return AdvisoryOutputSchema.parse({
    schemaVersion: '1', status: value.status,
    reference: { ...value.reference, resultRef: ref, resultHash: contentHash, expiresAt },
    data: { scope: 'KMA domestic advisory snapshots; no route or altitude intersection assessment',
      query: value.query, summary: value.summary, items, total: value.items.length,
      interpretation: 'Zero matches means zero matching records in these snapshots, not proof of no hazards. This is not a historical archive or future forecast of advisory issuance.' },
    sources: value.sources, coverage: [{ scope: 'domestic', completeness: 'unverified', historyAvailable: false,
      routeIntersectionAssessed: false, altitudeIntersectionAssessed: false }], issues: value.issues,
    truncation: { omittedCount: value.items.length - end, nextCursor: end < value.items.length ? end : null },
    error: null,
  })
}

export async function getWeatherAdvisories(input, context) {
  const parsed = AdvisoryInputSchema.safeParse(input)
  if (!parsed.success) return briefingFailure('INVALID_INPUT')
  try {
    if ('result_ref' in parsed.data) {
      const { result_ref, cursor, limit } = parsed.data
      return page(context.references.get(context.owner, 'advisory', result_ref), result_ref, cursor, limit)
    }
    const weatherNow = context.weatherNow()
    const reference = { effectiveNow: new Date(weatherNow).toISOString(), generatedAt: new Date(context.realNow()).toISOString(),
      clockMode: context.clockMode, displayTimezone: context.displayTimezone }
    const query = parsed.data.window
      ? { window: { start: iso(parsed.data.window.start), end: iso(parsed.data.window.end) } }
      : { at: parsed.data.at ? iso(parsed.data.at) : reference.effectiveNow }
    const items = [], sources = [], summary = [], issues = []
    for (const kind of [...new Set(parsed.data.types ?? ['sigmet', 'airmet'])].sort()) {
      let read
      let status = 'available'
      try { read = await context.readers[kind]() } catch { status = 'failed' }
      const snapshot = read?.snapshot
      if (status !== 'failed' && snapshot == null) status = 'missing'
      if (status === 'available' && (snapshot.type !== kind || !Array.isArray(snapshot.items) || snapshot.items.length > 5000)) status = 'invalid'
      const fetchedAt = iso(snapshot?.fetched_at)
      const ageMs = fetchedAt ? weatherNow - Date.parse(fetchedAt) : null
      const freshness = ageMs === null ? 'unknown' : ageMs < 0 ? 'future' : ageMs > MAX_AGE_MS ? 'stale' : 'recent'
      sources.push({ id: kind, kind, provider: 'KMA', status, fetchedAt, freshness, maxAgeMs: MAX_AGE_MS,
        contentHash: snapshot ? hash(snapshot) : null, hashBasis: 'snapshot-json', collectionCompleteness: 'unverified' })
      const stats = { kind, matchingCount: 0, unassessedCount: 0, invalidCount: 0, cancelledCount: 0,
        excludedByTimeCount: 0, state: 'unknown' }
      if (status !== 'available') {
        issues.push({ code: status === 'failed' ? 'READ_FAILED' : status === 'invalid' ? 'INVALID_SOURCE' : 'DATA_UNAVAILABLE', kind })
        summary.push(stats)
        continue
      }
      if (freshness !== 'recent') issues.push({ code: 'SOURCE_NOT_RECENT', kind, reason: freshness })
      const endpoint = query.at ?? query.window.start
      if (fetchedAt && Date.parse(endpoint) < Date.parse(fetchedAt)) issues.push({ code: 'NOT_A_HISTORICAL_ARCHIVE', kind })
      for (const raw of snapshot.items) {
        const record = AdvisoryRecordSchema.safeParse(raw)
        if (!record.success) { stats.invalidCount++; continue }
        if (record.data.cancelled || /CANCEL/i.test(record.data.report_status ?? '')) { stats.cancelledCount++; continue }
        const item = project(record.data, kind, query, weatherNow)
        if (!item) { stats.excludedByTimeCount++; continue }
        if (item.timeStatus === 'unknown') stats.unassessedCount++
        else stats.matchingCount++
        items.push(item)
      }
      if (stats.invalidCount) issues.push({ code: 'INVALID_RECORDS', kind, count: stats.invalidCount })
      if (stats.unassessedCount) issues.push({ code: 'UNASSESSED_VALIDITY', kind, count: stats.unassessedCount })
      stats.state = stats.matchingCount ? 'reports_found'
        : stats.invalidCount || stats.unassessedCount || freshness !== 'recent' ? 'unknown' : 'no_matching_reports'
      summary.push(stats)
    }
    issues.push({ code: 'SOURCE_COVERAGE_UNVERIFIED', reason: 'Stored collectors do not attest complete coverage or cancellation reconciliation' })
    if (!sources.some((s) => s.status === 'available')) {
      return { ...briefingFailure('DATA_UNAVAILABLE', reference), sources, issues }
    }
    items.sort((a, b) => a.kind.localeCompare(b.kind) || (a.validFrom ?? '').localeCompare(b.validFrom ?? '') || a.id.localeCompare(b.id))
    const value = { reference, query, items, sources, summary, issues, status: 'partial' }
    const stored = context.references.put(context.owner, 'advisory', value)
    return page(context.references.get(context.owner, 'advisory', stored.id), stored.id, 0, parsed.data.limit)
  } catch (error) {
    return briefingFailure(['REFERENCE_NOT_FOUND', 'REFERENCE_EXPIRED', 'RESULT_TOO_LARGE'].includes(error.code) ? error.code : 'ADVISORY_FAILED')
  }
}
