import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(new URL('../backend/package.json', import.meta.url))
const sharp = require('sharp')

const tmfc = process.argv[2]
const renderedPath = process.argv[3]

if (!tmfc || !renderedPath) {
  console.error('Usage: node scripts/compare-sigwx-low-sample.js YYYYMMDDHH rendered.png')
  process.exit(1)
}

const targetPath = path.resolve('reference', 'sigwx_low_samples', tmfc, 'target.png')
const outputPath = path.resolve('reference', 'sigwx_low_samples', tmfc, 'diff.png')

if (!fs.existsSync(targetPath)) throw new Error(`Missing target image: ${targetPath}`)
if (!fs.existsSync(renderedPath)) throw new Error(`Missing rendered image: ${renderedPath}`)

const target = sharp(targetPath).resize(1100, 780, { fit: 'contain', background: '#ffffff' })
const rendered = sharp(renderedPath).resize(1100, 780, { fit: 'contain', background: '#ffffff' })
const targetBuffer = await target.raw().toBuffer({ resolveWithObject: true })
const renderedBuffer = await rendered.raw().toBuffer({ resolveWithObject: true })

let changed = 0
const diff = Buffer.alloc(targetBuffer.data.length)
for (let i = 0; i < targetBuffer.data.length; i += targetBuffer.info.channels) {
  const dr = Math.abs(targetBuffer.data[i] - renderedBuffer.data[i])
  const dg = Math.abs(targetBuffer.data[i + 1] - renderedBuffer.data[i + 1])
  const db = Math.abs(targetBuffer.data[i + 2] - renderedBuffer.data[i + 2])
  const isChanged = dr + dg + db > 80
  if (isChanged) changed += 1
  diff[i] = 255
  diff[i + 1] = isChanged ? 0 : 255
  diff[i + 2] = isChanged ? 0 : 255
  if (targetBuffer.info.channels === 4) diff[i + 3] = 255
}

await sharp(diff, {
  raw: {
    width: targetBuffer.info.width,
    height: targetBuffer.info.height,
    channels: targetBuffer.info.channels,
  },
}).png().toFile(outputPath)

const total = targetBuffer.info.width * targetBuffer.info.height
console.log(JSON.stringify({
  tmfc,
  changedPixels: changed,
  totalPixels: total,
  changedRatio: changed / total,
  diffPath: outputPath,
}, null, 2))
