import test from 'node:test'
import assert from 'node:assert/strict'
import { createBriefingProvider, createBriefingRequestGate } from './briefingProvider.js'

test('organization provider forwards version and overrides without personal fallback', async () => {
  const calls = []
  const forbidden = () => { throw new Error('personal API called') }
  const provider = createBriefingProvider({ kind: 'organization', orgId: 3, flightId: 7, flightVersion: 2 }, {
    organization: async (input) => { calls.push(input); throw new Error('out_of_range') },
    briefing: forbidden, profile: forbidden, crossSection: forbidden,
  })
  const signal = new AbortController().signal
  await assert.rejects(provider.load({ overrides: { etd: '2026-09-10T00:00:00Z', cruiseAltitudeFt: 3500 }, signal }), /out_of_range/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].flightVersion, 2)
  assert.equal(calls[0].overrides.cruiseAltitudeFt, 3500)
  assert.equal(calls[0].signal, signal)
})

test('request gate rejects old organization and personal results even if transport ignores abort', async () => {
  const gate = createBriefingRequestGate()
  let resolveOld
  const old = gate.begin()
  const lateResult = new Promise((resolve) => { resolveOld = resolve }).then(() => old.isCurrent())
  gate.cancel()
  const current = gate.begin()
  resolveOld()
  assert.equal(await lateResult, false)
  assert.equal(old.signal.aborted, true)
  assert.equal(current.isCurrent(), true)
  gate.cancel()
  assert.equal(current.isCurrent(), false)
})

test('personal provider preserves usable briefing and terrain on model failure', async () => {
  const result = await createBriefingProvider(null, {
    briefing: async () => ({ sections: { notam: ['personal NOTAM'] } }),
    profile: async () => ({ terrain: [1, 2] }),
    crossSection: async () => { throw new Error('unavailable') },
  }).load({ request: {}, profileRequest: {}, crossSectionRequest: {} })
  assert.deepEqual(result.briefing.sections.notam, ['personal NOTAM'])
  assert.deepEqual(result.verticalProfile.terrain, [1, 2])
  assert.equal(result.crossSection, null)
})
