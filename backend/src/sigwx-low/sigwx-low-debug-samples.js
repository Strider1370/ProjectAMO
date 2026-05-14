import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildSigwxLowPhenomena } from './sigwx-low-phenomena.js'
import { buildSigwxSpecialLineFeatures } from './sigwx-low-special-lines.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DEFAULT_SAMPLE_ROOT = path.join(REPO_ROOT, 'reference', 'sigwx_low_samples')

function sampleDir(rootDir, tmfc) {
  return path.join(rootDir, String(tmfc))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

export function listSigwxLowDebugSamples(rootDir = DEFAULT_SAMPLE_ROOT) {
  if (!fs.existsSync(rootDir)) return []
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{10}$/.test(entry.name))
    .map((entry) => {
      const dir = sampleDir(rootDir, entry.name)
      const parsedPath = path.join(dir, 'parsed.json')
      const targetPath = path.join(dir, 'target.png')
      if (!fs.existsSync(parsedPath) || !fs.existsSync(targetPath)) return null
      const parsed = readJson(parsedPath)
      return {
        tmfc: entry.name,
        itemCount: Array.isArray(parsed.items) ? parsed.items.length : 0,
        targetImageUrl: `/api/debug/sigwx-low-samples/${entry.name}/target.png`,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.tmfc.localeCompare(a.tmfc))
}

export function buildSigwxLowDebugSamplePayload(tmfc, rootDir = DEFAULT_SAMPLE_ROOT) {
  const normalized = String(tmfc || '').trim()
  if (!/^\d{10}$/.test(normalized)) {
    const error = new Error('Invalid SIGWX_LOW debug sample tmfc')
    error.statusCode = 400
    throw error
  }

  const dir = sampleDir(rootDir, normalized)
  const parsedPath = path.join(dir, 'parsed.json')
  const targetPath = path.join(dir, 'target.png')
  if (!fs.existsSync(parsedPath) || !fs.existsSync(targetPath)) {
    const error = new Error('SIGWX_LOW debug sample not found')
    error.statusCode = 404
    throw error
  }

  const parsed = readJson(parsedPath)
  const payload = {
    ...parsed,
    tmfc: parsed.tmfc || normalized,
    debugSample: {
      tmfc: normalized,
      targetImageUrl: `/api/debug/sigwx-low-samples/${normalized}/target.png`,
    },
  }
  payload.phenomena = buildSigwxLowPhenomena(payload)
  payload.specialLineFeatures = buildSigwxSpecialLineFeatures(payload)
  return payload
}

export function resolveSigwxLowDebugTargetPath(tmfc, rootDir = DEFAULT_SAMPLE_ROOT) {
  const normalized = String(tmfc || '').trim()
  if (!/^\d{10}$/.test(normalized)) return null
  const targetPath = path.join(sampleDir(rootDir, normalized), 'target.png')
  return fs.existsSync(targetPath) ? targetPath : null
}
