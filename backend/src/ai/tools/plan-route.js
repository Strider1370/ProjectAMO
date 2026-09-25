import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { RouteSettingsInputSchema, resolveRouteSettings } from '../route-settings.js'
import { BriefingOutputSchema, briefingFailure } from '../briefing-contracts.js'
import { normalizeRouteContext } from '../route-context.js'
import { createProcedureCatalog } from '../procedure-catalog.js'
import { planRoute } from '../../../../shared/route-planning/planRoute.js'

export const PlanRouteInputSchema = RouteSettingsInputSchema.safeExtend({
  tasKt: z.number().finite().min(30).max(1000).optional(),
  routeType: z.enum(['ALL', 'ATS', 'RNAV']).optional(),
  displayTimezone: z.enum(['Asia/Seoul', 'UTC']).default('Asia/Seoul'),
})

export const PLAN_ROUTE_DESCRIPTION = 'Calculate a NEW domestic IFR route using the existing server planner. No screen changes or saved-route writes. Pass exact user airport names and explicitly supplied/confirmed flightRule, cruiseAltitude (ft/FL), dated departureLocal in displayTimezone or departureUtc, and TAS in tasKt (knots). Never invent missing inputs. Missing fields return input_required: ask for all together. Optional arrival time overrides the server distance/TAS ETA estimate. routeType defaults to ALL and is disclosed; no flight-condition defaults. Keep unsupported waypoints/procedures/constraints in unsupportedConditions, do not drop them. A planned result returns contextRef: call get_route_briefing with it for weather. input_required/blocked (and pendingRoute) is not a route. When planned, prefer it over the screen route; briefly state ETA basis, procedure/runway assumptions and gaps. A draft, not a clearance or recommendation; not applied or saved.'

const EXPECTED_FAILURES = new Set([
  'NAVDATA_UNAVAILABLE', 'INVALID_NAVDATA_FILE', 'NAVDATA_CHANGED_DURING_CAPTURE', 'NAVDATA_PUBLICATION_REQUIRED', 'NAVDATA_BUILD_MISMATCH',
  'ROUTE_PLANNING_UNSUPPORTED', 'PROCEDURE_DATA_UNAVAILABLE', 'ROUTE_NOT_FOUND', 'IAP_UNAVAILABLE', 'ROUTE_INPUTS_UNAVAILABLE',
  'INVALID_FLIGHT_WINDOW', 'RESULT_TOO_LARGE',
])
const REMEDIES = {
  NAVDATA_UNAVAILABLE: '서버 항공로 자료를 읽지 못했습니다. 자료 설치·읽기 상태를 확인한 뒤 다시 요청하세요.',
  NAVDATA_BUILD_MISMATCH: '서버 원본과 화면 빌드의 항공로 자료가 다릅니다. 같은 자료로 빌드·서버를 갱신해야 합니다.',
  PROCEDURE_DATA_UNAVAILABLE: '해당 공항의 SID·STAR·접근절차 자료가 부족합니다. 기존 편집기에서 가용 절차를 확인하세요.',
  ROUTE_NOT_FOUND: '현재 자료·입력으로 연결 가능한 경로를 찾지 못했습니다. 기존 편집기에서 경로와 절차를 확인하세요.',
  ROUTE_PLANNING_UNSUPPORTED: '자동 계산은 지원 국내 공항 사이의 IFR에 한정됩니다. 미지원 조건은 기존 편집기에서 직접 입력하세요.',
}

