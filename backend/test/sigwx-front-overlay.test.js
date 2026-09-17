import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { renderSigwxFrontOverlay } from '../src/parsers/sigwx-front-overlay.js'

async function outputDirectory(t) {
  const parent = new URL('../../artifacts/sigwx-render-tests/', import.meta.url)
  await fs.mkdir(parent, { recursive: true })
  const root = await fs.mkdtemp(path.join(parent.pathname, 'front-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

test('stationary front renders alternating blue/red symbols on opposite sides', async (t) => {
  const root = await outputDirectory(t)
  const meta = await renderSigwxFrontOverlay({ tmfc: '2026072205', items: [{
    contour_name: 'font_line', item_name: 'fl_stat', lat_lngs: [[35, 122], [35, 132]],
  }] }, root, 'source-test')
  assert.equal(meta.latest.frontCount, 1)
  assert.equal(meta.latest.variants.length, 3)
  assert.equal(meta.source_hash, 'source-test')
  const { data, info } = await sharp(path.join(root, 'sigwx_low', path.basename(meta.latest.path))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const sides = { redAbove: 0, redBelow: 0, blueAbove: 0, blueBelow: 0 }
  for (let y = 0; y < info.height; y++) {
    if (Math.abs(y - info.height / 2) < 5) continue
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels
      if (data[offset + 3] < 128) continue
      const [r, g, b] = data.subarray(offset, offset + 3)
      const side = y < info.height / 2 ? 'Above' : 'Below'
      if (r > 180 && g < 80 && b < 80) sides[`red${side}`]++
      if (b > 180 && r < 80) sides[`blue${side}`]++
    }
  }
  assert.ok(sides.redAbove > 100)
  assert.ok(sides.blueBelow > 100)
  assert.equal(sides.redBelow, 0)
  assert.equal(sides.blueAbove, 0)
  const measured = []
  for (const variant of meta.latest.variants) {
    const png = await sharp(path.join(root, 'sigwx_low', path.basename(variant.path))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(png.info.width, variant.width)
    const [southWest, northEast] = meta.latest.bounds
    const screenWidth = 512 * 2 ** variant.reference_zoom * (northEast[1] - southWest[1]) / 360
    let maxY = 0
    for (let y = Math.ceil(png.info.height / 2); y < png.info.height; y++) {
      for (let x = 0; x < png.info.width; x++) {
        if (png.data[(y * png.info.width + x) * 4 + 3] > 128) maxY = Math.max(maxY, y)
      }
    }
    measured.push((maxY - png.info.height / 2) * screenWidth / png.info.width)
  }
  assert.ok(measured.every(height => height >= 11 && height <= 15), `triangle height should stay near 13 screen pixels: ${measured}`)
})

test('front renderer includes all four supported types and skips non-front items', async (t) => {
  const root = await outputDirectory(t)
  const items = ['fl_cold', 'fl_worm', 'fl_occl', 'fl_stat'].map((item_name, i) => ({
    contour_name: 'font_line', item_name, lat_lngs: [[32 + i, 122], [32 + i, 132]],
  }))
  items.push({ contour_name: 'pressure', item_name: 'Lx', lat_lngs: [[35, 125]] })
  const meta = await renderSigwxFrontOverlay({ tmfc: '2026072205', items }, root)
  assert.equal(meta.latest.frontCount, 4)
  assert.equal(await renderSigwxFrontOverlay({ items: [items.at(-1)] }, root), null)
})
