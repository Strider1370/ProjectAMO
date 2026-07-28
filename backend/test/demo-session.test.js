import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createDemoSession } from '../src/dev/demo-session.js'
import { createDataViewManager } from '../src/dev/data-view.js'
import { DEMO_REQUIRED_TYPES, inspectSnapshot, saveSnapshot } from '../src/dev/snapshot-store.js'

const DEMO_NOW = '2026-07-22T10:00:00.000Z'

function harness() {
  const calls = []
  let context = { mode: 'live', name: null, referenceTime: null, revision: 'live' }
  const views = {
    current: () => context,
    activateDemo(name) {
      calls.push(`activate-demo:${name}`)
      context = { mode: 'demo', name, referenceTime: DEMO_NOW, revision: `demo:${name}:${DEMO_NOW}` }
      return context
    },
    activateLive() {
      calls.push('activate-live')
      context = { mode: 'live', name: null, referenceTime: null, revision: 'live' }
      return context
    },
  }
  const snapshots = {
    inspectSnapshot: () => ({ ready: true, blockers: [], warnings: [], types: ['metar', 'sigmet'] }),
    saveSnapshot: (_root, name) => ({ saved: [name], referenceTime: DEMO_NOW }),
  }
  const session = createDemoSession({
    basePath: '/live',
    activePath: '/active',
    views,
    snapshots,
    reloadActive: () => calls.push('reload-active'),
    drain: async () => calls.push('drain'),
  })
  return { calls, session }
}

test('demo session starts and stops by switching the active path only', async () => {
  const { calls, session } = harness()
  const started = await session.startDemo('demo')
  assert.deepEqual(calls, ['activate-demo:demo', 'reload-active'])
  assert.equal(started.on, true)
  assert.equal(started.now, DEMO_NOW)
  assert.equal(session.status().revision, `demo:demo:${DEMO_NOW}`)

  calls.length = 0
  const stopped = await session.stopDemo()
  assert.deepEqual(calls, ['activate-live', 'reload-active'])
  assert.equal(stopped.on, false)
  assert.equal(stopped.restoredLiveBackup, false)
})

test('demo switching never drains collectors while snapshot capture still does', async () => {
  const { calls, session } = harness()
  await session.startDemo('demo')
  assert.equal(calls.includes('drain'), false)
  calls.length = 0
  await session.captureSnapshot('new-snapshot')
  assert.deepEqual(calls, ['drain'])
})

test('startDemo refuses an incomplete snapshot before changing the view', async () => {
  const { calls, session } = harness()
  session.startDemo
  const report = { ready: false, blockers: ['radar:short_history:2/36'], warnings: [], types: [] }
  const rejected = createDemoSession({
    basePath: '/live',
    activePath: '/active',
    views: {
      current: () => ({ mode: 'live', revision: 'live' }),
      activateDemo: () => calls.push('activate-demo'),
      activateLive: () => calls.push('activate-live'),
    },
    snapshots: { inspectSnapshot: () => report },
    reloadActive: () => calls.push('reload-active'),
  })
  await assert.rejects(rejected.startDemo('demo'), (error) => {
    assert.equal(error.code, 'snapshot_not_ready')
    assert.deepEqual(error.report, report)
    return true
  })
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
      type, marker, updated_at: referenceTime, indexPath: `${type}/index.json`,
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

test('filesystem session leaves live files untouched and immediately returns to their newest version', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-demo-session-'))
  const activePath = path.join(root, '.active-data')
  try {
    populateCompleteDataset(root, 'demo', DEMO_NOW)
    saveSnapshot(root, 'demo')
    populateCompleteDataset(root, 'live-before', '2026-07-28T10:00:00.000Z')
    const views = createDataViewManager({ basePath: root, activePath })
    views.ensure()
    const session = createDemoSession({
      basePath: root,
      activePath,
      views,
      snapshots: { inspectSnapshot, saveSnapshot },
      reloadActive: () => {},
      drain: async () => {},
    })

    await session.startDemo('demo')
    assert.equal(JSON.parse(fs.readFileSync(path.join(activePath, 'metar', 'latest.json'))).marker, 'demo')
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'metar', 'latest.json'))).marker, 'live-before')

    populateCompleteDataset(root, 'live-during-demo', '2026-07-28T10:05:00.000Z')
    assert.equal(JSON.parse(fs.readFileSync(path.join(activePath, 'metar', 'latest.json'))).marker, 'demo')

    await session.stopDemo()
    assert.equal(JSON.parse(fs.readFileSync(path.join(activePath, 'metar', 'latest.json'))).marker, 'live-during-demo')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