// The full result remains owner-bound in the reference store. Only compact
// input/assumption/provenance facts go to the model; geometry/editor never do.
export async function planRouteTool(input, context) {
  if (context.fixture) return briefingFailure('LIVE_CONTEXT_UNAVAILABLE_IN_FIXTURE')
  const parsed = PlanRouteInputSchema.safeParse(input)
  if (!parsed.success) return briefingFailure('INVALID_TOOL_INPUT')
  const args = parsed.data
  const { fields, missingFields: settingsMissing, issues } = resolveRouteSettings(args, { timezone: args.displayTimezone })
  const missingFields = settingsMissing.filter((field) => field !== 'eta')
  if (args.tasKt === undefined) missingFields.push('tasKt')
  const reference = { effectiveNow: new Date(context.realNow()).toISOString(), clockMode: 'live', displayTimezone: args.displayTimezone }
  const envelope = { schemaVersion: '1', reference, sources: [], coverage: [], issues,
    truncation: { omittedCount: 0, nextCursor: null }, error: null }
  if (issues.length || missingFields.length) {
    return BriefingOutputSchema.parse({ ...envelope, status: 'partial', data: {
      planningState: issues.length ? 'blocked' : 'input_required', suppliedFields: fields, missingFields,
      defaultsApplied: false, weatherAssessed: false,
      note: '경로를 계산하지 않았습니다. 필요한 항목을 한 번에 확인하세요. 모호한 공항과 미지원 조건은 임의로 대체하거나 제외하지 마세요.',
    } })
  }
  try {
    const provider = await context.getPlanningProvider()
    const wind = context.readPlanningWind()
    const windAirports = [fields.departureAirport, fields.arrivalAirport]
    // Only a valid saved numeric heading enters the existing selection rule.
    // Missing/invalid headings preserve its disclosed first-listed fallback.
    const metarData = { airports: Object.fromEntries(windAirports.map((icao) => {
      const direction = wind.snapshot?.airports?.[icao]?.observation?.wind?.direction
      return [icao, { observation: { wind: { direction: Number.isFinite(direction) && direction >= 0 && direction <= 360 ? direction : null } } }]
    })) }
    wind.source.observations = windAirports.map((icao) => ({ icao,
      observedAt: wind.snapshot?.airports?.[icao]?.header?.observation_time ?? null,
      direction: metarData.airports[icao].observation.wind.direction }))
    const planned = await planRoute({
      routeForm: { flightRule: fields.flightRule, departureAirport: fields.departureAirport, arrivalAirport: fields.arrivalAirport,
        entryFix: '', exitFix: '', routeType: args.routeType ?? 'ALL' },
      metarData, etd: fields.etd, eta: fields.eta ?? null, tasKt: args.tasKt, cruiseAltitudeFt: fields.cruiseAltitudeFt,
    }, provider)
    const { routeGeometry, routeModel, routeMarkers, procedureContext, plannedCruiseAltitudeFt } = planned.profileRequest
    const navdata = provider.readJson('enroute.json')
    const revision = `planned:${randomUUID()}`
    const normalized = normalizeRouteContext({ schemaVersion: 1, scope: 'personal', revision, request: {
      flightRule: fields.flightRule, departureAirport: fields.departureAirport, arrivalAirport: fields.arrivalAirport,
      routeGeometry, routeModel, routeMarkers, procedureContext, plannedCruiseAltitudeFt, etd: planned.etd, eta: planned.eta,
    } }, { navdata,
      resolveProcedure: createProcedureCatalog(null, { readJson: (name) => provider.readJson(`procedures/${name}`) }) })
    // A generated route's source catalog must be verifiable on its own snapshot.
    if (normalized.issues.length) return briefingFailure('ROUTE_SOURCE_VALIDATION_FAILED', reference)
    // Preserve the exact used records, including restrictions, not just AIRAC
    // label/geometry. These stay in the owner-bound bundle, never model context.
    const sourceById = new Map(navdata.segments.map((segment) => [segment.id, segment]))
    const sourceSegments = [...new Set(normalized.request.routeModel.enRouteSegments
      .filter((segment) => segment.kind === 'airway').map((segment) => segment.id))]
      .map((id) => sourceById.get(id))
    if (sourceSegments.some((segment) => !segment)) return briefingFailure('ROUTE_SOURCE_VALIDATION_FAILED', reference)
    const flight = { ...fields, etd: normalized.request.etd, eta: normalized.request.eta, tasKt: args.tasKt, routeType: args.routeType ?? 'ALL' }
    const assumptions = { ...planned.assumptions, routeTypeDefaulted: args.routeType === undefined,
      windBasis: 'saved-METAR-not-flight-time-forecast', weatherAssessed: false }
    const plan = { schemaVersion: 1, origin: 'server-planner', flight, assumptions,
      publicationId: planned.publicationId, snapshotId: planned.snapshotId,
      windSource: wind.source, editor: planned.editor, routeResult: planned.routeResult, selectedIap: planned.selectedIap, sourceSegments }
    const stored = context.references.put(context.owner, 'context', { ...normalized, plan })
    Object.assign(reference, { contextRef: stored.id, contextRevision: revision, expiresAt: stored.expiresAt,
      inputHash: stored.contentHash, publicationId: planned.publicationId, navdataSnapshotId: planned.snapshotId })
    return BriefingOutputSchema.parse({ ...envelope, status: 'ok', data: {
      planningState: 'planned', flight, routeText: planned.editor.rawText,
      distanceNm: planned.routeResult.totalDistanceNm, geometryDistanceNm: normalized.request.routeModel.routeAxis.totalDistanceNm,
      procedures: normalized.procedureSources, assumptions, weatherAssessed: false,
      next: { tool: 'get_route_briefing', arguments: { context_ref: stored.id } },
      note: '계산된 경로 초안입니다. ETA는 지정값 또는 거리/TAS 추정값이며 바람 보정 운항시간이 아닙니다. 절차·활주로는 기존 자동 생성 규칙으로 선택했으며 운항 허가나 기상 안전 판정이 아닙니다. 화면 경로는 변경하지 않았습니다.',
    }, sources: [{ kind: 'navdata', status: 'available', publicationId: planned.publicationId, snapshotId: planned.snapshotId }, wind.source] })
  } catch (error) {
    const code = EXPECTED_FAILURES.has(error.code) ? error.code : 'ROUTE_PLANNING_FAILED'
    const failure = briefingFailure(code, reference)
    failure.error.message = REMEDIES[code] ?? '경로 계산을 완료하지 못했습니다. 입력과 항공로·절차 자료 상태를 확인하세요. 다른 조건으로 자동 대체하지 않았습니다.'
    return failure
  }
}
