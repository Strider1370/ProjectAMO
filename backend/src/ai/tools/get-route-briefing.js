import { createHash } from 'node:crypto'
import { RouteBriefingInputSchema, BriefingOutputSchema, briefingFailure } from '../briefing-contracts.js'
import { getAirportWeather } from './get-airport-weather.js'
import { createDataContext } from '../data-context.js'
import { modelTimeCoverage } from '../model-time-coverage.js'
import { executeAltitudeComparison } from '../../briefing/altitude-service.js'

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const list = (items, cap = 10) => ({ items: (items ?? []).slice(0, cap), total: (items ?? []).length })

// Each leg is a pageable item. A whole enroute section includes procedure
// geometry and easily exceeds the single-item transport cap on real routes.
function enrouteDetails(enroute, plannedAltitudeWeather) {
  const { legs = [], procedures = [], encounters: _encounters, ...summary } = enroute
  return [{ kind: 'summary', ...summary, plannedAltitudeWeather },
    ...legs.map(leg => ({ kind: 'enroute_leg', ...leg })),
    ...procedures.flatMap(({ coordinates: _coordinates, legs: procedureLegs = [], ...procedure }) => [
      { kind: 'procedure', ...procedure, legCount: procedureLegs.length },
      ...procedureLegs.map(leg => ({ kind: 'procedure_leg', procedureId: procedure.id, procedureType: procedure.type, ...leg })),
    ])]
}

