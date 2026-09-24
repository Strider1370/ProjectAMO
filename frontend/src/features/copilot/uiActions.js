import { validateCopilotUiAction } from '../../../../shared/copilot-ui-actions.js'
import { MET_ACTIONS } from '../map/layerActions.js'

const fail = (code) => { throw Object.assign(new Error(code), { code }) }
export function uiActionLabel(action) {
  validateCopilotUiAction(action)
  return action.type === 'open_airport' ? `${action.target} 공항 패널 열기`
    : `${MET_ACTIONS.find((entry) => entry.id === action.target)?.label ?? action.target} 켜기`
}

// Navigation is performed by App/MapView's existing setters, never by a model.
// Read back committed React state before issuing a receipt. No weather success
// is inferred from a visibility checkbox, empty layer or stale source.
export function createUiActionExecutor({ getState, apply,
  wait = () => new Promise((resolve) => setTimeout(resolve, 25)), attempts = 120 }) {
  let busy = false
  return async (input) => {
    const action = validateCopilotUiAction(input)
    if (busy) fail('UI_ACTION_BUSY')
    const initial = getState()
    const ownerId = initial.ownerId
    if (!ownerId) fail('AUTH_REQUIRED')
    if (initial.editing) fail('MAP_EDIT_ACTIVE')
    if (initial.organization) fail('ORGANIZATION_CONTEXT_UNSUPPORTED')
    if (action.type === 'open_airport') {
      if (!initial.airports?.some((airport) => airport.icao === action.target)) fail('AIRPORT_NOT_AVAILABLE')
    } else if (!initial.ready || !initial.supportedLayers?.includes(action.target)) fail('LAYER_NOT_AVAILABLE')
    busy = true
    try {
      apply(action)
      for (let i = 0; i < attempts; i++) {
        const current = getState()
        if (current.ownerId !== ownerId) fail('AUTH_CHANGED')
        if (current.editing || current.organization) fail('UI_CONTEXT_CHANGED')
        if (action.type === 'enable_weather_layer' && !current.supportedLayers?.includes(action.target)) fail('LAYER_NOT_AVAILABLE')
        const applied = action.type === 'open_airport' ? current.airport === action.target
          : current.ready && current.panel === 'met' && !current.airport && current.layers?.[action.target] === true
        if (applied) return { status: 'applied', action, label: uiActionLabel(action),
          message: action.type === 'open_airport' ? `${action.target} 공항 패널을 열었어요.`
            : `${MET_ACTIONS.find((entry) => entry.id === action.target)?.label ?? action.target} 레이어 선택을 켰어요. 자료의 존재·최신성은 확인한 것이 아니에요.` }
        await wait()
      }
      fail('UI_ACTION_NOT_CONFIRMED')
    } finally { busy = false }
  }
}
