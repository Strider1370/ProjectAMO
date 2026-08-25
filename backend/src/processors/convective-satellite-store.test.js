import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { assertConvectiveFilename, publishCompleteConvectiveFrame, readConvectiveMeta } from './convective-satellite-store.js'

const completeCtps = () => ({ binary: Buffer.from('bin'), images: Object.fromEntries(['all', 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550].map((level) => [level, Buffer.from(String(level))])) })

test('store rejects path escapes and retains the latest bounded frames', () => {
  assert.throws(() => assertConvectiveFilename('../bad'))
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'convective-store-'))
  for (let index = 0; index < 3; index += 1) publishCompleteConvectiveFrame({ root, frame: { tm: `2026072300${index}0`, request_tm_utc: `2026072215${index}0` }, ci: { geojson: { type: 'FeatureCollection', features: [] }, renderVersion: 'ci-native-lcc-v2' }, ctps: completeCtps(), maxFrames: 2 })
  const meta = readConvectiveMeta(root); assert.equal(meta.frames.length, 2); assert.equal(meta.latest.tm, '202607230020'); assert.match(meta.latest.ci.path, /\?v=ci-native-lcc-v2$/)
  fs.rmSync(root, { recursive: true, force: true })
})

test('complete-frame publication does not expose CI when CTPS is incomplete', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'convective-store-'))
  const frame = { tm: '202607230900', request_tm_utc: '202607230000' }
  const images = { all: Buffer.from('all'), 50: Buffer.from('50') }

  assert.throws(() => publishCompleteConvectiveFrame({
    root, frame, ci: { geojson: { type: 'FeatureCollection', features: [] }, renderVersion: 'ci-native-lcc-v2' },
    ctps: { binary: Buffer.from('bin'), images }, maxFrames: 19,
  }), /all 12 images/)
  assert.equal(readConvectiveMeta(root), null)
  fs.rmSync(root, { recursive: true, force: true })
})

test('metadata reader hides legacy partial convective frames', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'convective-store-'))
  const dir = path.join(root, 'satellite', 'convective')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'convective_meta.json'), JSON.stringify({
    frames: [{ tm: '202607230900', ci: { path: '/data/satellite/convective/ci_202607230900.geojson' }, ctps: null }],
  }))

  assert.deepEqual(readConvectiveMeta(root).frames, [])
  fs.rmSync(root, { recursive: true, force: true })
})
