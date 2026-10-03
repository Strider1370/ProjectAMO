import test from 'node:test'
import assert from 'node:assert/strict'
import { createUiActionExecutor } from './uiActions.js'
import { COPILOT_MET_LAYER_IDS } from '../../../../shared/copilot-ui-actions.js'
import { MET_ACTIONS } from '../map/layerActions.js'

const airport = { schemaVersion: 1, type: 'open_airport', target: 'RKSS' }
const layer = { schemaVersion: 1, type: 'enable_weather_layer', target: 'airmet' }
const initial = () => ({ ownerId: 1, airports: [{ icao: 'RKSS' }], ready: true,
  supportedLayers: ['airmet'], layers: { airmet: false }, airport: null, panel: null })

// 지도에 새 기상 레이어가 생기면 기상이가 켤 수 있게 할지 정하도록 여기서 멈춘다.
// 기상이가 켜지 않는 레이어: notam(기상 레이어 아님), sigwxHigh(현재 예보가 아닌 과거 고정 샘플이라
// "지금 고층 SIGWX"를 물었을 때 켜 주면 옛 자료를 현재처럼 보여 주게 된다).
// kimTurbulence 역시 과거 자료의 미보정 원시 지수를 보여 주는 수동 시험 레이어다.
const NOT_FOR_COPILOT = ['notam', 'sigwxHigh', 'kimTurbulence']
test('every copilot weather action resolves through the existing layer registry', () => {
  assert.deepEqual([...COPILOT_MET_LAYER_IDS].sort(), MET_ACTIONS.filter((x) => !NOT_FOR_COPILOT.includes(x.id)).map((x) => x.id).sort())
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
