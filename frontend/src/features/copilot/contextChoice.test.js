import test from 'node:test'
import assert from 'node:assert/strict'
import { captureChatContext, needsContextChoice, sameChatContext, startsContextConversation } from './contextChoice.js'

const route = () => ({ schemaVersion: 1, scope: 'personal', request: {
  departureAirport: 'RKSS', arrivalAirport: 'RKPC', plannedCruiseAltitudeFt: 31000,
  etd: '2026-09-23T12:03:00Z', eta: '2026-09-23T13:30:00Z',
  routeGeometry: { type: 'LineString', coordinates: [[126, 37], [126, 33]] },
  routeMarkers: [{ id: 'a', offsetHours: 0 }, { id: 'b', offsetHours: 1.45 }],
  nwpTimeSelection: { baseTime: '2026-09-23T12:00:00Z' },
} })

test('context choice uses frozen full inputs, not ref expiry or display labels', async () => {
  const original = route()
  const previous = await captureChatContext(original, null)
  original.request.routeGeometry.coordinates[0][0] = 127
  assert.equal(previous.snapshot.request.routeGeometry.coordinates[0][0], 126)
  const same = await captureChatContext(route(), null)
  same.context.contextRef = 'ref-refreshed-after-expiry'
  assert.equal(sameChatContext(previous, same), true)
  assert.equal(needsContextChoice(previous, same), false)
  assert.equal(startsContextConversation(previous, same), false)
  for (const change of [
    (value) => { value.request.eta = '2026-09-23T13:35:00Z' },
    (value) => { value.request.routeMarkers[1].offsetHours = 1.5 },
    (value) => { value.request.nwpTimeSelection.baseTime = '2026-09-23T15:00:00Z' },
    (value) => { value.request.plannedCruiseAltitudeFt = 33000 },
    (value) => { value.request.routeGeometry.coordinates[0][0] = 127 },
  ]) {
    const changed = route(); change(changed)
    const next = await captureChatContext(changed, null)
    assert.equal(needsContextChoice(previous, next), true)
    assert.equal(startsContextConversation(previous, next), true)
  }
})

test('new route, removed route, airport switch and detached input have explicit boundaries', async () => {
  const empty = await captureChatContext(null, null)
  const previous = await captureChatContext(route(), 'RKSS')
  const airportOnly = await captureChatContext(null, 'RKSS')
  const detached = await captureChatContext({ unsupported: 'UNSUPPORTED' }, 'RKSS', false)
  assert.equal(needsContextChoice(null, previous), false)
  assert.equal(needsContextChoice(empty, previous), false)
  assert.equal(startsContextConversation(empty, previous), true)
  assert.equal(needsContextChoice(previous, airportOnly), true)
  assert.equal(needsContextChoice(airportOnly, await captureChatContext(null, 'RKPC')), true)
  assert.equal(startsContextConversation(previous, detached), true)
  assert.equal(detached.context, null)
  assert.equal(detached.snapshot, null)
  assert.equal(sameChatContext(detached, empty), true)
  await assert.rejects(captureChatContext({ unsupported: 'ORGANIZATION_CONTEXT_UNSUPPORTED' }, null), { code: 'ORGANIZATION_CONTEXT_UNSUPPORTED' })
})
