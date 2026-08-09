import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import config from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { KMA_GRAPHIC_PRODUCTS, KMA_GRAPHIC_WISSDOM_STEP_MINUTES, buildImpgRequest, parseImpgResult } from '../lib/kma-radar-graphics.js'
import { reprojectToMercator } from '../lib/kma-graphics-projection.js'

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
async function normalize(buffer, { stripBackground = true, projected = null, bounds = null } = {}) {
  if (!isImage(buffer)) throw new Error('invalid image signature')
  // Legends are read as a colour key next to the map, not drawn over it. Their palette runs
  // from white through black, so background removal would erase their labels and swatches.
  if (!stripBackground) return sharp(buffer).webp({ lossless: true }).toBuffer()
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let index = 0; index < data.length; index += 4) if (isDeclaredBackground(data[index], data[index + 1], data[index + 2])) data[index + 3] = 0
  // KMA가 그려 보내는 그림은 람베르트 원추도법이다. 위경도 상자에 그대로 붙이면 지점에 따라
  // 100~350 km까지 어긋나므로(공항 기준 실측) 지도와 같은 메르카토르로 다시 표본화한다.
  const raster = projected && bounds
    ? reprojectToMercator({ data, width: info.width, height: info.height }, projected, bounds)
    : { data, width: info.width, height: info.height }
  return sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: 4 } }).webp({ lossless: true }).toBuffer()
}
function paths(root, type) { const dir = path.join(root, 'radar', type); return { dir, meta: path.join(dir, `${type}_meta.json`) } }
const kindOf = (type) => KMA_GRAPHIC_PRODUCTS[type]?.kind || 'single'
function frameAsset(type, descriptor, extra = '') {
  const kind = kindOf(type)
  const key = kind === 'height' ? `${descriptor.heightM}_${descriptor.tm}`
    : kind === 'lead' ? `${descriptor.tm}_p${descriptor.leadMinutes}`
    : descriptor.tm
  return `${type}_${key}${extra}.webp`
}
function clean(dir, meta) {
  const frames = meta.frames || Object.values(meta.framesByHeight || {}).flat()
  const keep = new Set(frames.flatMap((frame) => [path.basename(frame.path), path.basename(frame.legendPath)]))
  for (const filename of fs.readdirSync(dir)) if (/^(wissdom|qpf|hsr|hci)_.+\.webp$/.test(filename) && !keep.has(filename)) fs.unlinkSync(path.join(dir, filename))
}
// 빈 그림은 실패가 아니다 — 맑은 날 WISSDOM·QPF는 원래 비어 있다. 자료 부재를 재시도 사유로
// 삼으면 맑은 날 내내 모든 산출물을 3배로 받게 된다(레이더/위성 키 일일 한도 초과의 한 원인).
// 재시도는 응답 자체가 없을 때만 하고, 그 판단은 parseImpgResult가 null을 주는 경로가 맡는다.

