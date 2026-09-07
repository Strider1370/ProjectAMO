import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchModelComparison } from './modelComparisonApi.js'

test('comparison API validates the allowlist, forwards abort, and rejects mismatched payloads', async t => {
  await assert.rejects(fetchModelComparison('RJAA'), /unsupported_airport/)
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const signal = new AbortController().signal
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/airport/RKSI/model-comparison')
    assert.equal(options.signal, signal)
    return { ok: true, json: async () => ({ airport: { icao: 'RKSS' }, models: [] }) }
  }
  await assert.rejects(fetchModelComparison('rksi', { signal }), /airport_mismatch/)
})

test('comparison API distinguishes HTTP and empty-payload failures', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) })
  await assert.rejects(fetchModelComparison('RKSI'), /comparison_http_503/)
  globalThis.fetch = async () => ({ ok: true, json: async () => null })
  await assert.rejects(fetchModelComparison('RKSI'), /comparison_empty_payload/)
})
