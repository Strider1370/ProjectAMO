import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { readKtgCoords, readKtgGridSafe } from '../processors/ktg-store.js'
import { readKimNwpGrid, validateKimNwpSelection } from '../processors/kim-nwp-store.js'

export function mapResourceRevision(...values) {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex')
}

export function readExactWeatherFrame(root, { kind, name, revision } = {}) {
  const valid = kind === 'radar' ? /^echo_korea_\d{12}\.png$/ : kind === 'satellite' ? /^sat_korea_\d{12}\.(?:webp|png)$/ : null
  if (!valid?.test(name ?? '')) return { status: 400, error: 'invalid_frame_selection' }
  let bytes
  try { bytes = fs.readFileSync(path.join(root, kind, name)) }
  catch { return { status: 410, error: 'map_frame_expired' } }
  const actualRevision = createHash('sha256').update(bytes).digest('hex')
  if (revision && revision !== actualRevision) return { status: 410, error: 'map_frame_revision_expired' }
  return { status: 200, bytes, revision: actualRevision, contentType: name.endsWith('.webp') ? 'image/webp' : 'image/png' }
}

export function describeWeatherFrame(root, kind, metadata, nowMs = Date.now()) {
  const frame = metadata?.latest ?? metadata?.nationwide ?? metadata?.frames?.at(-1)
  const name = frame?.path?.split('/').at(-1)
  const time = String(frame?.request_tm_utc ?? frame?.tm ?? '')
  const ms = /^\d{12}$/.test(time)
    ? Date.UTC(+time.slice(0, 4), +time.slice(4, 6) - 1, +time.slice(6, 8), +time.slice(8, 10), +time.slice(10, 12)) - (frame?.request_tm_utc ? 0 : 9 * 3600000)
    : NaN
  const validTime = Number.isFinite(ms) ? new Date(ms).toISOString() : null
  if (!validTime || !name) return { status: 'unavailable', reason: 'frame_metadata_unavailable', validTime }
  if (nowMs - ms > 60 * 60000 || ms - nowMs > 10 * 60000) return { status: 'unavailable', reason: 'frame_stale', validTime }
  const result = readExactWeatherFrame(root, { kind, name })
  if (result.status !== 200) return { status: 'unavailable', reason: result.error, validTime }
  const resourceId = `/api/weather/frame/${kind}/${name}?revision=${result.revision}`
  return { status: 'available', frameId: name, validTime, revision: result.revision, resourceId, url: resourceId, bounds: frame.bounds }
}

export function readExactKtgMapGrid(root, { tmfc, hf, altFt, revision } = {}) {
  if (!/^\d{10}$/.test(String(tmfc ?? '')) || !Number.isInteger(Number(hf)) || Number(hf) < 0 || Number(hf) > 120 || !Number.isInteger(Number(altFt)) || Number(altFt) <= 0 || Number(altFt) > 60000) {
    return { status: 400, error: 'invalid_map_selection' }
  }
  let coords
  let gridData
  try {
    coords = readKtgCoords({ root, tmfc, hf: Number(hf) })
    gridData = readKtgGridSafe({ root, tmfc, hf: Number(hf), altFt: Number(altFt) })
  } catch { return { status: 410, error: 'map_resource_expired' } }
  if (!coords || !gridData) return { status: 410, error: 'map_resource_expired' }
  const actualRevision = mapResourceRevision(coords, gridData)
  if (revision && revision !== actualRevision) return { status: 410, error: 'map_revision_expired' }
  if (gridData.tmfc !== tmfc || Number(gridData.hf) !== Number(hf) || Number(gridData.altFt) !== Number(altFt)) return { status: 410, error: 'map_resource_mismatch' }
  const bounds = { latMin: Infinity, latMax: -Infinity, lonMin: Infinity, lonMax: -Infinity }
  for (const v of coords.lat ?? []) if (Number.isFinite(v)) { bounds.latMin = Math.min(bounds.latMin, v); bounds.latMax = Math.max(bounds.latMax, v) }
  for (const v of coords.lon ?? []) if (Number.isFinite(v)) { bounds.lonMin = Math.min(bounds.lonMin, v); bounds.lonMax = Math.max(bounds.lonMax, v) }
  if (!Object.values(bounds).every(Number.isFinite)) return { status: 410, error: 'map_resource_invalid' }
  return { status: 200, data: {
    altFt: Number(altFt), grid: { ny: coords.ny, nx: coords.nx, ...bounds }, ktg: gridData.ktg,
    run: { tmfc, hf: Number(hf), validTime: gridData.validTime }, revision: actualRevision,
  } }
}

export function readExactKimMapGrid(root, { tmfc, hf, level, revision } = {}) {
  try { validateKimNwpSelection({ tmfc, hf, levelId: level }) }
  catch { return { status: 400, error: 'invalid_map_selection' } }
  let grid
  try { grid = readKimNwpGrid({ root, model: 'KIMG/NE57', tmfc, hf: Number(hf), levelId: level }) }
  catch { return { status: 410, error: 'map_resource_expired' } }
  if (!grid) return { status: 410, error: 'map_resource_expired' }
  const actualRevision = mapResourceRevision(grid)
  if (revision && actualRevision !== revision) return { status: 410, error: 'map_revision_expired' }
  return { status: 200, grid, revision: actualRevision }
}
