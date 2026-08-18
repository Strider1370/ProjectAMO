import assert from 'node:assert/strict'
import test from 'node:test'

import { selectKimRunCredential } from '../src/processors/kim-run-credential.js'

test('selects the KIM credential for 00Z, 06Z, and 12Z runs', () => {
  for (const tmfc of ['2026081800', '2026081806', '2026081812']) {
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
