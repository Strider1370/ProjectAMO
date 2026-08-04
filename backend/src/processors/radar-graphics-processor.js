import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import config from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { KMA_GRAPHIC_PRODUCTS, buildImpgRequest, parseImpgResult } from '../lib/kma-radar-graphics.js'

const KMA_ORIGIN = 'https://apihub.kma.go.kr'
const isImage = (value) => Buffer.isBuffer(value) && ((value[0] === 0x89 && value[1] === 0x50 && value[2] === 0x4e && value[3] === 0x47) || (value.subarray(0, 4).toString() === 'RIFF' && value.subarray(8, 12).toString() === 'WEBP'))
const kstTm = (date) => { const d = new Date(date.getTime() + 9 * 3600000); d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5, 0, 0); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}` }
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
function writeAtomic(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`; fs.writeFileSync(temp, data); fs.renameSync(temp, file) }
function apiUrl(activeConfig, product, request) { const base = activeConfig.api.radar_graphics_url || `${KMA_ORIGIN}/api/typ03/cgi/rdr`; const query = new URLSearchParams(buildImpgRequest(product, request)); query.set('authKey', activeConfig.api.radar_satellite_auth_key); return `${base.replace(/\/$/, '')}/${KMA_GRAPHIC_PRODUCTS[product].endpoint}?${query}` }
function assetUrl(safePath) { return new URL(safePath, KMA_ORIGIN).toString() }
async function defaultJson(url, timeout, signal) { const response = await fetchWithTimeout(url, timeout, { signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() }
async function defaultImage(url, timeout, signal) { const response = await fetchWithTimeout(url, timeout, { signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return Buffer.from(await response.arrayBuffer()) }
async function normalize(buffer) {
  if (!isImage(buffer)) throw new Error('invalid image signature')
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // KMA graphics use opaque black as their declared empty/background pixel; retain all coloured pixels.
  for (let index = 0; index < data.length; index += 4) if (data[index] === 0 && data[index + 1] === 0 && data[index + 2] === 0) data[index + 3] = 0
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ lossless: true }).toBuffer()
}
function paths(root, type) { const dir = path.join(root, 'radar', type); return { dir, meta: path.join(dir, `${type}_meta.json`) } }
function frameAsset(type, descriptor, extra = '') { const key = type === 'wissdom' ? `${descriptor.heightM}_${descriptor.tm}` : `${descriptor.tm}_p${descriptor.leadMinutes}`; return `${type}_${key}${extra}.webp` }
function clean(dir, meta, maxFrames) {
  const frames = meta.frames || Object.values(meta.framesByHeight || {}).flat()
  const keep = new Set(frames.flatMap((frame) => [path.basename(frame.path), path.basename(frame.legendPath)]))
  for (const filename of fs.readdirSync(dir)) if (/^(wissdom|qpf)_.+\.webp$/.test(filename) && !keep.has(filename)) fs.unlinkSync(path.join(dir, filename))
}
async function publish({ root, type, descriptor, image, legend, previous, maxFrames }) {
  const target = paths(root, type); fs.mkdirSync(target.dir, { recursive: true })
  const imageName = frameAsset(type, descriptor), legendName = frameAsset(type, descriptor, '_legend')
  writeAtomic(path.join(target.dir, imageName), await normalize(image))
  writeAtomic(path.join(target.dir, legendName), await normalize(legend))
  const frame = { tm: descriptor.tm, timeMs: descriptor.timeMs, analysisTimeMs: descriptor.timeMs, validTimeMs: descriptor.validTimeMs, leadMinutes: descriptor.leadMinutes, heightM: descriptor.heightM, bounds: descriptor.bounds, projectedBounds: descriptor.projectedBounds, path: `/data/radar/${type}/${imageName}`, legendPath: `/data/radar/${type}/${legendName}`, title: descriptor.title, source: 'KMA' }
  let meta
  if (type === 'wissdom') {
    const byHeight = { ...(previous?.framesByHeight || {}) }, key = String(descriptor.heightM)
    const frames = [...(byHeight[key] || []).filter((item) => item.tm !== frame.tm), frame].sort((a, b) => a.tm.localeCompare(b.tm)).slice(-maxFrames)
    byHeight[key] = frames
    meta = { type: 'WISSDOM', updatedAt: new Date().toISOString(), framesByHeight: byHeight }
  } else {
    const frames = [...(previous?.frames || []).filter((item) => !(item.tm === frame.tm && item.leadMinutes === frame.leadMinutes)), frame].sort((a, b) => a.validTimeMs - b.validTimeMs).slice(-maxFrames)
    meta = { type: 'QPF', updatedAt: new Date().toISOString(), frames }
  }
  writeAtomic(target.meta, `${JSON.stringify(meta, null, 2)}\n`)
  clean(target.dir, meta, maxFrames)
  return meta
}
function throwIfAborted(signal) { if (signal?.aborted) throw signal.reason || new Error('collection aborted') }
async function collect(type, { now = new Date(), deps = {}, signal } = {}) {
  const activeConfig = deps.config || config, productConfig = activeConfig.radar_graphics || {}
  if (productConfig.enabled === false || !activeConfig.api?.radar_satellite_auth_key) return { type, saved: false }
  const root = deps.root || activeConfig.storage.base_path
  const delayedNow = type === 'wissdom'
    ? new Date(now.getTime() - (productConfig.delay_minutes || 10) * 60_000)
    : now
  const requestTm = kstTm(delayedNow), target = paths(root, type), previous = readJson(target.meta)
  const units = type === 'wissdom' ? productConfig.wissdom_heights_m : productConfig.qpf_lead_minutes
  const published = (item) => fs.existsSync(path.join(root, item.path.replace(/^\/data\//, '')))
    && fs.existsSync(path.join(root, item.legendPath.replace(/^\/data\//, '')))
  const complete = type === 'wissdom'
    ? new Set(Object.values(previous?.framesByHeight || {}).flat().filter(published).map((item) => `${item.heightM}:${item.tm}`))
    : new Set((previous?.frames || []).filter(published).map((item) => `${item.tm}:${item.leadMinutes}`))
  let saved = false
  let qpfAnalysisTm = null
  for (const value of units || []) {
    throwIfAborted(signal)
    const requestedTm = type === 'qpf' && qpfAnalysisTm ? qpfAnalysisTm : requestTm
    const key = `${type === 'wissdom' ? value : requestedTm}:${type === 'wissdom' ? requestedTm : value}`
    if (type === 'wissdom' && complete.has(key)) continue
    try {
      const request = type === 'wissdom' ? { tm: requestedTm, heightM: value } : { tm: requestedTm, leadMinutes: value }
      const fetchJson = deps.fetchJson || ((url) => defaultJson(url, productConfig.timeout_ms || 30000, signal))
      const fetchImage = deps.fetchImage || ((url) => defaultImage(url, productConfig.timeout_ms || 30000, signal))
      const parsed = parseImpgResult(await fetchJson(apiUrl(activeConfig, type, request), { signal }), { product: type, requestedTm, leadMinutes: type === 'qpf' ? value : 0 })
      throwIfAborted(signal)
      if (!parsed || (type === 'wissdom' && parsed.tm !== requestedTm)) continue
      if (type === 'qpf') {
        qpfAnalysisTm ||= parsed.tm
        if (parsed.tm !== qpfAnalysisTm || complete.has(`${parsed.tm}:${value}`) || parsed.validTimeMs !== parsed.timeMs + value * 60000) continue
      }
      parsed.heightM = type === 'wissdom' ? value : null
      const [image, legend] = await Promise.all([fetchImage(assetUrl(parsed.imagePath), { signal }), fetchImage(assetUrl(parsed.legendPath), { signal })])
      throwIfAborted(signal)
      await publish({ root, type, descriptor: parsed, image, legend, previous: readJson(target.meta), maxFrames: productConfig.max_frames || 36 })
      saved = true
    } catch (error) {
      if (signal?.aborted) throw error
      /* Last successful metadata remains the published view. */
    }
  }
  return { type, saved }
}

export const processWissdom = (options) => collect('wissdom', options)
export const processQpf = (options) => collect('qpf', options)
export default { processWissdom, processQpf }
