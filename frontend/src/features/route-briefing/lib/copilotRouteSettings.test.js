import test from 'node:test'
import assert from 'node:assert/strict'
import { previewCopilotRouteSettings } from './copilotRouteSettings.js'

const state = () => ({ organization: false, routeForm: { flightRule: 'IFR', departureAirport: '', arrivalAirport: '' },
  routeEditor: { rawText: '', procedures: { sid: null, star: null, iapKey: null } }, routeTokenTexts: [], designs: [],
  cruiseAltitudeFt: 31000, etd: '2026-09-23T12:00:00.000Z', hasConditionEdits: false })
const action = () => ({ type: 'route_settings', schemaVersion: 1, fields: { departureAirport: 'RKSS', arrivalAirport: 'RKPC' } })

test('empty settings prefill retains explicitly disclosed screen values without inventing ETA', () => {
  const current = state(), proposal = action(), before = structuredClone(current)
  const result = previewCopilotRouteSettings(current, proposal)
  assert.deepEqual(current, before)
  assert.equal(result.requiresConfirmation, false)
  assert.deepEqual(result.retained, ['flightRule', 'cruiseAltitudeFt', 'etd'])
  assert.deepEqual(result.next, { ...proposal.fields, flightRule: 'IFR', cruiseAltitudeFt: 31000, etd: current.etd })
  assert.equal(result.next.eta, undefined)
  assert.equal(previewCopilotRouteSettings({ ...current, etd: '2026-09-23T12:00:00Z' }, proposal).next.etd, current.etd)
})

test('dirty draft or flight inputs require confirmation and changes invalidate the preview revision', () => {
  for (const changes of [{ routeTokenTexts: ['SEL'] }, { hasConditionEdits: true }, { designs: [{ id: 'base' }] }, { alternateAirport: 'RKPK' }]) {
    const current = { ...state(), ...changes }, original = previewCopilotRouteSettings(current, action())
    assert.equal(original.requiresConfirmation, true)
    current.cruiseAltitudeFt = 29000
    assert.notEqual(previewCopilotRouteSettings(current, action()).revision, original.revision)
  }
})

test('unsupported organization, VFR, fields, range and incompatible retained departure time fail closed', () => {
  assert.throws(() => previewCopilotRouteSettings({ ...state(), organization: true }, action()), /ORGANIZATION_CONTEXT_UNSUPPORTED/)
  assert.throws(() => previewCopilotRouteSettings({ ...state(), routeForm: { flightRule: 'VFR' } }, action()), /FLIGHT_RULE_UNSUPPORTED/)
  for (const changes of [{ path: 'delete' }, { cruiseAltitudeFt: 70000 }, { departureAirport: 'XXXX' },
    { etd: '2026-09-23T12:00:00Z' }, { eta: '2026-09-23T11:00:00.000Z' }]) {
    assert.throws(() => previewCopilotRouteSettings(state(), { ...action(), fields: { ...action().fields, ...changes } }))
  }
})
