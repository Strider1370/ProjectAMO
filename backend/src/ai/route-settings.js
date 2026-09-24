import { z } from 'zod'
import { resolveAirport } from './tools/resolve-airport.js'
import { isAbsoluteIsoInstant } from './contracts.js'
import { localToUtc } from './model-context.js'
import { validateRouteSettings } from '../../../shared/route-settings.js'

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/)
const absoluteTime = z.string().refine(isAbsoluteIsoInstant)
  .describe('Absolute ISO instant with seconds AND timezone, e.g. 2026-09-24T00:03:00Z. Never omit Z/offset. Use the Local field instead when passing unchanged display-timezone clock values.')
export const RouteSettingsInputSchema = z.object({
  departure: z.string().trim().min(1).max(80).optional(), arrival: z.string().trim().min(1).max(80).optional(),
  flightRule: z.enum(['IFR', 'VFR']).optional(),
  cruiseAltitude: z.object({ value: z.number().int().positive().max(60000)
    .describe('Number in the stated unit: FL310 => 310 with unit FL; 31000 ft => 31000 with unit ft. Never convert the number but retain its old unit.'),
  unit: z.enum(['ft', 'FL']) }).strict().optional(),
  departureLocal: localTime.describe('Dated clock time in application displayTimezone, including UTC display. Example 2026-09-24T00:03. Copy clock value without timezone arithmetic; do not also set departureUtc.').optional(),
  arrivalLocal: localTime.describe('Dated arrival clock time in displayTimezone, e.g. 2026-09-24T01:30. Do not also set arrivalUtc.').optional(),
  departureUtc: absoluteTime.optional(), arrivalUtc: absoluteTime.optional(),
  unsupportedConditions: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
}).strict().refine((v) => !(v.departureLocal && v.departureUtc) && !(v.arrivalLocal && v.arrivalUtc))

// Called only after the relevant tool schema has accepted the input. Shared by
// settings-only prefill and actual planning; neither silently supplies defaults.
export function resolveRouteSettings(args, { timezone = 'Asia/Seoul' } = {}) {
  const fields = {}, missingFields = [], issues = []
  for (const [key, target] of [['departure', 'departureAirport'], ['arrival', 'arrivalAirport']]) {
    if (!args[key]) { missingFields.push(target); continue }
    const resolved = resolveAirport(args[key])
    if (resolved.ok) fields[target] = resolved.airport.icao
    else issues.push({ field: target, code: resolved.code, query: args[key], candidates: resolved.candidates })
  }
  try {
    if (args.flightRule) fields.flightRule = args.flightRule
    if (args.cruiseAltitude) fields.cruiseAltitudeFt = args.cruiseAltitude.value * (args.cruiseAltitude.unit === 'FL' ? 100 : 1)
    if (args.departureLocal) fields.etd = localToUtc(args.departureLocal, timezone)
    if (args.arrivalLocal) fields.eta = localToUtc(args.arrivalLocal, timezone)
    if (args.departureUtc) fields.etd = new Date(args.departureUtc).toISOString()
    if (args.arrivalUtc) fields.eta = new Date(args.arrivalUtc).toISOString()
    for (const key of ['flightRule', 'cruiseAltitudeFt', 'etd', 'eta']) if (fields[key] === undefined) missingFields.push(key)
    if (args.unsupportedConditions?.length) issues.push({ code: 'UNSUPPORTED_ROUTE_CONDITIONS', conditions: args.unsupportedConditions })
    if (fields.departureAirport && fields.arrivalAirport) validateRouteSettings(fields)
  } catch (cause) { issues.push({ code: cause.code ?? 'INVALID_ROUTE_SETTINGS' }) }
  return { fields, missingFields, issues }
}

export function prepareRouteSettings(input, { timezone = 'Asia/Seoul' } = {}) {
  const parsed = RouteSettingsInputSchema.safeParse(input)
  if (!parsed.success) return { status: 'error', error: { code: 'INVALID_TOOL_INPUT' } }
  const { fields, missingFields, issues } = resolveRouteSettings(parsed.data, { timezone })
  const canPrepare = Boolean(!issues.length && fields.departureAirport && fields.arrivalAirport)
  return { status: issues.length || missingFields.length ? 'partial' : 'ok',
    data: { preparationState: canPrepare ? 'ready_for_user_review' : 'blocked',
      action: canPrepare ? { type: 'route_settings', schemaVersion: 1, fields } : null, missingFields,
      note: canPrepare
        ? '입력안만 검증했습니다. 화면 입력·경로 생성·적용·기상 브리핑은 실행하지 않았습니다. 미지정 항목은 설정 화면에서 확인하세요.'
        : '입력안을 만들지 못했습니다. 적용 버튼이 없습니다. 지원하지 않는 조건을 제외하거나 대체한 입력안도 만들지 않았습니다. issues를 모두 설명하세요. 고도/시각 추가만으로 미지원 비행규칙·경유점 조건이 해결되지 않습니다. 도구를 쓰려고 비행규칙을 바꾸거나 경유점을 빼도록 권하지 말고 기존 경로 편집기의 직접 입력을 안내하세요.' },
    issues,
  }
}
