import assert from 'node:assert/strict'
import test from 'node:test'
import { buildKimGridUrl } from '../src/api-client.js'
import { createRequestObservedApi } from '../src/lib/request-observability.js'

function transport() {
  let calls = 0, usageCalls = 0
  const request = createRequestObservedApi({
    aviationCredential: 'aviation-fixture',
    fetchImpl: async () => { calls++; return new Response('ok') },
    usage: { assertAllowed() {}, record: async () => { usageCalls++ } },
    stats: { recordApiOperationStart() {}, recordApiOperationSuccess() {}, recordApiOperationFailure() {} },
    resolveOperation: ({ id }) => ({ id, apiHub: true,
      requestPolicy: { timeoutMs: 1000, maxAttempts: 1, allowedOverrides: ['signal'] } }),
    logger: { info() {}, warn() {} },
  })
  return { request, calls: () => calls, usageCalls: () => usageCalls }
}
const url = (key, host = 'apihub.kma.go.kr') => `https://${host}/api/typ06/cgi-bin/url/nph-kim_nc_xy_txt2_std?authKey=${key}`

test('KIM NWP blocks the aviation key before transport or usage recording', async () => {
  const seam = transport()
  for (const operation of ['kim_grid']) {
    for (const host of ['apihub.kma.go.kr', 'apihub-org.kma.go.kr']) {
      await assert.rejects(seam.request({ operation, url: url('aviation-fixture', host) }), { code: 'kim_nwp_aviation_credential_forbidden' })
    }
  }
  await assert.rejects(seam.request({ operation: 'kim_grid', url: `${url('kim-fixture')}&authKey=aviation-fixture` }), { code: 'kim_nwp_aviation_credential_forbidden' })
  assert.equal(seam.calls(), 0)
  assert.equal(seam.usageCalls(), 0)
})

test('independent KIM, radar and bulk keys remain usable and aviation requests remain unchanged', async () => {
  const seam = transport()
  for (const key of ['kim-fixture', 'radar-fixture', 'bulk-fixture']) {
    const response = await seam.request({ operation: 'kim_grid', url: url(key) })
    assert.equal(await response.text(), 'ok')
  }
  await seam.request({ operation: 'metar', url: 'https://apihub.kma.go.kr/api/metar?authKey=aviation-fixture' })
  assert.equal(seam.calls(), 4)
  assert.equal(seam.usageCalls(), 4)
})

test('other KIM products sharing the endpoint are not subject to the NWP block', async () => {
  const seam = transport()
  for (const operation of ['kim_grid_chart', 'kim_grid_gktg', 'kim_grid_trop', 'kim_grid_aci']) {
    const response = await seam.request({ operation, url: url('aviation-fixture') })
    assert.equal(await response.text(), 'ok')
  }
  assert.equal(seam.calls(), 4)
})

test('shared URL construction adds no credential restriction', () => {
  const generated = buildKimGridUrl({ data: 'U', name: 'psl', level: 0, tmfc: '2026102918', sub: '1,1,2,2', credential: 'aviation-fixture' })
  assert.equal(new URL(generated).searchParams.get('authKey'), 'aviation-fixture')
})
