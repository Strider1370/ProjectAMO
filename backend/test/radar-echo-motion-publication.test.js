import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import test from 'node:test'

import { attachMotionFrame, isAdjacentFrame, writeMeta } from '../src/processors/radar-echo-processor.js'
import { createMotionInput, deriveMotionGeoJSON } from '../src/processors/radar-motion.js'
import { gridToLatLon } from '../src/parsers/radar-echo-parser.js'
import config from '../src/config.js'

const geometry = { nx: 32, ny: 32 }

function input(tm, cells) {
  const refl = new Int16Array(geometry.nx * geometry.ny)
  for (const [x, y] of cells) refl[y * geometry.nx + x] = 4200
  return createMotionInput(refl, geometry, { tm, stride: 1 })
}

// attachMotionFrame이 config.radar_echo_motion으로 만드는 settings와 동일 — 벡터가 실제로
// 나오는지 배선 밖에서 미리 확인할 때만 쓴다.
function motionSettings() {
  return {
    settings: {
      workStride: config.radar_echo_motion.work_stride,
      patchRadiusKm: config.radar_echo_motion.patch_radius_km,
      spacingKm: config.radar_echo_motion.spacing_km,
      maxSpeedKmh: config.radar_echo_motion.max_speed_kmh,
      minSpeedKt: config.radar_echo_motion.min_speed_kt,
      edgeLookaheadKm: config.radar_echo_motion.edge_lookahead_km,
      minReflectivity: config.radar_echo_motion.min_reflectivity,
      frameIntervalMs: 5 * 60 * 1000,
    },
    gridToLatLon,
  }
}

// 실제 배선(attachMotionFrame)은 config.radar_echo_motion의 실측 값(work_stride 4 등)으로
// settings를 만든다 — 원시 격자가 그 스케일에 맞을 만큼 커야 벡터가 나온다. 넓은 가우시안
// 에코 덩이 하나를 동쪽으로 옮겨 앞면 화살표가 뜨는지만 확인한다.
const blobGeometry = { nx: 320, ny: 320 }
function blobInput(tm, offsetX, offsetY) {
  const { nx, ny } = blobGeometry
  const refl = new Int16Array(nx * ny)
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const d2 = (x - offsetX - 160) ** 2 + (y - offsetY - 160) ** 2
      refl[y * nx + x] = Math.round(6000 * Math.exp(-d2 / 3200))
    }
  }
  return createMotionInput(refl, blobGeometry, { tm, stride: 4 })
}

test('publishes exact-adjacent motion atomically without blocking frame metadata', async () => {
  const radarDir = await mkdtemp(path.join(os.tmpdir(), 'radar-motion-publication-'))
  try {
    const previous = blobInput('202607221200', 0, 0)
    const current = blobInput('202607221205', 12, 0)
    const frame = { tm: current.tm, path: `/data/radar/echo_korea_${current.tm}.png` }
    const published = attachMotionFrame(radarDir, frame, previous, current)

    assert.ok(published.motion)
    assert.equal(published.motion.observedAtMs - published.motion.comparedFromMs, 5 * 60 * 1000)
    assert.ok(fs.existsSync(path.join(radarDir, path.basename(published.motion.path))))
    const geojson = JSON.parse(fs.readFileSync(path.join(radarDir, path.basename(published.motion.path)), 'utf8'))
    assert.ok(geojson.features.length > 0)
    for (const feature of geojson.features) assert.equal(feature.geometry.type, 'Point')

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

  const missingPrevious = blobInput('202607221150', 0, 0)
  const missingCurrent = blobInput('202607221155', 12, 0)
  const missingDir = path.join(os.tmpdir(), `missing-motion-${process.pid}-${Date.now()}`)
  const missingFrame = { tm: missingCurrent.tm, path: `/data/radar/echo_korea_${missingCurrent.tm}.png` }
  // writeAtomic이 정말 실패하는지(디렉터리 부재) 확인하려면 벡터가 먼저 나와야 한다 —
  // features가 0이면 attachMotionFrame이 그 전에 조기 반환해 catch 경로를 지나지 않는다.
  assert.ok(deriveMotionGeoJSON(missingPrevious, missingCurrent, motionSettings()).features.length > 0)
  assert.deepEqual(attachMotionFrame(missingDir, missingFrame, missingPrevious, missingCurrent), missingFrame)
})
