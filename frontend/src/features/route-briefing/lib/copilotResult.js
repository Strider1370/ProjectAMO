import { buildSavedRouteResult } from './savedRouteBriefing.js'
import { buildRoutePreviewModel } from './routeBriefingModel.js'

export const validBriefingRef = (value) => /^briefing_[0-9a-f-]{36}$/.test(value ?? '')
const validSavedOriginRef = (value) => /^saved_origin_[0-9a-f-]{36}$/.test(value ?? '')
const fail = (code) => { throw Object.assign(new Error(code), { code }) }

export function copilotResultContext(bundle) {
  return bundle ? structuredClone({ schemaVersion: 1, scope: 'personal', request: bundle.request }) : null
}

// This adapter never recalculates weather, ETA, procedures or geometry.
export function adaptCopilotResult(value, expected, now = Date.now()) {
  if (value?.status !== 'ok') fail(value?.error?.code ?? 'RESULT_UNAVAILABLE')
  if (!validBriefingRef(expected?.briefingRef) || value.reference?.briefingRef !== expected.briefingRef
    || !expected.resultHash || value.resultHash !== expected.resultHash) fail('RESULT_IDENTITY_MISMATCH')
  if (!Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now) fail('REFERENCE_EXPIRED')
  if (expected.savedRouteOriginRef) {
    const origin = value.savedRouteOrigin
    if (!validSavedOriginRef(expected.savedRouteOriginRef) || value.reference.savedRouteOriginRef !== expected.savedRouteOriginRef
      || origin?.briefingRef !== expected.briefingRef || origin?.resultHash !== expected.resultHash
      || origin.mode !== 'current_briefing' || !Number.isSafeInteger(origin.savedRoute?.id) || origin.savedRoute.id <= 0) fail('SAVED_ORIGIN_MISMATCH')
  }
  const request = value.request
  if (!request?.routeGeometry?.coordinates?.length || !request.routeModel || !value.briefing?.sections
    || request.departureAirport !== value.briefing.meta?.departureAirport
    || request.arrivalAirport !== value.briefing.meta?.arrivalAirport) fail('INVALID_RESULT')
  const inputs = { ...request, ok: true, cruiseAltitudeFt: request.plannedCruiseAltitudeFt,
    distanceNm: request.routeModel.routeAxis?.totalDistanceNm ?? null }
  const routeResult = buildSavedRouteResult(inputs)
  return { ...value, routeResult, routePreviewModel: buildRoutePreviewModel({ routeForm: request, routeResult,
    workflowStep: 'briefing', hiddenRouteDesignIds: new Set() }) }
}

export async function fetchCopilotResult(reference, { signal } = {}) {
  if (!validBriefingRef(reference?.briefingRef)) fail('REFERENCE_NOT_FOUND')
  if (reference.savedRouteOriginRef && !validSavedOriginRef(reference.savedRouteOriginRef)) fail('REFERENCE_NOT_FOUND')
  const originQuery = reference.savedRouteOriginRef ? `?savedOrigin=${encodeURIComponent(reference.savedRouteOriginRef)}` : ''
  const response = await fetch(`/api/ai/results/${encodeURIComponent(reference.briefingRef)}${originQuery}`, { signal, credentials: 'same-origin' })
  const value = await response.json()
  if (!response.ok) fail(value.error?.code ?? value.error ?? 'RESULT_UNAVAILABLE')
  return adaptCopilotResult(value, reference)
}
