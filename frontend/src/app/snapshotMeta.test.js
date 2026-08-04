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

test('detectSnapshotChanges tracks WISSDOM and QPF graphics metadata independently', () => {
  const prev = {
    wissdomMeta: { tm: '202608041700', hash: 'wissdom-old' },
    qpfMeta: { tm: '202608041700', hash: 'qpf-stable' },
  }
  const next = {
    wissdomMeta: { tm: '202608041700', hash: 'wissdom-new' },
    qpfMeta: { tm: '202608041700', hash: 'qpf-stable' },
  }

  const changes = detectSnapshotChanges(prev, next)

  assert.equal(changes.wissdomMeta, true)
  assert.equal(changes.qpfMeta, false)
})

test('detectSnapshotChanges does not re-fetch graphics metadata after the client rebuilds its snapshot', () => {
  const saved = { wissdomMeta: { tm: '202608041700', updated_at: '2026-08-04T08:00:00Z' } }
  const latest = { wissdomMeta: { tm: '202608041700', hash: 'backend-canonical-hash', updated_at: '2026-08-04T08:00:00Z' } }

  assert.equal(detectSnapshotChanges(saved, latest).wissdomMeta, false)
})

test('main profile change set does not gain a notam key (NOTAM stays initial-load-only, per spec)', () => {
  const changes = detectSnapshotChanges({}, {})
  assert.ok(!('notam' in changes))
})

test('detectSnapshotChanges detects a same-time convective partial update by hash', () => {
  const prev = { convectiveMeta: { tm: '202607231200', hash: 'ci-only' } }
  const next = { convectiveMeta: { tm: '202607231200', hash: 'ci-and-ctps' } }
  assert.equal(detectSnapshotChanges(prev, next).convectiveMeta, true)
})

test('a data-view revision change invalidates every polled weather source', () => {
  const changes = detectSnapshotChanges(
    { viewRevision: 'live' },
    { viewRevision: 'demo:demo:2026-07-22T10:00:00.000Z' },
  )
  assert.ok(Object.values(changes).every(Boolean))
})