export async function getRouteBriefing(input, context) {
  const parsed = RouteBriefingInputSchema.safeParse(input)
  if (!parsed.success) return briefingFailure('INVALID_INPUT')
  try {
    const selection = parsed.data.fixture_id
      ? context.fixtures?.get(parsed.data.fixture_id)
      : context.references.get(context.owner, 'context', parsed.data.context_ref).value
    if (!selection) return briefingFailure('FIXTURE_NOT_FOUND')
    const { request } = selection
    const { briefing, data, comparisonInputs = null, sources: suppliedSources = [] } = await context.execute(selection)
    const effectiveNow = new Date(data.now).toISOString()
    const reference = {
      effectiveNow, generatedAt: new Date(context.realNow()).toISOString(),
      clockMode: selection.id ? 'fixture' : 'live', displayTimezone: context.displayTimezone,
      fixtureId: selection.id ?? null, contextRef: parsed.data.context_ref ?? null,
      contextRevision: selection.revision ?? null,
      procedureSources: selection.procedureSources ?? [],
      routeInputHash: hash(request), fixtureProvenance: selection.provenance ?? null,
      ...(selection.plan ? { routeOrigin: 'server-planner', publicationId: selection.plan.publicationId,
        navdataSnapshotId: selection.plan.snapshotId } : {}),
    }
    const airportResult = await getAirportWeather({
      airports: [request.departureAirport, request.arrivalAirport, request.alternateAirport].filter(Boolean),
      window: { start: request.etd, end: request.eta },
    }, createDataContext({
      readers: Object.fromEntries(['metar', 'taf', 'warning'].map((kind) => [kind, () => ({ snapshot: data[kind] ?? null })])),
      weatherNow: () => data.now, realNow: context.realNow,
      clockMode: reference.clockMode, displayTimezone: context.displayTimezone,
    }))
    const issues = [...(selection.issues ?? []), ...airportResult.issues]
    const modelCoverage = modelTimeCoverage(request, comparisonInputs?.model)
    // Give the model the same bounded row that the altitude table computes for
    // the requested flight profile. A hazards list is only advisory matches;
    // its emptiness must not hide available grid icing/turbulence observations.
    // Captured inputs prevent a second live read or a change of model run.
    const plannedAltitudeWeather = comparisonInputs ? executeAltitudeComparison(request, {
      captured: comparisonInputs, altitudesFt: [request.plannedCruiseAltitudeFt],
    }).rows.map(({ hazards = [], notams = [], ...row }) => ({ ...row,
      hazardCount: hazards.length, notamCount: notams.length }))[0] ?? null : null
    if (modelCoverage.status !== 'within_available_frames') issues.push({ code: 'MODEL_TIME_COVERAGE_UNVERIFIED', reason: modelCoverage.status })
    reference.modelTimeCoverage = modelCoverage
    for (const source of suppliedSources) {
      if (source.status !== 'available') issues.push({ code: 'DATA_UNAVAILABLE', source: source.kind, reason: source.status })
    }
    if (!briefing.sections.enroute.model) issues.push({ code: 'DATA_UNAVAILABLE', source: 'enrouteWeather' })
    if (!['matched', 'not_applicable'].includes(briefing.provenance.aip.status)) {
      issues.push({ code: 'AIP_INCOMPLETE', reason: briefing.provenance.aip.status })
    }
    // An empty matched list is not evidence of absent hazards: source snapshots may
    // be missing, old, or lack collection coverage metadata.
    issues.push({ code: 'SOURCE_COVERAGE_UNVERIFIED', reason: 'Snapshot presence does not prove complete hazard coverage' })
    const sources = [...suppliedSources, ...airportResult.sources]
    const coverage = airportResult.coverage
    const sections = {
      hazards: briefing.sections.adverse.hazards,
      airports: briefing.sections.current.airports,
      destination: [briefing.sections.destination],
      enroute: enrouteDetails(briefing.sections.enroute, plannedAltitudeWeather),
      notams: briefing.routeNotams,
      conflicts: briefing.routeConflicts,
      warnings: briefing.warnings,
      provenance: [briefing.provenance],
    }
    const stored = context.references.put(context.owner, 'briefing', {
      request, briefing, reference, sources, coverage, issues, sections, comparisonInputs,
      ...(selection.plan ? { plan: selection.plan } : {}),
    })
    Object.assign(reference, { briefingRef: stored.id, resultHash: stored.contentHash, expiresAt: stored.expiresAt })
    const hazards = list(sections.hazards)
    const warnings = list(sections.warnings)
    const conflicts = list(sections.conflicts, 5)
    const omittedCount = hazards.total - hazards.items.length + warnings.total - warnings.items.length
      + conflicts.total - conflicts.items.length + sections.notams.length + sections.enroute.length
    const result = {
      schemaVersion: '1', status: 'partial', reference,
      data: {
        flight: { ...briefing.meta, plannedCruiseAltitudeFt: request.plannedCruiseAltitudeFt,
          distanceNm: request.routeModel?.routeAxis?.totalDistanceNm ?? null },
        airports: airportResult.data.airports,
        hazards, warnings, conflicts,
        notamCount: sections.notams.length,
        enroute: { weatherAvailable: Boolean(briefing.sections.enroute.model),
          legCount: briefing.sections.enroute.legs.length, aipStatus: briefing.provenance.aip.status, modelTimeCoverage: modelCoverage,
          plannedAltitudeWeather,
          weatherScope: 'Whole route including terminals, using the requested altitude and applied profile when available. Preserve profileStatus and input validity. Grade 0 is the reported model grade, not a safety/absence finding. hazards are advisory matches, not grid icing/turbulence.' },
        detailSections: Object.keys(sections),
        assessment: 'Facts only; missing or unverified sources must not be described as clear or safe.',
        ...(selection.plan ? { routePlan: { flight: selection.plan.flight, assumptions: selection.plan.assumptions,
          publicationId: selection.plan.publicationId, windSource: selection.plan.windSource } } : {}),
      },
      sources, coverage, issues,
      truncation: { omittedCount, nextCursor: null }, error: null,
    }
    // Large pathological source text is never silently removed to meet a budget.
    if (Buffer.byteLength(JSON.stringify(result)) > 48 * 1024) return briefingFailure('RESULT_TOO_LARGE', reference)
    return BriefingOutputSchema.parse(result)
  } catch (error) {
    return briefingFailure(['REFERENCE_NOT_FOUND', 'REFERENCE_EXPIRED', 'RESULT_TOO_LARGE'].includes(error.code)
      ? error.code : 'BRIEFING_FAILED')
  }
}
