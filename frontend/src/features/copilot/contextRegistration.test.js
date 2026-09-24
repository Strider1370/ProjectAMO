import test from 'node:test'
import assert from 'node:assert/strict'
import { createContextRegistration } from './contextRegistration.js'

test('registration freezes applied inputs, versions changes and caches until real-clock expiry', async () => {
  let time = 0
  const sent = []
  const register = createContextRegistration({ now: () => time, request: async (_path, body) => {
    sent.push(body)
    return { status: 'ok', contextRef: `context-${sent.length}`, expiresAt: new Date(time + 60_000).toISOString() }
  } })
  const input = { schemaVersion: 1, scope: 'personal', request: { departureAirport: 'RKSS', arrivalAirport: 'RKPC', plannedCruiseAltitudeFt: 31000 } }
  const first = await register(input)
  assert.equal((await register(input)).contextRef, first.contextRef)
  assert.equal(sent.length, 1)
  input.request.plannedCruiseAltitudeFt = 29000
  const next = await register(input)
  assert.notEqual(next.revision, first.revision)
  assert.equal(sent[0].request.plannedCruiseAltitudeFt, 31000)
  time = 60_000
  assert.equal((await register(input)).contextRef, 'context-3')
  assert.equal((await register(null)).contextRef, null)
  await assert.rejects(register({ unsupported: 'ORGANIZATION_CONTEXT_UNSUPPORTED' }), { code: 'ORGANIZATION_CONTEXT_UNSUPPORTED' })
})
