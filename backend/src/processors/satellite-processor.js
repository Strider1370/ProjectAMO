import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import config from '../config.js'
import { parseSatelliteNC, parseFogNC, renderFogImage } from '../parsers/satellite-parser.js'
import { collectConvectiveSatelliteFrame } from './convective-satellite-processor.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'

const RENDER_VERSION = 'fog-composite-v3-kst-tm-webp'
const FOG_RETRY_DELAY_MS = 3 * 60 * 1000
const MAX_FOG_RETRIES = 2
const SAT_FRAME_STEP_MIN = 10

function formatUtcTm(date) {
  const p = (value) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}`
}

function formatKstTm(dateUtc) { return formatUtcTm(new Date(dateUtc.getTime() + 9 * 60 * 60 * 1000)) }

export function getCandidateTms(delayMinutes = config.satellite.delay_minutes, referenceTime = new Date()) {
  const delayed = new Date(referenceTime)
  delayed.setTime(delayed.getTime() - delayMinutes * 60 * 1000)
  delayed.setUTCMinutes(Math.floor(delayed.getUTCMinutes() / SAT_FRAME_STEP_MIN) * SAT_FRAME_STEP_MIN, 0, 0)
  return [0, 1, 2].map((index) => {
    const time = new Date(delayed.getTime() - index * SAT_FRAME_STEP_MIN * 60 * 1000)
    return { requestTm: formatUtcTm(time), displayTm: formatKstTm(time) }
  })
}

function buildIrUrl(activeConfig, tm) {
  return `${activeConfig.satellite.url}/${activeConfig.satellite.channel}/${activeConfig.satellite.region}/data?date=${tm}&authKey=${activeConfig.api.radar_satellite_auth_key}`
}

function buildFogUrl(activeConfig, tm) {
  return `${activeConfig.satellite.fog_url}/${activeConfig.satellite.fog_product}/${activeConfig.satellite.region}/data?date=${tm}&authKey=${activeConfig.api.radar_satellite_auth_key}`
}

export function needsFogRefetch(frame) {
  return Boolean(frame) && frame.fogPixelCount === null && (frame.fogAttempts || 0) < MAX_FOG_RETRIES
}

function withFogAttempt(frameInfo, previousFrame) {
  if (!frameInfo || frameInfo.fogPixelCount !== null) return frameInfo
  return { ...frameInfo, fogAttempts: (previousFrame?.fogAttempts || 0) + 1 }
}

function satelliteDir(activeConfig) { return path.join(activeConfig.storage.base_path, 'satellite') }

function readJson(fsImpl, file) {
  try { return JSON.parse(fsImpl.readFileSync(file, 'utf8')) } catch { return null }
}

// The temporary neighbour is deliberately created beside the published file: rename is atomic only within a filesystem.
export function writeSatelliteAtomic(fsImpl, file, data) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    fsImpl.writeFileSync(temp, data)
    fsImpl.renameSync(temp, file)
  } catch (error) {
    try { fsImpl.unlinkSync(temp) } catch { /* best-effort temporary cleanup */ }
    throw error
  }
}

function buildFrameSpecs(latestRequestTm, frameCount) {
  const latest = new Date(Date.UTC(
    Number(latestRequestTm.slice(0, 4)), Number(latestRequestTm.slice(4, 6)) - 1,
    Number(latestRequestTm.slice(6, 8)), Number(latestRequestTm.slice(8, 10)), Number(latestRequestTm.slice(10, 12)),
  ))
  return Array.from({ length: frameCount }, (_, index) => {
    const time = new Date(latest.getTime() - (frameCount - index - 1) * SAT_FRAME_STEP_MIN * 60 * 1000)
    return { requestTm: formatUtcTm(time), displayTm: formatKstTm(time) }
  })
}

async function fetchNC(activeConfig, url, deps) {
  const response = await (deps.fetchWithTimeout || fetchWithTimeout)(url, activeConfig.satellite.timeout_ms)
  if (!response.ok) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.length >= 1000 && buffer[0] === 0x89 && buffer[1] === 0x48 && buffer[2] === 0x44 && buffer[3] === 0x46 ? buffer : null
}

async function renderFrame({ activeConfig, fsImpl, satDir, requestTm, displayTm, deps }) {
  if (deps.renderFrame) return deps.renderFrame({ satDir, requestTm, displayTm })
  const [irBuffer, fogBuffer] = await Promise.all([
    fetchNC(activeConfig, buildIrUrl(activeConfig, requestTm), deps),
    fetchNC(activeConfig, buildFogUrl(activeConfig, requestTm), deps),
  ])
  if (!irBuffer) return null
  const irParsed = await (deps.parseSatelliteNC || parseSatelliteNC)(irBuffer)
  const hasFogData = Boolean(fogBuffer)
  const result = hasFogData
    ? await (deps.renderFogImage || renderFogImage)(irParsed, await (deps.parseFogNC || parseFogNC)(fogBuffer))
    : await (deps.renderFogImage || renderFogImage)(irParsed, { fogData: null, delFta: null })
  const webpBuffer = await (deps.sharp || sharp)(result.pngBuffer).webp({ quality: 90, effort: 6 }).toBuffer()
  const filename = `sat_korea_${displayTm}.webp`
  writeSatelliteAtomic(fsImpl, path.join(satDir, filename), webpBuffer)
  return {
    tm: displayTm, request_tm_utc: requestTm, product: 'FOG', channel: activeConfig.satellite.channel,
    render_version: RENDER_VERSION, path: `/data/satellite/${filename}`, bounds: result.bounds,
    width: result.width, height: result.height, fogPixelCount: hasFogData ? result.fogPixelCount : null,
  }
}

function publishMeta({ fsImpl, satDir, activeConfig, latestFrameSpec, frameSpecs, existingFrames, updatedAt }) {
  const frames = frameSpecs.map((frame) => existingFrames.get(frame.displayTm)).filter(Boolean).sort((a, b) => a.tm.localeCompare(b.tm))
  const meta = {
    type: 'SATELLITE', product: 'FOG', channel: activeConfig.satellite.channel, region: activeConfig.satellite.region,
    render_version: RENDER_VERSION, updated_at: new Date(updatedAt).toISOString(), tm: latestFrameSpec.displayTm,
    request_tm_utc: latestFrameSpec.requestTm, latest: frames.find((frame) => frame.tm === latestFrameSpec.displayTm) || frames.at(-1) || null, frames,
  }
  // Metadata is the commit record and is written only after every newly referenced WebP has been renamed into place.
  writeSatelliteAtomic(fsImpl, path.join(satDir, 'sat_meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
  const names = new Set(frames.map((frame) => path.basename(frame.path)))
  try {
    for (const filename of fsImpl.readdirSync(satDir)) {
      if (/^sat_korea_\d{12}\.(?:png|webp)$/.test(filename) && !names.has(filename)) fsImpl.unlinkSync(path.join(satDir, filename))
    }
  } catch (error) {
    console.warn(`satellite: stale frame cleanup failed: ${error.message}`)
  }
  return meta
}

function snapshotFiles(fsImpl, satDir, frameSpecs) {
  return new Map(frameSpecs.map(({ displayTm }) => {
    const file = path.join(satDir, `sat_korea_${displayTm}.webp`)
    return [file, fsImpl.existsSync(file) ? fsImpl.readFileSync(file) : null]
  }))
}

function restoreFiles(fsImpl, snapshots) {
  for (const [file, contents] of snapshots) {
    if (contents === null) {
      try { fsImpl.unlinkSync(file) } catch { /* no unpublished file to remove */ }
    } else {
      writeSatelliteAtomic(fsImpl, file, contents)
    }
  }
}

function followUp(mode, now, frame, delayMs) {
  return { kind: 'satellite', mode, now: new Date(now).toISOString(), ...(frame ? { frame } : {}), delayMs }
}

function resolveFrame(frame) {
  if (!frame?.requestTm || !frame?.displayTm) throw new Error('satellite frame is required')
  return { requestTm: frame.requestTm, displayTm: frame.displayTm }
}

function context(now, deps) {
  const activeConfig = deps.config || config
  const fsImpl = deps.fs || fs
  const satDir = satelliteDir(activeConfig)
  fsImpl.mkdirSync(satDir, { recursive: true })
  const existingMeta = readJson(fsImpl, path.join(satDir, 'sat_meta.json'))
  const existingFrames = new Map(((existingMeta?.render_version === RENDER_VERSION ? existingMeta.frames : []) || []).map((frame) => [frame.tm, frame]))
  return { activeConfig, fsImpl, satDir, existingMeta, existingFrames, now }
}

export async function processSatellite({ now = new Date(), mode = 'current', frame, deps = {} } = {}) {
  const activeNow = new Date(now)
  const activeConfig = deps.config || config
  if (!activeConfig.api?.radar_satellite_auth_key) throw new Error('Satellite auth key missing (set KMA_RADAR_SATELLITE_AUTH_KEY)')
  const state = context(activeNow, deps)
  const frameCount = activeConfig.satellite.max_frames || 18

  if (mode === 'current') {
    const latestFrameSpec = getCandidateTms(activeConfig.satellite.delay_minutes, activeNow)[0]
    if (!latestFrameSpec) return { result: { type: 'satellite', saved: false, reason: 'no data available' }, followUps: [] }
    const frameSpecs = buildFrameSpecs(latestFrameSpec.requestTm, frameCount)
    const missing = frameSpecs.filter((spec) => {
      const exists = state.fsImpl.existsSync(path.join(state.satDir, `sat_korea_${spec.displayTm}.webp`)) && state.existingFrames.get(spec.displayTm)
      return !exists || needsFogRefetch(state.existingFrames.get(spec.displayTm))
    })
    const immediate = missing.filter((spec) => spec.displayTm === latestFrameSpec.displayTm)
    const snapshots = snapshotFiles(state.fsImpl, state.satDir, immediate)
    let meta
    try {
      for (const spec of immediate) {
        const rendered = await renderFrame({ ...state, requestTm: spec.requestTm, displayTm: spec.displayTm, deps })
        if (rendered) state.existingFrames.set(spec.displayTm, withFogAttempt(rendered, state.existingFrames.get(spec.displayTm)))
      }
      meta = publishMeta({ ...state, latestFrameSpec, frameSpecs, updatedAt: activeNow })
    } catch (error) {
      restoreFiles(state.fsImpl, snapshots)
      throw error
    }
    if (deps.collectConvective !== false && meta.latest?.tm === latestFrameSpec.displayTm) {
      try { await (deps.collectConvectiveSatelliteFrame || collectConvectiveSatelliteFrame)({ tm: latestFrameSpec.displayTm, request_tm_utc: latestFrameSpec.requestTm }) } catch (error) { console.warn(`satellite: convective collection failed ${latestFrameSpec.requestTm}:`, error.message) }
    }
    const latest = state.existingFrames.get(latestFrameSpec.displayTm)
    const followUps = missing.filter((spec) => spec.displayTm !== latestFrameSpec.displayTm).map((spec) => followUp('backfill', activeNow, spec, 0))
    if (needsFogRefetch(latest)) followUps.push(followUp('fog_retry', activeNow, { ...latestFrameSpec, fogAttempts: latest.fogAttempts || 0 }, FOG_RETRY_DELAY_MS))
    return { result: { type: 'satellite', saved: immediate.length > 0 || meta.frames.length > 0, frameCount: meta.frames.length, tm: meta.tm, request_tm_utc: meta.request_tm_utc, deferredCount: followUps.filter((job) => job.mode === 'backfill').length }, followUps }
  }

  if (!['backfill', 'fog_retry'].includes(mode)) throw new Error('invalid satellite mode')
  const target = resolveFrame(frame)
  const latestFrameSpec = state.existingMeta?.request_tm_utc && state.existingMeta?.tm
    ? { requestTm: state.existingMeta.request_tm_utc, displayTm: state.existingMeta.tm }
    : target
  const frameSpecs = buildFrameSpecs(latestFrameSpec.requestTm, frameCount)
  if (!frameSpecs.some((spec) => spec.displayTm === target.displayTm)) {
    return { result: { type: 'satellite', saved: false, reason: 'already-collected' }, followUps: [] }
  }
  const previous = state.existingFrames.get(target.displayTm)
  const followUps = []
  if (mode === 'backfill' && state.fsImpl.existsSync(path.join(state.satDir, `sat_korea_${target.displayTm}.webp`)) && previous && !needsFogRefetch(previous)) {
    return { result: { type: 'satellite', saved: false, reason: 'already-collected' }, followUps }
  }
  if (mode === 'fog_retry' && !needsFogRefetch(previous)) return { result: { type: 'satellite', saved: false, reason: 'already-collected' }, followUps }
  const snapshots = snapshotFiles(state.fsImpl, state.satDir, [target])
  try {
    const rendered = await renderFrame({ ...state, requestTm: target.requestTm, displayTm: target.displayTm, deps })
    if (!rendered) {
      restoreFiles(state.fsImpl, snapshots)
      return { result: { type: 'satellite', saved: false, reason: 'no data available' }, followUps }
    }
    const saved = withFogAttempt(rendered, previous)
    state.existingFrames.set(target.displayTm, saved)
    const meta = publishMeta({ ...state, latestFrameSpec, frameSpecs, updatedAt: activeNow })
    if (mode === 'fog_retry' && needsFogRefetch(saved)) followUps.push(followUp('fog_retry', activeNow, { ...target, fogAttempts: saved.fogAttempts || 0 }, FOG_RETRY_DELAY_MS))
    return { result: { type: 'satellite', saved: true, frameCount: meta.frames.length, tm: meta.tm, request_tm_utc: meta.request_tm_utc }, followUps }
  } catch (error) {
    restoreFiles(state.fsImpl, snapshots)
    throw error
  }
}

// Compatibility for direct callers until scheduler wiring moves to the worker queue.
export async function process({ now = new Date(), fillAll = false, collectConvective = true } = {}) {
  if (fillAll) {
    const work = await processSatellite({ now, deps: { collectConvective } })
    for (const followUpJob of work.followUps.filter((job) => job.mode === 'backfill')) await processSatellite({ now, mode: 'backfill', frame: followUpJob.frame, deps: { collectConvective: false } })
    return work.result
  }
  return (await processSatellite({ now, deps: { collectConvective } })).result
}

export default { process, processSatellite }