async function publish({ root, type, descriptor, image, legend, previous, maxFrames }) {
  const target = paths(root, type); fs.mkdirSync(target.dir, { recursive: true })
  const imageName = frameAsset(type, descriptor), legendName = frameAsset(type, descriptor, '_legend')
  writeAtomic(path.join(target.dir, imageName), image)
  writeAtomic(path.join(target.dir, legendName), legend)
  const frame = { tm: descriptor.tm, timeMs: descriptor.timeMs, analysisTimeMs: descriptor.timeMs, validTimeMs: descriptor.validTimeMs, leadMinutes: descriptor.leadMinutes, heightM: descriptor.heightM, bounds: descriptor.bounds, projectedBounds: descriptor.projectedBounds, path: `/data/radar/${type}/${imageName}`, legendPath: `/data/radar/${type}/${legendName}`, title: descriptor.title, source: 'KMA' }
  const kind = kindOf(type)
  let meta
  if (kind === 'height') {
    const byHeight = { ...(previous?.framesByHeight || {}) }, key = String(descriptor.heightM)
    const frames = [...(byHeight[key] || []).filter((item) => item.tm !== frame.tm), frame].sort((a, b) => a.tm.localeCompare(b.tm)).slice(-maxFrames)
    byHeight[key] = frames
    meta = { type: 'WISSDOM', updatedAt: new Date().toISOString(), framesByHeight: byHeight }
  } else if (kind === 'lead') {
    const frames = [...(previous?.frames || []).filter((item) => !(item.tm === frame.tm && item.leadMinutes === frame.leadMinutes)), frame].sort((a, b) => a.validTimeMs - b.validTimeMs).slice(-maxFrames)
    meta = { type: 'QPF', updatedAt: new Date().toISOString(), frames }
  } else {
    // 시각당 그림 한 장 — 관측이므로 분석시각 순으로 쌓기만 한다.
    const frames = [...(previous?.frames || []).filter((item) => item.tm !== frame.tm), frame].sort((a, b) => a.tm.localeCompare(b.tm)).slice(-maxFrames)
    meta = { type: type.toUpperCase(), updatedAt: new Date().toISOString(), frames }
  }
  writeAtomic(target.meta, `${JSON.stringify(meta, null, 2)}\n`)
  clean(target.dir, meta)
  return meta
}
function throwIfAborted(signal) { if (signal?.aborted) throw signal.reason || new Error('collection aborted') }
async function collect(type, { now = new Date(), deps = {}, signal } = {}) {
  const activeConfig = deps.config || config, productConfig = activeConfig.radar_graphics || {}
  if (productConfig.enabled === false || !activeConfig.api?.radar_satellite_auth_key) return { type, saved: false }
  const root = deps.root || activeConfig.storage.base_path
  const kind = kindOf(type)
  const delayedNow = kind === 'lead' ? now : new Date(now.getTime() - (productConfig.delay_minutes || 10) * 60_000)
  // WISSDOM and the composites publish every ten minutes; QPF carries its own analysis time.
  const requestTm = kstTm(delayedNow, kind === 'lead' ? 5 : KMA_GRAPHIC_WISSDOM_STEP_MINUTES)
  const target = paths(root, type), previous = readJson(target.meta)
  // 'single'은 고도도 예측시간도 없다 — 한 바퀴만 돌리려고 자리표시자 하나를 넣는다.
  const units = kind === 'height' ? productConfig.wissdom_heights_m
    : kind === 'lead' ? productConfig.qpf_lead_minutes
    : [null]
  const published = (item) => fs.existsSync(path.join(root, item.path.replace(/^\/data\//, '')))
    && fs.existsSync(path.join(root, item.legendPath.replace(/^\/data\//, '')))
  const complete = kind === 'height'
    ? new Set(Object.values(previous?.framesByHeight || {}).flat().filter(published).map((item) => `${item.heightM}:${item.tm}`))
    : kind === 'lead'
      ? new Set((previous?.frames || []).filter(published).map((item) => `${item.tm}:${item.leadMinutes}`))
      : new Set((previous?.frames || []).filter(published).map((item) => item.tm))
  let saved = false
  let qpfAnalysisTm = null
  for (const value of units || []) {
    throwIfAborted(signal)
    const requestedTm = kind === 'lead' && qpfAnalysisTm ? qpfAnalysisTm : requestTm
    if (kind === 'height' && complete.has(`${value}:${requestTm}`)) continue
    try {
      // 산출물이 자기 줌 레벨을 갖고 있으면 그것이 우선한다(합성영상 14, 바람장 13).
      const zoomLevel = KMA_GRAPHIC_PRODUCTS[type]?.zoomLevel ?? productConfig.image_zoom_level
      const request = kind === 'height' ? { tm: requestedTm, heightM: value, zoomLevel }
        : kind === 'lead' ? { tm: requestedTm, leadMinutes: value, zoomLevel }
        : { tm: requestedTm, zoomLevel }
      const fetchJson = deps.fetchJson || ((url) => defaultJson(url, productConfig.timeout_ms || 30000, signal))
      const fetchImage = deps.fetchImage || ((url) => defaultImage(url, productConfig.timeout_ms || 30000, signal))
      const parsed = parseImpgResult(await fetchJson(apiUrl(activeConfig, type, request), { signal }), { product: type, requestedTm, leadMinutes: kind === 'lead' ? value : 0 })
      throwIfAborted(signal)
      // KMA answers with the newest frame it holds, which can lag the requested slot. Accept that
      // frame under its own timestamp; only a timestamp ahead of the request means a wrong answer.
      if (!parsed) continue
      if (kind === 'height' && (parsed.tm > requestedTm || complete.has(`${value}:${parsed.tm}`))) continue
      if (kind === 'single' && (parsed.tm > requestedTm || complete.has(parsed.tm))) continue
      if (kind === 'lead') {
        qpfAnalysisTm ||= parsed.tm
        if (parsed.tm !== qpfAnalysisTm || complete.has(`${parsed.tm}:${value}`) || parsed.validTimeMs !== parsed.timeMs + value * 60000) continue
      }
      const [image, legend] = await Promise.all([fetchImage(assetUrl(parsed.imagePath), { signal }), fetchImage(assetUrl(parsed.legendPath), { signal })])
      throwIfAborted(signal)
      const body = await normalize(image, { projected: parsed.projectedBounds, bounds: parsed.bounds })
      const legendImage = await normalize(legend, { stripBackground: false })
      parsed.heightM = kind === 'height' ? value : null
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
export const processHsr = (options) => collect('hsr', options)
export const processHci = (options) => collect('hci', options)
export default { processWissdom, processQpf, processHsr, processHci }
