import assert from 'node:assert/strict'
import test from 'node:test'

import { detectSnapshotChanges } from './snapshotMeta.js'

test('detectSnapshotChanges tracks domestic and overseas weather separately', () => {
  const prev = {
    metar: { hash: 'metar-domestic-1' },
    metarOverseas: { hash: 'metar-overseas-1' },
    taf: { hash: 'taf-domestic-1' },
    tafOverseas: { hash: 'taf-overseas-1' },
    sigmet: { hash: 'sigmet-domestic-1' },
    sigmetOverseas: { hash: 'sigmet-overseas-1' },
  }
  const next = {
    ...prev,
    metarOverseas: { hash: 'metar-overseas-2' },
    sigmetOverseas: { hash: 'sigmet-overseas-2' },
  }

  const changes = detectSnapshotChanges(prev, next)

  assert.equal(changes.metar, false)
  assert.equal(changes.metarOverseas, true)
  assert.equal(changes.taf, false)
  assert.equal(changes.tafOverseas, false)
  assert.equal(changes.sigmet, false)
  assert.equal(changes.sigmetOverseas, true)
})

test('main profile still detects RainViewer changes', () => {
  const prev = { rainviewerMeta: { tm: 't1' } }
  const next = { rainviewerMeta: { tm: 't2' } }
  assert.equal(detectSnapshotChanges(prev, next).rainviewerMeta, true)
})

test('main profile change set does not gain a notam key (NOTAM stays initial-load-only, per spec)', () => {
  const changes = detectSnapshotChanges({}, {})
  assert.ok(!('notam' in changes))
})
