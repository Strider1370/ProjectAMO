import { createHash, randomUUID } from 'node:crypto'
import { createOwnedRouteReader, routeEntry, routeSnapshot } from '../me/route-reader.js'
import { createReferenceStore } from './reference-store.js'
import { SearchMyRoutesSchema, GetMySavedRouteSchema } from './saved-route-contracts.js'
import { buildCommonRouteModel } from '../../../shared/route-model.js'
import { isAbsoluteIsoInstant } from './contracts.js'
import { resolveAirport } from './tools/resolve-airport.js'

const fail = (code) => { throw Object.assign(new Error(code), { code }) }
const rowHash = (row) => createHash('sha256').update(JSON.stringify([row.id, row.name, row.payload, row.updated_at])).digest('hex')
const userId = (owner) => {
  if (!/^user:[1-9]\d*$/.test(owner)) fail('AUTH_REQUIRED')
  const value = Number(owner.slice(5))
  if (!Number.isSafeInteger(value)) fail('AUTH_REQUIRED')
  return value
}
const isTemplate = (row, snapshot) => !row.alert_enabled && !snapshot?.sourceBriefingId
const formOf = (entry) => entry.base?.routeForm ?? entry.routeForm ?? {}
const airportCode = (value) => typeof value === 'string' && /^[A-Z]{4}$/.test(value) ? value : null
const summary = (entry) => {
  const form = formOf(entry)
  return { id: entry.id, name: String(entry.name ?? '').slice(0, 200), savedAt: entry.savedAt ? new Date(entry.savedAt).toISOString() : null,
    kind: entry.kind === 'briefing' ? 'briefing' : 'route', departureAirport: airportCode(form.departureAirport),
    arrivalAirport: airportCode(form.arrivalAirport), flightRule: ['IFR', 'VFR'].includes(form.flightRule) ? form.flightRule : null,
    etd: isAbsoluteIsoInstant(entry.etd) ? entry.etd : null, eta: isAbsoluteIsoInstant(entry.eta) ? entry.eta : null,
    cruiseAltitudeFt: Number.isFinite(entry.cruiseAltitudeFt) ? entry.cruiseAltitudeFt : null,
    hasGeometry: Boolean(entry.routeGeometry?.coordinates?.length >= 2 || entry.enrouteGeometry?.coordinates?.length >= 2),
    historicalResultAvailable: false }
}

