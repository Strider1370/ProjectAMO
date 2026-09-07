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
import { buildAirportComparison } from '../src/airport-model-comparison/service.js'
import { publishAirportWindow } from '../src/airport-model-comparison/store.js'
import { recordFixture } from './fixtures/airport-model-comparison/records.js'

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

test('snapshot captures full observation history and immutable comparison payloads', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'metar', 'latest.json'), { fetched_at: '2026-09-06T08:00:00Z' })
    writeJson(path.join(root, 'metar', 'METAR_01.json'), { fetched_at: 'history' })
    writeJson(path.join(root, 'amos', 'latest.json'), { fetched_at: '2026-09-06T08:00:00Z' })
    writeJson(path.join(root, 'amos', 'AMOS_01.json'), { fetched_at: 'history' })
    writeJson(path.join(root, 'airport_model_comparison', 'icon', 'latest.json'), {
      model: 'icon', airports: { RKPU: { path: 'runs/202609060000/RKPU/payload.json' } },
    })
    writeJson(path.join(root, 'airport_model_comparison', 'icon', 'runs', '202609060000', 'RKPU', 'payload.json'), { marker: 'demo' })

    const result = saveSnapshot(root, 'demo')

    assert.ok(result.saved.includes('airport_model_comparison'))
    for (const relative of ['metar/METAR_01.json', 'amos/AMOS_01.json', 'airport_model_comparison/icon/runs/202609060000/RKPU/payload.json']) {
      assert.equal(fs.existsSync(path.join(root, 'snapshots', 'demo', relative)), true, relative)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('comparison pointer integrity is conditional and confined to the snapshot', () => {
  const root = tempRoot()
  try {
    writeJson(path.join(root, 'snapshots', 'legacy', 'meta.json'), { referenceTime: '2026-09-06T08:00:00Z' })
    const legacy = inspectSnapshot(root, 'legacy')
    assert.equal(legacy.blockers.some((item) => item.startsWith('airport_model_comparison:')), false)

    writeJson(path.join(root, 'snapshots', 'broken', 'meta.json'), { referenceTime: '2026-09-06T08:00:00Z' })
    writeJson(path.join(root, 'snapshots', 'broken', 'airport_model_comparison', 'icon', 'latest.json'), {
      model: 'icon', airports: {
        RKPU: { path: 'runs/202609060000/RKPU/missing.json' },
        RKSI: { path: '/tmp/outside.json' },
      },
    })
    const broken = inspectSnapshot(root, 'broken')
    assert.ok(broken.blockers.includes('airport_model_comparison:missing_payloads:2'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('comparison service reads only the selected live or snapshot root', () => {
  const root = tempRoot()
  try {
    const publish = (temperature, collectedAt) => {
      const records = recordFixture({ model: 'icon', airport_icao: 'RKPU' }).map((record) => ({
        ...record, temperature_c: temperature, collected_at: collectedAt,
      }))
      publishAirportWindow({ root, model: 'icon', airport_icao: 'RKPU', run_at: records[0].run_at, window: {
        start_at: records[0].window_start_at, end_at: records[0].window_end_at,
        forecast_hours: records.map((record) => record.forecast_hour),
      }, records })
    }
    writeJson(path.join(root, 'metar', 'latest.json'), { fetched_at: '2026-09-06T08:00:00.000Z', airports: {} })
    publish(23, '2026-09-06T08:00:00.000Z')
    saveSnapshot(root, 'demo')
    publish(31, '2026-09-06T08:10:00.000Z')

    const demoRoot = path.join(root, 'snapshots', 'demo')
    const input = { airport_icao: 'RKPU', nowMs: Date.parse('2026-09-06T08:20:00.000Z') }
    const demoBefore = buildAirportComparison({ ...input, root: demoRoot, viewRevision: 'demo-a' })
    const live = buildAirportComparison({ ...input, root, viewRevision: 'live-a' })
    assert.equal(demoBefore.models[0].records[0].temperature_c, 23)
    assert.equal(live.models[0].records[0].temperature_c, 31)

    publish(35, '2026-09-06T08:20:00.000Z')
    const demoAfter = buildAirportComparison({ ...input, root: demoRoot, viewRevision: 'demo-a' })
    assert.equal(demoAfter.models[0].records[0].temperature_c, 23, 'live collector publication must not leak into demo reads')
    assert.equal(buildAirportComparison({ ...input, root: demoRoot, viewRevision: 'demo-b' }).models[0].records[0].temperature_c, 23)
    assert.notEqual(buildAirportComparison({ ...input, root: demoRoot, viewRevision: 'demo-b' }).revision, demoAfter.revision)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
