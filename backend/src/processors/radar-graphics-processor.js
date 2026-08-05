import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import config from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { KMA_GRAPHIC_PRODUCTS, KMA_GRAPHIC_WISSDOM_STEP_MINUTES, buildImpgRequest, parseImpgResult } from '../lib/kma-radar-graphics.js'

const KMA_ORIGIN = 'https://apihub.kma.go.kr'
const isImage = (value) => Buffer.isBuffer(value) && ((value[0] === 0x89 && value[1] === 0x50 && value[2] === 0x4e && value[3] === 0x47) || (value.subarray(0, 4).toString() === 'RIFF' && value.subarray(8, 12).toString() === 'WEBP'))
const kstTm = (date, stepMinutes = 5) => { const d = new Date(date.getTime() + 9 * 3600000); d.setUTCMinutes(Math.floor(d.getUTCMinutes() / stepMinutes) * stepMinutes, 0, 0); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}` }
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
function writeAtomic(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`; fs.writeFileSync(temp, data); fs.renameSync(temp, file) }
function apiUrl(activeConfig, product, request) { const base = activeConfig.api.radar_graphics_url || `${KMA_ORIGIN}/api/typ03/cgi/rdr`; const query = new URLSearchParams(buildImpgRequest(product, request)); query.set('authKey', activeConfig.api.radar_satellite_auth_key); return `${base.replace(/\/$/, '')}/${KMA_GRAPHIC_PRODUCTS[product].endpoint}?${query}` }
function assetUrl(safePath) { return new URL(safePath, KMA_ORIGIN).toString() }
async function defaultJson(url, timeout, signal) { const response = await fetchWithTimeout(url, timeout, { signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() }
async function defaultImage(url, timeout, signal) { const response = await fetchWithTimeout(url, timeout, { signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return Buffer.from(await response.arrayBuffer()) }
// KMA declares an empty graphics pixel two different ways: WISSDOM composites use opaque
// black, while QPF paints its whole canvas opaque near-white and draws echoes on top. Both
// must drop out, or the layer covers the map. Product palettes are saturated, so neither
// test can swallow real data.
const isDeclaredBackground = (r, g, b) => (r === 0 && g === 0 && b === 0) || (r >= 245 && g >= 245 && b >= 245)
async function normalize(buffer, { stripBackground = true } = {}) {
  if (!isImage(buffer)) throw new Error('invalid image signature')
  // Legends are read as a colour key next to the map, not drawn over it. Their palette runs
  // from white through black, so background removal would erase their labels and swatches.
  if (!stripBackground) return sharp(buffer).webp({ lossless: true }).toBuffer()
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let index = 0; index < data.length; index += 4) if (isDeclaredBackground(data[index], data[index + 1], data[index + 2])) data[index + 3] = 0
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ lossless: true }).toBuffer()
}
function paths(root, type) { const dir = path.join(root, 'radar', type); return { dir, meta: path.join(dir, `${type}_meta.json`) } }
function frameAsset(type, descriptor, extra = '') { const key = type === 'wissdom' ? `${descriptor.heightM}_${descriptor.tm}` : `${descriptor.tm}_p${descriptor.leadMinutes}`; return `${type}_${key}${extra}.webp` }
function clean(dir, meta, maxFrames) {
  const frames = meta.frames || Object.values(meta.framesByHeight || {}).flat()
  const keep = new Set(frames.flatMap((frame) => [path.basename(frame.path), path.basename(frame.legendPath)]))
  for (const filename of fs.readdirSync(dir)) if (/^(wissdom|qpf)_.+\.webp$/.test(filename) && !keep.has(filename)) fs.unlinkSync(path.join(dir, filename))
}
// A frame is blank when nothing survived background removal. The renderer sometimes returns an
// empty canvas for a frame that has data, and the response metadata is identical either way.
const isBlank = async (webp) => { const alpha = (await sharp(webp).stats()).channels[3]; return Boolean(alpha) && alpha.max === 0 }
// ponytail: three tries at ~50% blank leaves ~12% blank; add backoff only if KMA gets worse.
const BLANK_RENDER_ATTEMPTS = 3

async function publish({ root, type, descriptor, image, legend, previous, maxFrames }) {
  const target = paths(root, type); fs.mkdirSync(target.dir, { recursive: true })
  const imageName = frameAsset(type, descriptor), legendName = frameAsset(type, descriptor, '_legend')
  writeAtomic(path.join(target.dir, imageName), image)
  writeAtomic(path.join(target.dir, legendName), legend)
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
  // WISSDOM is published every ten minutes; QPF carries its own analysis time in the response.
  const requestTm = kstTm(delayedNow, type === 'wissdom' ? KMA_GRAPHIC_WISSDOM_STEP_MINUTES : 5)
  const target = paths(root, type), previous = readJson(target.meta)
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
      const zoomLevel = productConfig.image_zoom_level
      const request = type === 'wissdom' ? { tm: requestedTm, heightM: value, zoomLevel } : { tm: requestedTm, leadMinutes: value, zoomLevel }
      const fetchJson = deps.fetchJson || ((url) => defaultJson(url, productConfig.timeout_ms || 30000, signal))
      const fetchImage = deps.fetchImage || ((url) => defaultImage(url, productConfig.timeout_ms || 30000, signal))
      let parsed = null, body = null, legendImage = null
      for (let attempt = 1; attempt <= BLANK_RENDER_ATTEMPTS; attempt += 1) {
        parsed = parseImpgResult(await fetchJson(apiUrl(activeConfig, type, request), { signal }), { product: type, requestedTm, leadMinutes: type === 'qpf' ? value : 0 })
        throwIfAborted(signal)
        // KMA answers with the newest frame it holds, which can lag the requested slot. Accept that
        // frame under its own timestamp; only a timestamp ahead of the request means a wrong answer.
        if (!parsed) break
        if (type === 'wissdom' && (parsed.tm > requestedTm || complete.has(`${value}:${parsed.tm}`))) { parsed = null; break }
        if (type === 'qpf') {
          qpfAnalysisTm ||= parsed.tm
          if (parsed.tm !== qpfAnalysisTm || complete.has(`${parsed.tm}:${value}`) || parsed.validTimeMs !== parsed.timeMs + value * 60000) { parsed = null; break }
        }
        const [image, legend] = await Promise.all([fetchImage(assetUrl(parsed.imagePath), { signal }), fetchImage(assetUrl(parsed.legendPath), { signal })])
        throwIfAborted(signal)
        body = await normalize(image)
        legendImage = await normalize(legend, { stripBackground: false })
        if (!await isBlank(body)) break
      }
      if (!parsed) continue
      parsed.heightM = type === 'wissdom' ? value : null
      await publish({ root, type, descriptor: parsed, image: body, legend: legendImage, previous: readJson(target.meta), maxFrames: productConfig.max_frames || 36 })
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
