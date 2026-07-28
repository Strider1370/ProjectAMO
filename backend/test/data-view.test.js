import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDataViewManager } from '../src/dev/data-view.js'

function fixture() {
  const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-data-view-'))
  const activePath = path.join(basePath, '.active-data')
  for (const type of ['metar', 'sigmet', 'typhoon', 'terrain']) {
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
