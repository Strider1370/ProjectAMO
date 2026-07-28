import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveDemoEtd, selectEffectiveEtd } from './demoTime.js'

test('a new frozen demo clock moves ETD once and preserves later user edits', () => {
  const currentEtd = '2026-07-28T10:00:00Z'
  const demoNowMs = Date.parse('2026-07-22T10:00:42.123Z')
  assert.equal(resolveDemoEtd({ currentEtd, demoOn: true, lastAppliedDemoNowMs: null, demoNowMs }), '2026-07-22T10:00:00Z')
  assert.equal(resolveDemoEtd({ currentEtd, demoOn: true, lastAppliedDemoNowMs: demoNowMs, demoNowMs }), currentEtd)
})

test('switching snapshots while demo mode remains on applies the new clock', () => {
  const currentEtd = '2026-07-22T10:30:00Z'
  const previousDemoNowMs = Date.parse('2026-07-22T10:00:00Z')
  const demoNowMs = Date.parse('2026-07-21T09:00:00Z')
  assert.equal(resolveDemoEtd({
    currentEtd,
    demoOn: true,
    lastAppliedDemoNowMs: previousDemoNowMs,
    demoNowMs,
  }), '2026-07-21T09:00:00Z')
})

test('live mode and invalid demo clocks preserve the current ETD', () => {
  const currentEtd = '2026-07-28T10:00:00Z'
  assert.equal(resolveDemoEtd({ currentEtd, demoOn: false, lastAppliedDemoNowMs: null, demoNowMs: 0 }), currentEtd)
  assert.equal(resolveDemoEtd({ currentEtd, demoOn: true, lastAppliedDemoNowMs: null, demoNowMs: NaN }), currentEtd)
})

test('effective ETD follows the demo clock until the user edits it', () => {
  const storedEtd = '2026-07-28T10:36:00Z'
  const demoNowMs = Date.parse('2026-07-22T10:00:00.495Z')
  assert.equal(selectEffectiveEtd({ storedEtd, demoOn: true, demoNowMs, userEdited: false }), '2026-07-22T10:00:00Z')
  assert.equal(selectEffectiveEtd({ storedEtd, demoOn: true, demoNowMs, userEdited: true }), storedEtd)
  assert.equal(selectEffectiveEtd({ storedEtd, demoOn: false, demoNowMs, userEdited: false }), storedEtd)
})
