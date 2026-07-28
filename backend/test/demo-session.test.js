import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createDemoSession } from '../src/dev/demo-session.js'
import {
  DEMO_REQUIRED_TYPES,
  RESERVED_LIVE_BACKUP,
  discardLiveBackup,
  hasLiveBackup,
  inspectSnapshot,
  loadSnapshot,
  saveSnapshot,
} from '../src/dev/snapshot-store.js'

const DEMO_NOW = '2026-07-22T10:00:00.000Z'

function harness({ on = false, failRestore = false } = {}) {
  const calls = []
  const state = { on, now: null, backup: false }
  const clock = {
    isDemoMode: () => state.on,
    setDemoMode(value) {
      state.on = value
      if (!value) state.now = null
      calls.push(value ? 'freeze' : 'unfreeze')
    },
    setDemoNow(value) {
      state.now = value
      calls.push(`set-now:${value}`)
    },
    getEffectiveNow: () => new Date(state.now || '2026-07-28T10:00:00Z'),
  }
  const snapshots = {
    inspectSnapshot: () => ({ ready: true, blockers: [], warnings: [] }),
    discardLiveBackup() {
      calls.push('discard-live-backup')
      state.backup = false
      return true
    },
    hasLiveBackup: () => state.backup,
    saveSnapshot(_root, name) {
      calls.push(name === '_live_backup' ? 'capture-live-backup' : `capture:${name}`)
      if (name === '_live_backup') state.backup = true
      return { saved: ['metar'], referenceTime: DEMO_NOW }
    },
    loadSnapshot(_root, name) {
      calls.push(name === '_live_backup' ? 'restore-live-backup' : `restore:${name}`)
      if (failRestore) return null
      return { restored: ['metar'], referenceTime: DEMO_NOW }
    },
  }
  const drain = async () => { calls.push('drain') }
  return { calls, session: createDemoSession({ basePath: '/data', clock, snapshots, drain }), state }
}

test('startDemo replaces stale backup with immediate live state', async () => {
  const { calls, session, state } = harness()
  state.backup = true
  const result = await session.startDemo('demo')
  assert.deepEqual(calls, [
    'freeze', 'drain', 'discard-live-backup', 'capture-live-backup',
    'restore:demo', `set-now:${DEMO_NOW}`,
  ])
  assert.equal(result.on, true)
})

test('switching snapshots in one demo session preserves one live backup', async () => {
  const { calls, session } = harness()
  await session.startDemo('demo-a')
  await session.startDemo('demo-b')
  assert.equal(calls.filter((call) => call === 'capture-live-backup').length, 1)
  assert.equal(calls.includes('discard-live-backup'), true)
})

test('stopDemo restores before unfreezing and consumes backup', async () => {
  const { calls, session, state } = harness({ on: true })
  state.backup = true
  await session.stopDemo()
  assert.deepEqual(calls, ['drain', 'restore-live-backup', 'unfreeze', 'discard-live-backup'])
  assert.equal(state.backup, false)
})

test('failed demo restore rolls back toward the live backup and stays frozen', async () => {
  const { calls, session, state } = harness({ failRestore: true })
  await assert.rejects(session.startDemo('broken'), /snapshot_not_found/)
  assert.equal(state.on, true)
  assert.equal(state.backup, true)
  assert.deepEqual(calls.slice(-2), ['restore:broken', 'restore-live-backup'])
})

test('startDemo refuses an incomplete snapshot before touching live state', async () => {
  const { calls, state } = harness()
  const report = {
    ready: false,
    blockers: ['radar:short_history:2/36'],
    warnings: [],
  }
  const session = createDemoSession({
    basePath: '/data',
    clock: {
      isDemoMode: () => state.on,
      setDemoMode(value) { state.on = value; calls.push(value ? 'freeze' : 'unfreeze') },
      setDemoNow() {},
      getEffectiveNow: () => new Date('2026-07-28T10:00:00Z'),
    },
    snapshots: {
      inspectSnapshot: () => report,
      discardLiveBackup: () => calls.push('discard-live-backup'),
      hasLiveBackup: () => false,
      saveSnapshot: () => calls.push('capture-live-backup'),
      loadSnapshot: () => calls.push('restore:demo'),
    },
    drain: async () => calls.push('drain'),
  })

  await assert.rejects(session.startDemo('demo'), (error) => {
    assert.equal(error.code, 'snapshot_not_ready')
    assert.deepEqual(error.report, report)
    return true
  })
  assert.deepEqual(calls, [])
  assert.equal(state.on, false)
})

