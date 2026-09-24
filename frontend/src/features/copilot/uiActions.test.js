import test from 'node:test'
import assert from 'node:assert/strict'
import { createUiActionExecutor } from './uiActions.js'
import { COPILOT_MET_LAYER_IDS } from '../../../../shared/copilot-ui-actions.js'
import { MET_ACTIONS } from '../map/layerActions.js'

const airport = { schemaVersion: 1, type: 'open_airport', target: 'RKSS' }
const layer = { schemaVersion: 1, type: 'enable_weather_layer', target: 'airmet' }
const initial = () => ({ ownerId: 1, airports: [{ icao: 'RKSS' }], ready: true,
  supportedLayers: ['airmet'], layers: { airmet: false }, airport: null, panel: null })

test('every copilot weather action resolves through the existing layer registry', () => {
  assert.deepEqual([...COPILOT_MET_LAYER_IDS].sort(), MET_ACTIONS.filter((x) => x.id !== 'notam').map((x) => x.id).sort())
})

test('UI receipt waits for committed state; repeated enable never requests a toggle off', async () => {
  let state = initial(), waits = 0
  const applied = []
  const run = createUiActionExecutor({ getState: () => state, apply: (action) => applied.push(action),
    wait: async () => { waits++; state = { ...state, panel: 'met', layers: { airmet: true } } } })
  assert.equal((await run(layer)).status, 'applied')
  assert.equal(waits, 1)
  assert.equal((await run(layer)).status, 'applied')
  assert.equal(waits, 1)
  assert.deepEqual(applied, [layer, layer])
})

test('unavailable target, map edits, organization and signed-out state never apply', async () => {
  for (const [patch, action, code] of [
    [{ ownerId: null }, airport, 'AUTH_REQUIRED'], [{ editing: true }, airport, 'MAP_EDIT_ACTIVE'],
    [{ organization: true }, layer, 'ORGANIZATION_CONTEXT_UNSUPPORTED'],
    [{ airports: [] }, airport, 'AIRPORT_NOT_AVAILABLE'], [{ ready: false }, layer, 'LAYER_NOT_AVAILABLE'],
    [{ supportedLayers: [] }, layer, 'LAYER_NOT_AVAILABLE'],
  ]) {
    let writes = 0
    const run = createUiActionExecutor({ getState: () => ({ ...initial(), ...patch }), apply: () => writes++ })
    await assert.rejects(run(action), { code })
    assert.equal(writes, 0)
  }
})

test('missing acknowledgement, duplicate execution and authentication change are not success', async () => {
  const state = initial()
  let release
  const run = createUiActionExecutor({ getState: () => state, apply() {}, attempts: 1,
    wait: () => new Promise((resolve) => { release = resolve }) })
  const pending = run(airport)
  await assert.rejects(run(airport), { code: 'UI_ACTION_BUSY' })
  release()
  await assert.rejects(pending, { code: 'UI_ACTION_NOT_CONFIRMED' })
  const changed = createUiActionExecutor({ getState: () => state, apply: () => { state.ownerId = 2 } })
  await assert.rejects(changed(airport), { code: 'AUTH_CHANGED' })
})
