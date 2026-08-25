import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'

import { renderFogImage } from '../src/parsers/satellite-parser.js'

const parsedIr = {
  data: new Uint16Array([200]),
  attrs: { width: 1, height: 1, pixelSize: 10_000_000, ulEasting: 1_000_000, ulNorthing: 1_000_000 },
}

test('IR and fog pixels are opaque', async () => {
  const ir = await renderFogImage(parsedIr, { fogData: null, delFta: null })
  const irPixels = await sharp(ir.pngBuffer).raw().toBuffer()
  assert.equal(irPixels[3], 255)

  const fog = await renderFogImage(parsedIr, { fogData: new Uint8Array([5]), delFta: new Int16Array([0]) })
  const fogPixels = await sharp(fog.pngBuffer).raw().toBuffer()
  assert.equal(fogPixels[3], 255)
})