// Runs in the authenticated application process, never the anonymous MCP worker.
// Private geometry/payload is only returned to the owner UI, not to the model.
export function createSavedRouteTools({ database, executor, now = Date.now, references = createReferenceStore({ now }) }) {
  const reader = createOwnedRouteReader(database)
  function owned(id, owner) {
    const row = reader.get(userId(owner), id)
    if (!row) fail('SAVED_ROUTE_NOT_FOUND')
    const snapshot = routeSnapshot(row)
    if (!snapshot) fail('SAVED_ROUTE_CORRUPT')
    if (!isTemplate(row, snapshot)) fail('SCHEDULED_FLIGHT_NOT_SAVED_ROUTE')
    if (snapshot.scope === 'organization' || snapshot.briefingContext?.kind === 'organization') fail('ORGANIZATION_CONTEXT_UNSUPPORTED')
    return { row, entry: routeEntry(row) }
  }
  function envelope(data, status = 'ok', reference = {}) {
    return { schemaVersion: '1', status, reference: { effectiveNow: new Date(now()).toISOString(), ...reference }, data,
      issues: [], sources: [{ kind: 'personal_saved_inputs', status: 'available' }], coverage: [],
      truncation: { omittedCount: 0, nextCursor: null }, error: null }
  }
  function search(input, owner) {
    const parsed = SearchMyRoutesSchema.safeParse(input)
    if (!parsed.success) fail('INVALID_TOOL_INPUT')
    const { query, kind, offset, limit } = parsed.data
    const terms = query.split(/\s+/).filter(Boolean).map((term) => {
      const airport = resolveAirport(term)
      return { word: term.toLocaleLowerCase(), airport: airport.ok ? airport.airport.icao.toLocaleLowerCase() : null }
    })
    const rows = reader.list(userId(owner))
    let corruptCount = 0
    const matches = rows.flatMap((row) => {
      const snapshot = routeSnapshot(row)
      if (!snapshot) { corruptCount++; return [] }
      if (!isTemplate(row, snapshot) || snapshot.scope === 'organization' || snapshot.briefingContext?.kind === 'organization') return []
      const item = summary(routeEntry(row))
      if (kind && item.kind !== kind) return []
      const searchable = [item.name, item.departureAirport, item.arrivalAirport].join(' ').toLocaleLowerCase()
      return terms.every(({ word, airport }) => searchable.includes(word) || (airport && searchable.includes(airport))) ? [item] : []
    })
    return envelope({ routes: matches.slice(offset, offset + limit), total: matches.length,
      nextOffset: offset + limit < matches.length ? offset + limit : null, corruptCount,
      note: '본인 저장 입력 후보입니다. 동명 후보는 id·저장일·출도착·ETD로 선택하세요. 예정비행 감시 복제본·기관 경로는 제외합니다. 화면 변경·기상 조회는 하지 않았습니다.' }, corruptCount ? 'partial' : 'ok')
  }
  function getForScreen(ref, owner) {
    const saved = references.get(owner, 'saved_route', ref)
    const { row, entry } = owned(saved.value.routeId, owner)
    if (rowHash(row) !== saved.value.rowHash) fail('SAVED_ROUTE_CHANGED')
    return { status: 'ok', entry, routeHash: saved.value.rowHash, expiresAt: saved.expiresAt,
      reference: { savedRouteRef: ref }, historicalResultAvailable: false }
  }
  async function get(input, owner, signal) {
    const parsed = GetMySavedRouteSchema.safeParse(input)
    if (!parsed.success) fail('INVALID_TOOL_INPUT')
    const args = parsed.data
    const { row, entry } = owned(args.route_id, owner)
    const ref = references.put(owner, 'saved_route', { routeId: row.id, rowHash: rowHash(row) })
    const reference = { savedRouteRef: ref.id, expiresAt: ref.expiresAt }
    const savedRoute = summary(entry)
    if (args.mode !== 'current_briefing') return envelope({ savedRoute, mode: args.mode,
      historicalResult: { available: false, reason: 'SAVED_INPUTS_ONLY', note: '저장 당시 기상 결과는 이 저장 항목에 보관되어 있지 않습니다. 알람 비교용 snapshot을 당시 전체 브리핑으로 대신하지 않습니다.' },
      action: { type: 'saved_route_inputs', savedRouteRef: ref.id },
      note: '저장 입력을 확인했습니다. 화면에 불러오려면 사용자 확인이 필요합니다. 현재 자료로 다시 브리핑하는 것은 별도 요청입니다.' }, args.mode === 'historical_result' ? 'partial' : 'ok', reference)
    const flight = { etd: args.etd ?? entry.etd, eta: args.eta ?? (args.etd ? null : entry.eta),
      altitude: args.cruise_altitude_ft ?? entry.cruiseAltitudeFt }
    const missingFields = [!isAbsoluteIsoInstant(flight.etd) && 'etd', !isAbsoluteIsoInstant(flight.eta) && 'eta',
      !(Number.isInteger(flight.altitude) && flight.altitude >= 500 && flight.altitude <= 60000) && 'cruise_altitude_ft'].filter(Boolean)
    if (missingFields.length) return envelope({ savedRoute, mode: args.mode, missingFields,
      note: '현재 자료 브리핑에 필요한 비행 조건을 확인하세요. 저장 시각을 현재 출발시각으로 바꾸거나 ETA를 임의 계산하지 않았습니다.' }, 'partial', reference)
    const form = formOf(entry)
    const routeGeometry = entry.routeGeometry ?? entry.enrouteGeometry
    if (!routeGeometry?.coordinates?.length) fail('SAVED_GEOMETRY_UNAVAILABLE')
    const routeModel = entry.routeModel ?? buildCommonRouteModel({ routeGeometry })
    const registered = await executor.registerContext({ schemaVersion: 1, scope: 'personal', revision: `saved:${randomUUID()}`,
      request: { flightRule: form.flightRule, departureAirport: form.departureAirport, arrivalAirport: form.arrivalAirport,
        alternateAirport: entry.alternateAirport ?? null, routeGeometry, routeModel,
        routeMarkers: entry.routeMarkers ?? [], plannedCruiseAltitudeFt: flight.altitude, etd: flight.etd, eta: flight.eta,
        procedureContext: entry.profileRequest?.procedureContext ?? null,
        // A new flight time must not silently retain forecast overrides from an old flight.
        nwpTimeSelection: args.etd ? null : entry.nwpTimeSelection ?? null } }, owner, signal)
    if (registered.status === 'error') return envelope({ savedRoute, mode: args.mode,
      validationError: registered.error?.code ?? 'CONTEXT_REGISTRATION_FAILED',
      note: '저장 경로를 현재 자료와 대조하는 데 실패했습니다. 편집기에서 확인하세요.' }, 'partial', reference)
    if (signal?.aborted) fail('CANCELLED')
    const briefing = await executor.call('get_route_briefing', { context_ref: registered.contextRef }, owner, signal)
    if (briefing.status === 'error') return briefing
    // Frozen provenance belongs to the result, not the mutable source row. It
    // remains readable if the original route is edited/deleted after briefing.
    const origin = references.put(owner, 'saved_origin', { briefingRef: briefing.reference.briefingRef,
      resultHash: briefing.reference.resultHash, savedRoute, mode: 'current_briefing', historicalResultAvailable: false })
    return { ...briefing, data: { ...briefing.data, savedRoute, mode: args.mode,
      note: '저장 입력의 비행 조건에 대해 지금 수집된 자료로 새로 계산했습니다. 저장 당시 기상 결과가 아니며 화면은 변경하지 않았습니다.' },
      reference: { ...briefing.reference, ...reference, savedRouteOriginRef: origin.id } }
  }
  return {
    getForScreen,
    attachResultOrigin(result, ref, owner) {
      const origin = references.get(owner, 'saved_origin', ref)
      if (result.status !== 'ok' || origin.value.briefingRef !== result.reference?.briefingRef
        || origin.value.resultHash !== result.resultHash) fail('RESULT_IDENTITY_MISMATCH')
      return { ...result, savedRouteOrigin: origin.value, reference: { ...result.reference, savedRouteOriginRef: ref },
        expiresAt: new Date(Math.min(Date.parse(result.expiresAt), Date.parse(origin.expiresAt))).toISOString() }
    },
    async call(name, input, owner, signal) {
      try {
        if (signal?.aborted) fail('CANCELLED')
        if (name === 'search_my_routes') return search(input, owner)
        if (name === 'get_my_saved_route') return await get(input, owner, signal)
        fail('UNKNOWN_TOOL')
      } catch (error) {
        const allowed = ['AUTH_REQUIRED', 'INVALID_TOOL_INPUT', 'SAVED_ROUTE_NOT_FOUND', 'SAVED_ROUTE_CORRUPT', 'SCHEDULED_FLIGHT_NOT_SAVED_ROUTE',
          'ORGANIZATION_CONTEXT_UNSUPPORTED', 'SAVED_GEOMETRY_UNAVAILABLE', 'CANCELLED', 'RESULT_TOO_LARGE']
        return { status: 'error', error: { code: allowed.includes(error.code) ? error.code : 'SAVED_ROUTE_READ_FAILED' } }
      }
    },
  }
}
