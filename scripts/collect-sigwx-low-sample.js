import fs from 'fs'
import path from 'path'
import { fetchSigwxLow } from '../backend/src/api-client.js'
import sigwxLowParser from '../backend/src/parsers/sigwx-low-parser.js'
import { buildSigwxLowTargetImageUrl } from '../backend/src/sigwx-low/sigwx-low-sample-urls.js'
import {
  buildSigwxLowSamplePaths,
  writeSigwxLowSampleManifest,
} from '../backend/src/sigwx-low/sigwx-low-sample-store.js'

const rootDir = path.resolve('reference', 'sigwx_low_samples')
const args = process.argv.slice(2)
const force = args.includes('--force')
const tmfcs = args.filter((arg) => arg !== '--force')

if (tmfcs.length === 0) {
  console.error('Usage: node scripts/collect-sigwx-low-sample.js YYYYMMDDHH [YYYYMMDDHH...]')
  process.exit(1)
}

async function downloadImage(url, outputPath) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Image HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error('Downloaded target image is not a PNG')
  }
  fs.writeFileSync(outputPath, bytes)
}

function hasPngSignature(filePath) {
  if (!fs.existsSync(filePath)) return false
  const bytes = fs.readFileSync(filePath)
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

function hasValidExistingSample(paths) {
  if (!fs.existsSync(paths.sourceXml) || fs.readFileSync(paths.sourceXml, 'utf8').trim().length === 0) return false
  if (!fs.existsSync(paths.parsedJson)) return false
  if (!hasPngSignature(paths.targetPng)) return false
  if (!fs.existsSync(paths.manifestJson)) return false
  JSON.parse(fs.readFileSync(paths.parsedJson, 'utf8'))
  JSON.parse(fs.readFileSync(paths.manifestJson, 'utf8'))
  return true
}

for (const tmfc of tmfcs) {
  const paths = buildSigwxLowSamplePaths(rootDir, tmfc)
  fs.mkdirSync(paths.dir, { recursive: true })

  if (!force && hasValidExistingSample(paths)) {
    console.log(`SIGWX_LOW sample ${tmfc} already exists; use --force to refresh`)
    continue
  }

  const xml = await fetchSigwxLow(tmfc, { maxRetries: 1 })
  fs.writeFileSync(paths.sourceXml, xml, 'utf8')

  const parsed = sigwxLowParser.parse(xml)
  fs.writeFileSync(paths.parsedJson, `${JSON.stringify({
    type: 'sigwx_low',
    tmfc,
    source: {
      mode: parsed.mode,
      map_range_mode: parsed.map_range_mode,
      amd_use: parsed.amd_use,
      amd_hour: parsed.amd_hour,
      amd_min: parsed.amd_min,
      amd_tar_low: parsed.amd_tar_low,
      fpv_safe_bound_width: parsed.fpv_safe_bound_width,
      fpv_safe_bound_height: parsed.fpv_safe_bound_height,
    },
    items: parsed.items,
  }, null, 2)}\n`, 'utf8')

  const imageUrl = buildSigwxLowTargetImageUrl(tmfc)
  await downloadImage(imageUrl, paths.targetPng)
  writeSigwxLowSampleManifest(rootDir, {
    tmfc,
    imageUrl,
    imageStatus: 'ok',
    parsedStatus: 'ok',
    xmlStatus: 'ok',
    captureMethod: 'direct-image-url',
    notes: 'Collected by scripts/collect-sigwx-low-sample.js.',
  })
  console.log(`Collected SIGWX_LOW sample ${tmfc}`)
}
