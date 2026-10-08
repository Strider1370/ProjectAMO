import assert from 'node:assert/strict'
import test from 'node:test'

import { selectKimRunCredential } from '../src/processors/kim-run-credential.js'

test('selects the KIM credential for 00Z and 06Z runs', () => {
  for (const tmfc of ['2026081800', '2026081806']) {
    assert.equal(selectKimRunCredential({ tmfc, kimCredential: 'kim-key', aviationCredential: 'aviation-key' }), 'kim-key')
  }
})

test('selects the distinct aviation credential for the entire 18Z run', () => {
  assert.equal(
    selectKimRunCredential({ tmfc: '2026081818', kimCredential: 'kim-key', aviationCredential: 'aviation-key' }),
    'aviation-key',
  )
})

test('rejects an unset or identical aviation credential at 18Z instead of falling back', () => {
  for (const aviationCredential of ['', 'kim-key']) {
    assert.throws(
      () => selectKimRunCredential({ tmfc: '2026081818', kimCredential: 'kim-key', aviationCredential }),
      { code: 'kim_18z_aviation_credential_unavailable' },
    )
  }
})

test('12Z uses only a distinct radar/satellite key', () => {
  assert.equal(selectKimRunCredential({ tmfc: '2026081812', kimCredential: 'kim', aviationCredential: 'aviation', radarCredential: 'radar' }), 'radar')
  for (const radarCredential of ['', 'kim', 'aviation']) assert.throws(() => selectKimRunCredential({ tmfc: '2026081812', kimCredential: 'kim', aviationCredential: 'aviation', radarCredential }), { code: 'kim_12z_radar_credential_unavailable' })
})

test('the bulk key is used for every run only inside its KST window and approval period, never falling back', async () => {
  const { kimBulkCredentialOptions, kimBulkWindowOpen } = await import('../src/processors/kim-run-credential.js')
  const config = { api: { kma_bulk_auth_key: 'bulk' }, kim_bulk: { use: true, valid_until_kst: '2026-11-06', window_start_hour_kst: 15, window_end_hour_kst: 24 } }
  const at = (iso) => Date.parse(iso)
  // 2026-10-08 20:15 KST = 11:15 UTC
  for (const tmfc of ['2026100800', '2026100806', '2026100812', '2026100818']) {
    assert.equal(selectKimRunCredential({ tmfc, kimCredential: 'kim', aviationCredential: 'aviation', radarCredential: 'radar', ...kimBulkCredentialOptions(config, at('2026-10-08T11:15:00Z')) }), 'bulk')
  }
  assert.throws(() => selectKimRunCredential({ tmfc: '2026100800', kimCredential: 'kim', ...kimBulkCredentialOptions(config, at('2026-10-08T05:00:00Z')) }), { code: 'kim_bulk_credential_outside_window' })
  assert.throws(() => selectKimRunCredential({ tmfc: '2026110700', kimCredential: 'kim', ...kimBulkCredentialOptions(config, at('2026-11-07T08:00:00Z')) }), { code: 'kim_bulk_credential_outside_window' })
  assert.throws(() => selectKimRunCredential({ tmfc: '2026100800', kimCredential: 'kim', ...kimBulkCredentialOptions({ ...config, api: {} }, at('2026-10-08T11:15:00Z')) }), { code: 'kim_bulk_credential_unavailable' })
  assert.deepEqual(kimBulkCredentialOptions({ ...config, kim_bulk: { ...config.kim_bulk, use: false } }), {})
  assert.equal(kimBulkWindowOpen({ now: at('2026-10-08T14:59:59Z'), validUntilKst: '2026-11-06' }), true, '23:59:59 KST')
  assert.equal(kimBulkWindowOpen({ now: at('2026-10-08T15:00:00Z'), validUntilKst: '2026-11-06' }), false, '00:00 KST next day')
  assert.equal(kimBulkWindowOpen({ now: at('2026-10-08T06:00:00Z'), validUntilKst: '2026-11-06' }), true, '15:00 KST')
})
