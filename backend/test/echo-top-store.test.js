import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { echoTopDir, publishEchoTopFrame, readEchoTopMeta } from '../src/processors/echo-top-store.js'

function publish(root, tm, overrides = {}) {
  return publishEchoTopFrame({
    root, tm,
    composite: Buffer.from('AMOETOP1binary'),
    image: Buffer.from('webp-bytes'),
    bounds: [[30, 120], [45, 135]], width: 100, height: 120,
    sites: [{ stn: 'AAA', status: 'ok', observedAt: '2026-07-25T11:35:00.000Z' }],
    maxFrames: 3,
    ...overrides,
  })
}

test('publishing writes the image, the binary and the meta', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  const meta = publish(root, '202607252035')

  assert.equal(meta.type, 'RADAR_ECHO_TOP')
  assert.equal(meta.threshold_dbz, 18)
  assert.equal(meta.tm, '202607252035')
  assert.equal(meta.frames[0].path, '/data/radar/echotop/echotop_202607252035.webp')
  assert.ok(fs.existsSync(path.join(echoTopDir(root), 'echotop_202607252035.webp')))
  assert.ok(fs.existsSync(path.join(echoTopDir(root), 'echotop_202607252035.bin')))
  assert.deepEqual(readEchoTopMeta(root).tm, '202607252035')
})

test('the frame records per-site status so partial coverage is identifiable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  const meta = publish(root, '202607252035', {
    sites: [
      { stn: 'AAA', status: 'ok', observedAt: '2026-07-25T11:35:00.000Z' },
      { stn: 'BBB', status: 'stale', observedAt: '2026-07-25T11:25:00.000Z' },
      { stn: 'CCC', status: 'failed', observedAt: null, reason: 'timeout' },
    ],
  })
  assert.deepEqual(meta.frames[0].siteCount, { ok: 1, total: 3 })
  assert.equal(meta.frames[0].sites.find((s) => s.stn === 'BBB').status, 'stale')
})

test('observedAt is null when no sites succeeded', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  const meta = publish(root, '202607252035', {
    sites: [
      { stn: 'AAA', status: 'failed', observedAt: null, reason: 'timeout' },
      { stn: 'BBB', status: 'missing', observedAt: null },
    ],
  })
  assert.equal(meta.frames[0].observedAt, null)
  assert.deepEqual(meta.frames[0].siteCount, { ok: 0, total: 2 })
})

test('retention keeps only maxFrames and deletes the orphaned assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  for (const tm of ['202607252015', '202607252020', '202607252025', '202607252030']) publish(root, tm)
  const meta = readEchoTopMeta(root)
  assert.equal(meta.frames.length, 3)
  assert.equal(meta.frames[0].tm, '202607252020')
  assert.equal(fs.existsSync(path.join(echoTopDir(root), 'echotop_202607252015.webp')), false)
  assert.equal(fs.existsSync(path.join(echoTopDir(root), 'echotop_202607252015.bin')), false)
})

test('an invalid tm is refused before anything is written', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  assert.throws(() => publish(root, '../../etc/passwd'), /Invalid Echo Top frame tm/)
  assert.equal(fs.existsSync(echoTopDir(root)), false)
})
