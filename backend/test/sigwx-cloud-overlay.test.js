import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildCbBoundaryPath, renderSigwxCloudOverlay } from '../src/parsers/sigwx-cloud-overlay.js'
import { SIGWX_ZOOM_LEVELS } from '../src/parsers/sigwx-overlay-zoom.js'

const ring = [{ x: 70, y: 70 }, { x: 430, y: 70 }, { x: 430, y: 430 }, { x: 70, y: 430 }]

async function rasterize(points, repeat) {
  const d = buildCbBoundaryPath(points, repeat)
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><path d="${d}" fill="none" stroke="black" stroke-width="6.2" stroke-linejoin="round" /></svg>`))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
}

function isCenterReachableFromOutside({ data, info }) {
  const { width, height, channels } = info
  const visited = new Uint8Array(width * height)
  const queue = [0]
  visited[0] = 1
  for (let i = 0; i < queue.length; i++) {
    const index = queue[i]
    const x = index % width
    const y = Math.floor(index / width)
    if (x === 250 && y === 250) return true
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const next = ny * width + nx
      if (visited[next] || data[next * channels + channels - 1] > 32) continue
      visited[next] = 1
      queue.push(next)
    }
  }
  return false
}

test('CB boundary encloses its interior without a gap at the closing edge', async () => {
  // Changing the starting vertex moves the seam to every corner of the same ring.
  for (let i = 0; i < ring.length; i++) {
    const shifted = [...ring.slice(i), ...ring.slice(0, i)]
    for (const points of [shifted, [...shifted].reverse()]) {
      assert.equal(isCenterReachableFromOutside(await rasterize(points)), false)
    }
  }
})

test('CB scallops protrude outward with either coordinate winding', async () => {
  for (const points of [ring, [...ring].reverse()]) {
    const { data, info } = await rasterize(points)
    const markedPixels = []
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * info.channels + info.channels - 1] > 32) markedPixels.push([x, y])
      }
    }
    assert.ok(markedPixels.some(([x, y]) => x > 150 && x < 350 && y < 60))
    assert.ok(markedPixels.some(([x, y]) => x > 150 && x < 350 && y > 440))
  }
})

test('duplicate points and an explicit closing point do not change CB geometry', () => {
  assert.equal(buildCbBoundaryPath([ring[0], ...ring, ring[0]]), buildCbBoundaryPath(ring))
})

test('all scallop sizes close the ring and preserve winding and duplicate-point behavior', async () => {
  for (const repeat of [14, 36, 80]) {
    for (const points of [ring, [...ring].reverse()]) {
      const d = buildCbBoundaryPath(points, repeat)
      assert.equal(isCenterReachableFromOutside(await rasterize(points, repeat)), false)
      assert.equal(buildCbBoundaryPath([...points, points[0]], repeat), d)
      const radii = [...d.matchAll(/ A([\d.]+)/g)].map(match => Number(match[1]))
      assert.ok(radii.every(radius => radius > 0 && radius < repeat * 0.6))
    }
  }
  for (const repeat of [0, -1, NaN, Infinity]) assert.equal(buildCbBoundaryPath(ring, repeat), '')
})

test('CB renderer publishes three zoom images sharing chart bounds', async (t) => {
  const parent = new URL('../../artifacts/sigwx-render-tests/', import.meta.url)
  await fs.mkdir(parent, { recursive: true })
  const root = await fs.mkdtemp(path.join(parent.pathname, 'cloud-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const meta = await renderSigwxCloudOverlay({ tmfc: '2026072205', items: [{
    item_type: 4, contour_name: 'cld', item_name: 'cloud', label: 'ISOL&#10;CB',
    lat_lngs: [[32, 123], [36, 123], [36, 131], [32, 131]],
  }] }, root, 'cb-test')
  assert.equal(meta.source_hash, 'cb-test')
  assert.equal(meta.latest.cloudCount, 1)
  assert.deepEqual(meta.latest.variants.map(({ id, minzoom, maxzoom, reference_zoom }) => ({ id, minzoom, maxzoom, reference_zoom })), SIGWX_ZOOM_LEVELS)
  for (const variant of meta.latest.variants) {
    const png = await sharp(path.join(root, 'sigwx_low', path.basename(variant.path))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(png.info.width, variant.width)
    assert.equal(png.info.height, variant.height)
    assert.ok(png.data.some((value, index) => index % 4 === 3 && value > 32), 'boundary is not empty')
    assert.equal(png.data[3], 0, 'background stays transparent')
  }
  assert.equal(new Set(meta.latest.variants.map(v => v.path)).size, 3)
  assert.equal(await renderSigwxCloudOverlay({ items: [] }, root), null)
})

test('empty, non-finite and degenerate rings produce no stray arcs', () => {
  for (const points of [[], [ring[0]], [ring[0], ring[0], ring[0]], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], [...ring, { x: NaN, y: 0 }]]) {
    assert.equal(buildCbBoundaryPath(points), '')
  }
})
