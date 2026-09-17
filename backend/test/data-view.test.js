import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDataViewManager } from '../src/dev/data-view.js'

function fixture() {
  const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-data-view-'))
  const activePath = path.join(basePath, '.active-data')
  for (const type of ['metar', 'sigmet', 'aip', 'typhoon', 'terrain']) {
    fs.mkdirSync(path.join(basePath, type), { recursive: true })
    fs.writeFileSync(path.join(basePath, type, 'marker'), `live-${type}`)
  }
  const snapshot = path.join(basePath, 'snapshots', 'demo')
  for (const type of ['metar', 'sigmet']) {
    fs.mkdirSync(path.join(snapshot, type), { recursive: true })
    fs.writeFileSync(path.join(snapshot, type, 'marker'), `demo-${type}`)
  }
  fs.writeFileSync(path.join(snapshot, 'meta.json'), JSON.stringify({
    savedAt: '2026-07-22T10:01:00.000Z',
    referenceTime: '2026-07-22T10:00:00.000Z',
  }))
  return { basePath, activePath, manager: createDataViewManager({ basePath, activePath }) }
}

function publishGeneration(basePath, name, generation, referenceTime, marker) {
  const snapshotRoot = path.join(basePath, 'snapshots')
  const generationPath = path.join(snapshotRoot, '.generations', name, generation)
  fs.mkdirSync(path.join(generationPath, 'metar'), { recursive: true })
  fs.writeFileSync(path.join(generationPath, 'metar', 'marker'), marker)
  fs.writeFileSync(path.join(generationPath, 'meta.json'), JSON.stringify({
    savedAt: referenceTime,
    referenceTime,
    generation,
    revision: `snapshot:${name}:${generation}`,
  }))
  const pointer = path.join(snapshotRoot, name)
  const next = `${pointer}.next-${generation}`
  fs.symlinkSync(path.relative(snapshotRoot, generationPath), next, 'dir')
  fs.renameSync(next, pointer)
}

test('data view defaults to live without moving existing data', () => {
  const { basePath, activePath, manager } = fixture()
  const context = manager.ensure()
  assert.equal(context.mode, 'live')
  assert.equal(fs.readFileSync(path.join(activePath, 'metar', 'marker'), 'utf8'), 'live-metar')
  assert.equal(fs.realpathSync(activePath), fs.realpathSync(basePath))
})

test('activateDemo atomically selects snapshot data and explicit live passthrough data', () => {
  const { basePath, activePath, manager } = fixture()
  manager.ensure()
  const context = manager.activateDemo('demo')

  assert.equal(context.mode, 'demo')
  assert.equal(context.name, 'demo')
  assert.equal(context.referenceTime, '2026-07-22T10:00:00.000Z')
  assert.equal(fs.readFileSync(path.join(activePath, 'metar', 'marker'), 'utf8'), 'demo-metar')
  assert.equal(fs.readFileSync(path.join(activePath, 'sigmet', 'marker'), 'utf8'), 'demo-sigmet')
  assert.equal(fs.realpathSync(path.join(activePath, 'aip')), fs.realpathSync(path.join(basePath, 'aip')))
  assert.equal(fs.realpathSync(path.join(activePath, 'typhoon')), fs.realpathSync(path.join(basePath, 'typhoon')))
  assert.equal(fs.realpathSync(path.join(activePath, 'terrain')), fs.realpathSync(path.join(basePath, 'terrain')))
})

test('active pointer survives a new manager and returns to current live data', () => {
  const { basePath, activePath, manager } = fixture()
  manager.ensure()
  manager.activateDemo('demo')
  fs.writeFileSync(path.join(basePath, 'metar', 'marker'), 'live-new')

  const restarted = createDataViewManager({ basePath, activePath })
  assert.equal(restarted.current().mode, 'demo')
  assert.equal(fs.readFileSync(path.join(activePath, 'metar', 'marker'), 'utf8'), 'demo-metar')

  const live = restarted.activateLive()
  assert.equal(live.mode, 'live')
  assert.equal(fs.readFileSync(path.join(activePath, 'metar', 'marker'), 'utf8'), 'live-new')
})

test('activateDemo rejects invalid names and missing reference time without changing the pointer', () => {
  const { activePath, manager } = fixture()
  manager.ensure()
  assert.throws(() => manager.activateDemo('../bad'), /invalid_snapshot_name/)
  assert.equal(manager.current().mode, 'live')
  assert.equal(fs.realpathSync(activePath), fs.realpathSync(manager.basePath))
})

test('same-name generation activation atomically replaces active data and its metadata together', () => {
  const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-data-view-generation-'))
  const activePath = path.join(basePath, '.active-data')
  try {
    publishGeneration(basePath, 'demo', 'generation-a', '2026-07-22T10:00:00.000Z', 'first')
    const manager = createDataViewManager({ basePath, activePath, passthrough: [] })
    const first = manager.activateDemo('demo')
    assert.equal(first.generation, 'generation-a')
    assert.equal(fs.readFileSync(path.join(activePath, 'metar', 'marker'), 'utf8'), 'first')

    publishGeneration(basePath, 'demo', 'generation-b', '2026-07-22T11:00:00.000Z', 'second')
    assert.equal(fs.readFileSync(path.join(activePath, 'metar', 'marker'), 'utf8'), 'first', 'old active view remains immutable before activation')

    const second = manager.activateDemo('demo')
    const activeMeta = JSON.parse(fs.readFileSync(path.join(activePath, '.view.json'), 'utf8'))
    assert.equal(second.generation, 'generation-b')
    assert.equal(second.referenceTime, '2026-07-22T11:00:00.000Z')
    assert.equal(second.revision, 'snapshot:demo:generation-b')
    assert.equal(fs.readFileSync(path.join(activePath, 'metar', 'marker'), 'utf8'), 'second')
    assert.deepEqual(activeMeta, {
      mode: 'demo', name: 'demo', referenceTime: '2026-07-22T11:00:00.000Z',
      generation: 'generation-b', revision: 'snapshot:demo:generation-b',
    })

    const restarted = createDataViewManager({ basePath, activePath, passthrough: [] })
    assert.equal(restarted.current().generation, 'generation-b')
    restarted.activateLive()
    assert.equal(restarted.activateDemo('demo').generation, 'generation-b', 'a stopped demo can reuse its immutable generation view')
  } finally {
    fs.rmSync(basePath, { recursive: true, force: true })
  }
})
