import { AltitudeComparisonInputSchema, BriefingOutputSchema, briefingFailure } from '../briefing-contracts.js'
import { executeAltitudeComparison } from '../../briefing/altitude-service.js'
import { readStoredBriefing } from '../stored-briefing.js'

export function compareRouteAltitudes(input, context) {
  const parsed = AltitudeComparisonInputSchema.safeParse(input)
  if (!parsed.success) return briefingFailure('INVALID_INPUT')
  try {
    const parent = readStoredBriefing(context.references, context.owner, parsed.data.briefing_ref)
    const saved = parent.value
    if (!saved.comparisonInputs) return briefingFailure('COMPARISON_INPUTS_EXPIRED_REQUERY', { briefingRef: parsed.data.briefing_ref })
    const comparison = executeAltitudeComparison(saved.request, {
      captured: saved.comparisonInputs, altitudesFt: parsed.data.altitudes_ft,
    })
    const issues = [...saved.issues]
    if (!comparison.crossSection) issues.push({ code: 'MODEL_WEATHER_UNAVAILABLE' })
    if (comparison.rows.some((row) => row.profileStatus === 'cruise_fallback')) issues.push({ code: 'PROFILE_UNAVAILABLE_CRUISE_FALLBACK' })
    const reference = { ...saved.reference, parentBriefingRef: parsed.data.briefing_ref, parentResultHash: parent.contentHash,
      comparisonGeneratedAt: new Date(context.realNow()).toISOString(), crossSectionRun: comparison.crossSectionRun }
    const { crossSection: _section, ...compactComparison } = comparison
    const stored = context.references.put(context.owner, 'briefing', {
      baseBriefingRef: parent.baseBriefingRef, baseResultHash: parent.baseResultHash,
      request: saved.request, reference, issues, sections: { altitudes: comparison.rows },
      altitudeComparison: compactComparison })
    const expiresAt = new Date(Math.min(Date.parse(parent.expiresAt), Date.parse(stored.expiresAt))).toISOString()
    const data = {
      constraints: comparison.constraints,
      modelTimeCoverage: saved.reference.modelTimeCoverage ?? null,
      scope: { weather: 'whole_route_including_terminals', constraints: 'published_enroute_segments' },
      rows: comparison.rows.map(({ hazards = [], notams = [], ...row }) => ({ ...row,
        hazards: { items: hazards.slice(0, 10), total: hazards.length },
        notams: { items: notams.slice(0, 10), total: notams.length } })),
      detailSections: ['altitudes'],
      assessment: 'Factual comparison, not an altitude recommendation or safety ranking. valid means matching the available AIP series, not flight safety. input_only is unverified; input_invalid is not a valid candidate.',
    }
    const omittedCount = comparison.rows.reduce((total, row) => total + Math.max(0, (row.hazards?.length ?? 0) - 10)
      + Math.max(0, (row.notams?.length ?? 0) - 10), 0)
    const result = { schemaVersion: '1', status: 'partial',
      reference: { ...reference, briefingRef: stored.id, resultHash: stored.contentHash, expiresAt },
      data, sources: saved.sources, coverage: saved.coverage, issues,
      truncation: { omittedCount, nextCursor: null }, error: null }
    if (Buffer.byteLength(JSON.stringify(result)) > 48 * 1024) return briefingFailure('RESULT_TOO_LARGE')
    return BriefingOutputSchema.parse(result)
  } catch (error) {
    return briefingFailure(['REFERENCE_NOT_FOUND', 'REFERENCE_EXPIRED', 'RESULT_TOO_LARGE'].includes(error.code)
      ? error.code : 'ALTITUDE_COMPARISON_FAILED')
  }
}