test('startDemo refuses to replace data when a resumed demo lost its live backup', async () => {
  const { calls, session } = harness({ on: true })

  await assert.rejects(session.startDemo('demo'), (error) => error.code === 'live_backup_missing')
  assert.deepEqual(calls, [])
})

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value))
}

function populateCompleteDataset(root, marker, referenceTime) {
  for (const type of DEMO_REQUIRED_TYPES) {
    if (['kim_nwp', 'ktg', 'radar', 'satellite'].includes(type)) continue
    writeJson(path.join(root, type, 'latest.json'), { type, marker, fetched_at: referenceTime, items: [] })
  }
  for (const type of ['kim_nwp', 'ktg']) {
    writeJson(path.join(root, type, 'latest.json'), {
      type,
      marker,
      updated_at: referenceTime,
      indexPath: `${type}/index.json`,
    })
    writeJson(path.join(root, type, 'index.json'), { type, marker, times: [] })
  }
  const radarFrames = Array.from({ length: 36 }, (_, index) => ({
    tm: `20260722${String(1800 + index * 5).padStart(4, '0')}`,
    path: `/data/radar/${marker}-${index}.png`,
  }))
  writeJson(path.join(root, 'radar', 'echo_meta.json'), { marker, frames: radarFrames })
  for (const frame of radarFrames) fs.writeFileSync(path.join(root, 'radar', path.basename(frame.path)), marker)

  const satelliteFrames = Array.from({ length: 18 }, (_, index) => ({
    tm: `20260722${String(1800 + index * 10).padStart(4, '0')}`,
    path: `/data/satellite/${marker}-${index}.webp`,
  }))
  writeJson(path.join(root, 'satellite', 'sat_meta.json'), { marker, frames: satelliteFrames })
  for (const frame of satelliteFrames) fs.writeFileSync(path.join(root, 'satellite', path.basename(frame.path)), marker)
}

test('filesystem session restores the exact pre-demo files without collecting upstream data', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-demo-session-'))
  const state = { on: false, now: null }
  const clock = {
    isDemoMode: () => state.on,
    setDemoMode(value) { state.on = value; if (!value) state.now = null },
    setDemoNow(value) { state.now = value },
    getEffectiveNow: () => new Date(state.now || '2026-07-28T10:00:00Z'),
  }
  try {
    populateCompleteDataset(root, 'demo', DEMO_NOW)
    saveSnapshot(root, 'demo')
    populateCompleteDataset(root, 'live', '2026-07-28T10:00:00.000Z')
    const liveMetar = fs.readFileSync(path.join(root, 'metar', 'latest.json'), 'utf8')
    const liveRadar = fs.readFileSync(path.join(root, 'radar', 'echo_meta.json'), 'utf8')
    const session = createDemoSession({
      basePath: root,
      clock,
      snapshots: { discardLiveBackup, hasLiveBackup, inspectSnapshot, loadSnapshot, saveSnapshot },
      drain: async () => {},
    })

    const started = await session.startDemo('demo')
    assert.equal(started.inspection.ready, true)
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'metar', 'latest.json'))).marker, 'demo')
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'radar', 'echo_meta.json'))).frames.length, 36)
    assert.equal(hasLiveBackup(root), true)

    const stopped = await session.stopDemo()
    assert.equal(stopped.restoredLiveBackup, true)
    assert.equal(fs.readFileSync(path.join(root, 'metar', 'latest.json'), 'utf8'), liveMetar)
    assert.equal(fs.readFileSync(path.join(root, 'radar', 'echo_meta.json'), 'utf8'), liveRadar)
    assert.equal(hasLiveBackup(root), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
