import fs from 'node:fs'
import path from 'node:path'

import { KTG_ALT_LEVELS_FT } from './ktg-model.js'

const ROOT_DIR = 'ktg'

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'))
}

function writeJsonAtomic(fp, payload) {
  fs.mkdirSync(path.dirname(fp), { recursive: true })
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, 'utf8')
  fs.renameSync(tmp, fp)
}

export function resolveKtgRoot(root) {
  return path.join(root, ROOT_DIR)
}

export function resolveKtgRunDir({ root, tmfc }) {
  return path.join(resolveKtgRoot(root), 'runs', tmfc)
}

export function resolveKtgHfDir({ root, tmfc, hf }) {
  return path.join(resolveKtgRunDir({ root, tmfc }), `hf${String(Number(hf)).padStart(3, '0')}`)
}

export function resolveKtgCoordsPath({ root, tmfc, hf }) {
  return path.join(resolveKtgHfDir({ root, tmfc, hf }), 'coords.json')
}

export function resolveKtgCompletionPath({ root, tmfc, hf }) {
  return path.join(resolveKtgHfDir({ root, tmfc, hf }), 'complete.json')
}

export function resolveKtgGridPath({ root, tmfc, hf, altFt }) {
  return path.join(resolveKtgHfDir({ root, tmfc, hf }), `${altFt}ft`, 'grid.json')
}

export function writeKtgGrid({ root, grid }) {
  writeJsonAtomic(resolveKtgGridPath({ root, tmfc: grid.tmfc, hf: grid.hf, altFt: grid.altFt }), grid)
}

export function writeKtgCoords({ root, tmfc, hf, coords }) {
  writeJsonAtomic(resolveKtgCoordsPath({ root, tmfc, hf }), coords)
}

// This marker is deliberately KTG-local.  It records the altitude set emitted
// from one NetCDF payload only after every corresponding grid has been written.
export function writeKtgHfCompletion({ root, tmfc, hf, altLevelsFt }) {
  writeJsonAtomic(resolveKtgCompletionPath({ root, tmfc, hf }), {
    type: 'ktg_hf_completion',
    tmfc,
    hf: Number(hf),
    altLevelsFt: [...new Set(altLevelsFt.map(Number))].sort((a, b) => a - b),
  })
}

export function clearKtgHfCompletion({ root, tmfc, hf }) {
  fs.rmSync(resolveKtgCompletionPath({ root, tmfc, hf }), { force: true })
}

export function writeKtgIndex(root, index) {
  writeJsonAtomic(path.join(resolveKtgRoot(root), 'index.json'), index)
}

export function writeKtgLatest(root, latest) {
  writeJsonAtomic(path.join(resolveKtgRoot(root), 'latest.json'), latest)
}

export function readKtgGridSafe({ root, tmfc, hf, altFt }) {
  try {
    return readJson(resolveKtgGridPath({ root, tmfc, hf, altFt }))
  } catch {
    return null
  }
}

export function readKtgCoords({ root, tmfc, hf }) {
  const fp = resolveKtgCoordsPath({ root, tmfc, hf })
  if (!fs.existsSync(fp)) return null
  return readJson(fp)
}

export function readKtgHfCompletion({ root, tmfc, hf }) {
  const fp = resolveKtgCompletionPath({ root, tmfc, hf })
  if (!fs.existsSync(fp)) return null
  return readJson(fp)
}

function isFiniteArray(values, expectedLength) {
  return Array.isArray(values) && values.length === expectedLength && values.every(Number.isFinite)
}

function isUsableCoords(coords) {
  const size = Number(coords?.ny) * Number(coords?.nx)
  return Number.isInteger(Number(coords?.ny)) && Number(coords.ny) > 0 &&
    Number.isInteger(Number(coords?.nx)) && Number(coords.nx) > 0 &&
    Number.isSafeInteger(size) && size > 0 &&
    isFiniteArray(coords.lat, size) && isFiniteArray(coords.lon, size)
}

function isUsableGrid(grid, { tmfc, hf, altFt, coords }) {
  const size = Number(coords.ny) * Number(coords.nx)
  return grid?.type === 'ktg_grid' && grid.tmfc === tmfc && Number(grid.hf) === Number(hf) &&
    Number(grid.altFt) === Number(altFt) && Number(grid?.grid?.ny) === Number(coords.ny) &&
    Number(grid?.grid?.nx) === Number(coords.nx) && Array.isArray(grid.ktg) && grid.ktg.length === size &&
    grid.ktg.every((value) => value === null || Number.isFinite(value))
}

function normalizedAltLevels(values) {
  if (!Array.isArray(values) || values.length === 0) return null
  const levels = [...new Set(values.map(Number))].sort((a, b) => a - b)
  return levels.every((level) => Number.isInteger(level) && level > 0) ? levels : null
}

// A legacy KTG run has no completion marker.  It is complete only when its
// historical, fixed altitude set is usable; index.json is a publication view,
// never completion proof for a run directory.
export function isKtgHfComplete({ root, tmfc, hf }) {
  let coords
  let completion
  try {
    coords = readKtgCoords({ root, tmfc, hf })
    completion = readKtgHfCompletion({ root, tmfc, hf })
  } catch {
    return false
  }
  if (!isUsableCoords(coords)) return false

  const markerLevels = completion?.type === 'ktg_hf_completion' && completion.tmfc === tmfc &&
    Number(completion.hf) === Number(hf) ? normalizedAltLevels(completion.altLevelsFt) : null
  const altLevelsFt = markerLevels ?? KTG_ALT_LEVELS_FT

  return altLevelsFt.every((altFt) => {
    const grid = readKtgGridSafe({ root, tmfc, hf, altFt })
    return isUsableGrid(grid, { tmfc, hf, altFt, coords })
  })
}

export function readKtgIndex(root) {
  const fp = path.join(resolveKtgRoot(root), 'index.json')
  if (!fs.existsSync(fp)) return null
  return readJson(fp)
}

export function readKtgLatest(root) {
  const fp = path.join(resolveKtgRoot(root), 'latest.json')
  if (!fs.existsSync(fp)) return null
  return readJson(fp)
}

export function listKtgRuns(root) {
  const runsDir = path.join(resolveKtgRoot(root), 'runs')
  if (!fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => b.localeCompare(a))
}

export function cleanupKtgRuns({ root, maxRuns, latestTmfc }) {
  const limit = Number(maxRuns)
  if (!Number.isFinite(limit) || limit <= 0) return
  const runs = listKtgRuns(root)
  const keep = new Set(runs.slice(0, limit))
  if (latestTmfc) keep.add(latestTmfc)
  const runsDir = path.join(resolveKtgRoot(root), 'runs')
  for (const r of runs) {
    if (keep.has(r)) continue
    fs.rmSync(path.join(runsDir, r), { recursive: true, force: true })
  }
}

export default {
  clearKtgHfCompletion,
  cleanupKtgRuns,
  isKtgHfComplete,
  listKtgRuns,
  readKtgCoords,
  readKtgHfCompletion,
  readKtgGridSafe,
  readKtgIndex,
  readKtgLatest,
  resolveKtgCompletionPath,
  resolveKtgCoordsPath,
  resolveKtgGridPath,
  writeKtgHfCompletion,
  writeKtgCoords,
  writeKtgGrid,
  writeKtgIndex,
  writeKtgLatest,
}
