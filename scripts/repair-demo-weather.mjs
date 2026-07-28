#!/usr/bin/env node
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from '../backend/node_modules/dotenv/lib/main.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(repoRoot, '.env') })

function option(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const dataRoot = path.resolve(option('--data-root', path.join(repoRoot, 'backend', 'data')))
const snapshotName = option('--name', 'demo')
const skipWeather = process.argv.includes('--skip-weather')
if (!/^[a-zA-Z0-9_-]+$/.test(snapshotName) || snapshotName === '_live_backup') {
  throw new Error('invalid snapshot name')
}

const snapshotRoot = path.join(dataRoot, 'snapshots', snapshotName)
const metaPath = path.join(snapshotRoot, 'meta.json')
if (!fs.existsSync(metaPath)) throw new Error(`snapshot not found: ${snapshotName}`)
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
const referenceTime = new Date(meta.referenceTime)
if (!Number.isFinite(referenceTime.getTime())) throw new Error('snapshot referenceTime is missing')

const stageRoot = path.join(dataRoot, 'snapshots', `.${snapshotName}-weather-repair-${process.pid}-${Date.now()}`)
fs.mkdirSync(stageRoot, { recursive: true })

function copyExisting(type) {
  const source = path.join(snapshotRoot, type)
  const destination = path.join(stageRoot, type)
  if (fs.existsSync(source)) fs.cpSync(source, destination, { recursive: true })
  else fs.mkdirSync(destination, { recursive: true })
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      if (key === 'updated_at' || key === 'fetched_at' || key === 'content_hash') continue
      out[key] = canonicalize(value[key])
    }
    return out
  }
  return value
}

function contentHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex')
}

function stageTimeSafeAdsb() {
  const sourcePath = path.join(snapshotRoot, 'adsb', 'latest.json')
  if (!fs.existsSync(sourcePath)) return { action: 'missing' }
  const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  const fetchedMs = Date.parse(payload.fetched_at)
  const skewMs = Math.abs(fetchedMs - referenceTime.getTime())
  if (Number.isFinite(fetchedMs) && skewMs <= 30 * 60 * 1000) {
    return { action: 'kept', fetchedAt: payload.fetched_at, aircraft: payload.aircraft?.length ?? 0 }
  }

  const repaired = {
    ...payload,
    fetched_at: referenceTime.toISOString(),
    updated_at: referenceTime.toISOString(),
    total_aircraft: 0,
    aircraft: [],
  }
  repaired.content_hash = contentHash(repaired)
  const destination = path.join(stageRoot, 'adsb')
  fs.mkdirSync(destination, { recursive: true })
  fs.writeFileSync(path.join(destination, 'latest.json'), `${JSON.stringify(repaired, null, 2)}\n`, 'utf8')
  return {
    action: 'cleared_stale_positions',
    originalFetchedAt: payload.fetched_at ?? null,
    aircraftRemoved: payload.aircraft?.length ?? 0,
  }
}

function verifyFrames(type, metadataFile, expectedCount) {
  const metadata = JSON.parse(fs.readFileSync(path.join(stageRoot, type, metadataFile), 'utf8'))
  const frames = Array.isArray(metadata.frames) ? metadata.frames : []
  const missingFiles = frames.filter((frame) => {
    const filename = path.basename(String(frame.path || ''))
    return !filename || !fs.existsSync(path.join(stageRoot, type, filename))
  })
  if (frames.length < expectedCount || missingFiles.length > 0) {
    throw new Error(`${type} repair incomplete: ${frames.length}/${expectedCount}, missing files ${missingFiles.length}`)
  }
  return { frameCount: frames.length, first: frames[0]?.tm ?? null, last: frames.at(-1)?.tm ?? null }
}

function publishTypes(types) {
  const suffix = `${process.pid}-${Date.now()}`
  const committed = []
  try {
    for (const type of types) {
      const destination = path.join(snapshotRoot, type)
      const prior = `${destination}.prior-${suffix}`
      if (fs.existsSync(destination)) fs.renameSync(destination, prior)
      committed.push({ destination, prior })
      fs.renameSync(path.join(stageRoot, type), destination)
    }
    for (const { prior } of committed) fs.rmSync(prior, { recursive: true, force: true })
  } catch (error) {
    for (const { destination, prior } of committed.reverse()) {
      fs.rmSync(destination, { recursive: true, force: true })
      if (fs.existsSync(prior)) fs.renameSync(prior, destination)
    }
    throw error
  }
}

try {
  const adsb = stageTimeSafeAdsb()
  const publish = adsb.action === 'cleared_stale_positions' ? ['adsb'] : []
  let radar = null
  let satellite = null
  let radarResult = null
  let satelliteResult = null

  if (!skipWeather) {
    copyExisting('radar')
    copyExisting('satellite')
    process.env.DATA_PATH = stageRoot
    process.env.RADAR_MOTION_ENABLED = '0'
    process.env.SATELLITE_CONVECTIVE_ENABLED = '0'

    const [{ process: collectRadar }, { process: collectSatellite }] = await Promise.all([
      import('../backend/src/processors/radar-echo-processor.js'),
      import('../backend/src/processors/satellite-processor.js'),
    ])
    radarResult = await collectRadar({ now: referenceTime, fillAll: true })
    satelliteResult = await collectSatellite({
      now: referenceTime,
      fillAll: true,
      collectConvective: false,
      scheduleRetries: false,
    })
    radar = verifyFrames('radar', 'echo_meta.json', 36)
    satellite = verifyFrames('satellite', 'sat_meta.json', 18)
    publish.push('radar', 'satellite')
  }
  if (publish.length > 0) publishTypes(publish)

  const { inspectSnapshot } = await import('../backend/src/dev/snapshot-store.js')
  console.log(JSON.stringify({
    ok: true,
    snapshot: snapshotName,
    referenceTime: referenceTime.toISOString(),
    adsb,
    radar,
    satellite,
    collectors: { radar: radarResult, satellite: satelliteResult },
    inspection: inspectSnapshot(dataRoot, snapshotName),
  }, null, 2))
} finally {
  fs.rmSync(stageRoot, { recursive: true, force: true })
}
