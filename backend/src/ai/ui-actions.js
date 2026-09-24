import { z } from 'zod'
import { COPILOT_MET_LAYER_IDS } from '../../../shared/copilot-ui-actions.js'
import { resolveAirport } from './tools/resolve-airport.js'

export const UiActionInputSchema = z.object({
  action: z.enum(['open_airport', 'enable_weather_layer']),
  airport: z.string().trim().min(1).max(80).optional(),
  layer: z.enum(COPILOT_MET_LAYER_IDS).optional(),
}).strict().refine((v) => v.action === 'open_airport' ? Boolean(v.airport) && !v.layer : Boolean(v.layer) && !v.airport)

export function prepareUiAction(input) {
  const parsed = UiActionInputSchema.safeParse(input)
  if (!parsed.success) return { status: 'error', error: { code: 'INVALID_TOOL_INPUT' } }
  const args = parsed.data
  let target = args.layer
  if (args.action === 'open_airport') {
    const resolved = resolveAirport(args.airport)
    if (!resolved.ok) return { status: 'partial', data: { action: null, executionState: 'blocked' },
      issues: [{ code: resolved.code, candidates: resolved.candidates }] }
    target = resolved.airport.icao
  }
  return { status: 'ok', data: { action: { schemaVersion: 1, type: args.action, target },
    executionState: 'awaiting_user_click',
    note: '화면 변경은 아직 실행하지 않았습니다. 사용자가 카드 버튼을 누르면 앱이 현재 화면의 지원 여부와 적용 상태를 확인합니다. 레이어 선택은 자료의 존재·최신성·위험 없음 확인이 아닙니다.' }, issues: [] }
}
