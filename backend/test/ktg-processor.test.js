import assert from 'node:assert/strict'
import test from 'node:test'

import config from '../src/config.js'
import { buildKtgUrl, selectKtgRunCredential } from '../src/processors/ktg-processor.js'
import { KTG_FORECAST_HOURS } from '../src/processors/ktg-model.js'

test('KTG only collects source-supported +6, +9, and +12 forecast hours', () => {
  assert.deepEqual(KTG_FORECAST_HOURS, [6, 9, 12])
  assert.deepEqual(config.ktg.forecast_hours, [6, 9, 12])
})

test('buildKtgUrl puts the selected run credential in the request', () => {
  const url = new URL(buildKtgUrl({ tmfc: '2026081818', ef: 6, credential: 'aviation-key' }))
  assert.equal(url.searchParams.get('tmfc'), '2026081818')
  assert.equal(url.searchParams.get('ef'), '06')
  assert.equal(url.searchParams.get('authKey'), 'aviation-key')
})

test('KTG selects the aviation credential only for 18Z and rejects an unsafe fallback', () => {
  const originalKim = config.api.kim_nwp_auth_key
  const originalAviation = config.api.auth_key
  try {
    config.api.kim_nwp_auth_key = 'kim-key'
    config.api.auth_key = 'aviation-key'
    assert.equal(selectKtgRunCredential('2026081812'), 'kim-key')
    assert.equal(selectKtgRunCredential('2026081818'), 'aviation-key')

    config.api.auth_key = 'kim-key'
    assert.throws(() => selectKtgRunCredential('2026081818'), { code: 'kim_18z_aviation_credential_unavailable' })
  } finally {
    config.api.kim_nwp_auth_key = originalKim
    config.api.auth_key = originalAviation
  }
})
