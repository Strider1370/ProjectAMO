import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareUiAction } from '../src/ai/ui-actions.js'
import { COPILOT_MET_LAYER_IDS, validateCopilotUiAction } from '../../shared/copilot-ui-actions.js'

test('UI action prepares exact resolved airport or allowlisted layer, never executes', () => {
  const airport = prepareUiAction({ action: 'open_airport', airport: '김포공항' })
  assert.deepEqual(airport.data.action, { schemaVersion: 1, type: 'open_airport', target: 'RKSS' })
  assert.equal(airport.data.executionState, 'awaiting_user_click')
  for (const layer of COPILOT_MET_LAYER_IDS) {
    const result = prepareUiAction({ action: 'enable_weather_layer', layer })
    assert.equal(result.data.executionState, 'awaiting_user_click')
    assert.equal(validateCopilotUiAction(result.data.action).target, layer)
  }
})

test('ambiguous airport stays blocked; unknown actions, mixed targets and executable fields fail', () => {
  const ambiguous = prepareUiAction({ action: 'open_airport', airport: '서울' })
  assert.equal(ambiguous.data.action, null)
  assert.equal(ambiguous.issues[0].code, 'AMBIGUOUS_AIRPORT')
  assert.equal(prepareUiAction({ action: 'open_airport', airport: 'XXXX' }).data.action, null)
  for (const input of [
    { action: 'open_airport' }, { action: 'open_airport', airport: '김포', layer: 'wind' },
    { action: 'enable_weather_layer', layer: 'unknown' }, { action: 'enable_weather_layer', layer: 'wind', airport: '김포' },
    { action: 'open_url', url: 'https://example.com' }, { action: 'open_airport', airport: '김포', script: 'alert(1)' },
  ]) assert.equal(prepareUiAction(input).error.code, 'INVALID_TOOL_INPUT')
  for (const input of [null, [], { schemaVersion: 1, type: 'open_airport', target: 'RKSS', url: '/' },
    { schemaVersion: 1, type: 'enable_weather_layer', target: '__proto__' }]) {
    assert.throws(() => validateCopilotUiAction(input), { code: 'INVALID_UI_ACTION' })
  }
})
