import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import test from 'node:test'

import { attachMotionFrame, isAdjacentFrame, writeMeta } from '../src/processors/radar-echo-processor.js'
import { createMotionInput } from '../src/processors/radar-motion.js'

const geometry = { nx: 32, ny: 32 }

function input(tm, cells) {
  const refl = new Int16Array(geometry.nx * geometry.ny)
  for (const [x, y] of cells) refl[y * geometry.nx + x] = 4200
  return createMotionInput(refl, geometry, { tm, stride: 1 })
}

test('publishes exact-adjacent motion atomically without blocking frame metadata', async () => {
  const radarDir = await mkdtemp(path.join(os.tmpdir(), 'radar-motion-publication-'))
  try {
    const previous = input('202607221200', [[11, 12], [12, 12], [11, 13], [12, 13]])
    const current = input('202607221205', [[13, 12], [14, 12], [13, 13], [14, 13]])
    const frame = { tm: current.tm, path: `/data/radar/echo_korea_${current.tm}.png` }
    const published = attachMotionFrame(radarDir, frame, previous, current)

    assert.ok(published.motion)
    assert.equal(published.motion.observedAtMs - published.motion.comparedFromMs, 5 * 60 * 1000)
    assert.ok(fs.existsSync(path.join(radarDir, path.basename(published.motion.path))))

    const meta = writeMeta(radarDir, current.tm, [current.tm], new Map([[current.tm, published]]))
    assert.equal(meta.frames[0].motion.path, published.motion.path)
  } finally {
    await rm(radarDir, { recursive: true, force: true })
  }
})

test('does not attach motion for a gap or a motion-file write failure', () => {
  const previous = input('202607221150', [[11, 12], [12, 12], [11, 13], [12, 13]])
  const current = input('202607221205', [[10, 12]])
  const frame = { tm: current.tm, path: `/data/radar/echo_korea_${current.tm}.png` }

  assert.equal(isAdjacentFrame(previous.tm, current.tm), false)
  assert.deepEqual(attachMotionFrame(os.tmpdir(), frame, previous, current), frame)

  const adjacent = input('202607221155', [[13, 12], [14, 12], [13, 13], [14, 13]])
  const missingDir = path.join(os.tmpdir(), `missing-motion-${process.pid}-${Date.now()}`)
  assert.deepEqual(attachMotionFrame(missingDir, { ...frame, tm: adjacent.tm }, previous, adjacent), { ...frame, tm: adjacent.tm })
})
