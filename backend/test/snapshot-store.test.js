import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  RESERVED_LIVE_BACKUP,
  discardLiveBackup,
  hasLiveBackup,
  inspectSnapshot,
  loadSnapshot,
  saveSnapshot,
} from '../src/dev/snapshot-store.js'

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-snapshot-'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value))
}

test('discardLiveBackup removes only the reserved backup', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'snapshots', RESERVED_LIVE_BACKUP, 'meta.json'), {})
    writeJson(path.join(root, 'snapshots', 'demo', 'meta.json'), {})
    assert.equal(discardLiveBackup(root), true)
    assert.equal(hasLiveBackup(root), false)
    assert.equal(fs.existsSync(path.join(root, 'snapshots', 'demo')), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('saveSnapshot replaces a stale reserved backup with current files', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'metar', 'latest.json'), { fetched_at: '2026-07-28T09:40:00Z', airports: {} })
    writeJson(path.join(root, 'snapshots', RESERVED_LIVE_BACKUP, 'metar', 'latest.json'), { fetched_at: '2026-07-22T10:00:00Z' })
    saveSnapshot(root, RESERVED_LIVE_BACKUP)
    const restored = JSON.parse(fs.readFileSync(path.join(root, 'snapshots', RESERVED_LIVE_BACKUP, 'metar', 'latest.json')))
    assert.equal(restored.fetched_at, '2026-07-28T09:40:00Z')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('loadSnapshot replaces owned JSON and full directories', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'metar', 'latest.json'), { fetched_at: 'live' })
    writeJson(path.join(root, 'radar', 'echo_meta.json'), { frames: [] })
    fs.writeFileSync(path.join(root, 'radar', 'live-only.png'), 'live')
    writeJson(path.join(root, 'snapshots', 'demo', 'meta.json'), { referenceTime: '2026-07-22T10:00:00Z' })
    writeJson(path.join(root, 'snapshots', 'demo', 'metar', 'latest.json'), { fetched_at: 'demo' })
    writeJson(path.join(root, 'snapshots', 'demo', 'radar', 'echo_meta.json'), { frames: [] })

    const result = loadSnapshot(root, 'demo', { skipBackup: true })
    assert.deepEqual(result.restored.sort(), ['metar', 'radar'])
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'metar', 'latest.json'))).fetched_at, 'demo')
    assert.equal(fs.existsSync(path.join(root, 'radar', 'live-only.png')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('inspectSnapshot reports missing reference time and missing radar files', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'snapshots', 'demo', 'meta.json'), {})
    writeJson(path.join(root, 'snapshots', 'demo', 'radar', 'echo_meta.json'), {
      frames: [{ tm: '202607221900', path: '/data/radar/missing.png' }],
    })
    const report = inspectSnapshot(root, 'demo')
    assert.equal(report.ready, false)
    assert.ok(report.blockers.includes('reference_time_missing'))
    assert.ok(report.blockers.includes('radar:missing_frame_files:1'))
    assert.ok(report.blockers.includes('radar:short_history:1/36'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('inspectSnapshot blocks mixed-time demos missing a core data type', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'snapshots', 'demo', 'meta.json'), { referenceTime: '2026-07-22T10:00:00Z' })
    writeJson(path.join(root, 'snapshots', 'demo', 'metar', 'latest.json'), { fetched_at: '2026-07-22T10:00:00Z' })

    const report = inspectSnapshot(root, 'demo')

    assert.equal(report.ready, false)
    assert.ok(report.blockers.includes('missing_type:sigmet'))
    assert.ok(report.blockers.includes('missing_type:radar'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('inspectSnapshot blocks ADS-B positions far from the demo reference time', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'snapshots', 'demo', 'meta.json'), { referenceTime: '2026-07-22T10:00:00Z' })
    writeJson(path.join(root, 'snapshots', 'demo', 'adsb', 'latest.json'), {
      fetched_at: '2026-07-19T06:20:11.647Z',
      total_aircraft: 82,
      aircraft: Array.from({ length: 82 }, (_, index) => ({ icao24: `stale-${index}` })),
    })

    const report = inspectSnapshot(root, 'demo')

    assert.ok(report.blockers.includes('adsb:reference_skew:4540m/30m'))
    assert.equal(report.summaries.adsb.itemCount, 82)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('inspectSnapshot blocks required directories whose primary payload is missing', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'snapshots', 'demo', 'meta.json'), { referenceTime: '2026-07-22T10:00:00Z' })
    fs.mkdirSync(path.join(root, 'snapshots', 'demo', 'metar'), { recursive: true })
    fs.mkdirSync(path.join(root, 'snapshots', 'demo', 'radar'), { recursive: true })

    const report = inspectSnapshot(root, 'demo')

    assert.ok(report.blockers.includes('metar:latest_missing'))
    assert.ok(report.blockers.includes('radar:metadata_missing'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
