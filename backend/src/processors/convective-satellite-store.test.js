import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { assertConvectiveFilename, publishCi, readConvectiveMeta } from './convective-satellite-store.js'

test('store rejects path escapes and retains the latest bounded frames', () => {
  assert.throws(() => assertConvectiveFilename('../bad'))
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'convective-store-'))
  for (let index = 0; index < 3; index += 1) publishCi({ root, frame: { tm: `2026072300${index}0`, request_tm_utc: `2026072215${index}0` }, geojson: { type: 'FeatureCollection', features: [] }, maxFrames: 2 })
  const meta = readConvectiveMeta(root); assert.equal(meta.frames.length, 2); assert.equal(meta.latest.tm, '202607230020')
  fs.rmSync(root, { recursive: true, force: true })
})
