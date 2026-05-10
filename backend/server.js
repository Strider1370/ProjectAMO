import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import store from './src/store.js'
import stats from './src/stats.js'
import config from './src/config.js'
import { main as startScheduler } from './src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.BACKEND_PORT || 3001
const HOST = process.env.BACKEND_HOST || '127.0.0.1'
const DATA_ROOT = config.storage.base_path

app.disable('x-powered-by')
app.set('trust proxy', true)

function readJsonFileSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function setGeneratedDataCacheHeaders(res, filePath) {
  const relPath = path.relative(DATA_ROOT, filePath).replace(/\\/g, '/')

  if (/^radar\/echo_korea_\d{12}\.png$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (/^satellite\/sat_korea_\d{12}\.(?:png|webp)$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (/^sigwx_low\/(?:fronts|clouds)_\d{10}\.png$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }

  if (
    relPath === 'radar/echo_meta.json'
    || relPath === 'satellite/sat_meta.json'
    || /^sigwx_low\/(?:fronts_meta|clouds_meta)_\d{10}\.json$/i.test(relPath)
  ) {
    res.setHeader('Cache-Control', 'no-cache')
    return
  }

  res.setHeader('Cache-Control', 'no-cache')
}

app.use('/data', express.static(DATA_ROOT, { setHeaders: setGeneratedDataCacheHeaders }))
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

function sendLatest(res, type) {
  const data = store.getCached(type)
  if (data) return res.json(data)
  res.status(503).json({ error: `${type} data unavailable` })
}

function sendJsonFile(res, filePath) {
  const payload = readJsonFileSafe(filePath)
  if (payload) return res.json(payload)
  res.status(503).json({ error: 'data unavailable' })
}

function listSigwxLowHistory() {
  const dir = path.join(DATA_ROOT, 'sigwx_low')
  const files = fs.readdirSync(dir)
    .filter((name) => /^SIGWX_LOW_\d{10}\.json$/i.test(name))
    .sort((a, b) => b.localeCompare(a))

  return files.map((name) => ({
    ...readJsonFileSafe(path.join(dir, name)),
    file_name: name,
  }))
}

function resolveSigwxTmfc(queryTmfc) {
  const requested = String(queryTmfc || '').trim()
  if (requested) return requested
  const data = store.getCached('sigwx_low')
  return data?.tmfc || ''
}

function buildHashEntry(type) {
  const data = store.getCached(type)
  if (!data) return null
  return { hash: data.content_hash || null }
}

function buildFrameEntry(filePath) {
  const payload = readJsonFileSafe(filePath)
  if (!payload?.tm) return null
  return { tm: payload.tm }
}

app.get('/api/metar', (_, res) => sendLatest(res, 'metar'))
app.get('/api/taf', (_, res) => sendLatest(res, 'taf'))
app.get('/api/warning', (_, res) => sendLatest(res, 'warning'))
app.get('/api/sigmet', (_, res) => sendLatest(res, 'sigmet'))
app.get('/api/airmet', (_, res) => sendLatest(res, 'airmet'))
app.get('/api/sigwx-low', (_, res) => sendLatest(res, 'sigwx_low'))
app.get('/api/lightning', (_, res) => sendLatest(res, 'lightning'))
app.get('/api/amos', (_, res) => sendLatest(res, 'amos'))
app.get('/api/adsb', (_, res) => sendLatest(res, 'adsb'))
app.get('/api/ground-forecast', (_, res) => sendLatest(res, 'ground_forecast'))
app.get('/api/ground-overview', (_, res) => sendLatest(res, 'ground_overview'))
app.get('/api/environment', (_, res) => sendLatest(res, 'environment'))
app.get('/api/airport-info', (_, res) => sendLatest(res, 'airport_info'))
app.get('/api/snapshot-meta', (_req, res) => {
  res.json({
    metar: buildHashEntry('metar'),
    taf: buildHashEntry('taf'),
    warning: buildHashEntry('warning'),
    sigmet: buildHashEntry('sigmet'),
    airmet: buildHashEntry('airmet'),
    sigwxLow: buildHashEntry('sigwx_low'),
    amos: buildHashEntry('amos'),
    lightning: buildHashEntry('lightning'),
    airportInfo: buildHashEntry('airport_info'),
    echoMeta: buildFrameEntry(path.join(DATA_ROOT, 'radar', 'echo_meta.json')),
    satMeta: buildFrameEntry(path.join(DATA_ROOT, 'satellite', 'sat_meta.json')),
  })
})
app.get('/api/sigwx-low-history', (_req, res) => {
  try {
    res.json(listSigwxLowHistory())
  } catch {
    res.status(503).json({ error: 'sigwx history unavailable' })
  }
})

app.get('/api/radar/echo-meta', (_req, res) =>
  sendJsonFile(res, path.join(DATA_ROOT, 'radar', 'echo_meta.json')),
)
app.get('/api/satellite/meta', (_req, res) =>
  sendJsonFile(res, path.join(DATA_ROOT, 'satellite', 'sat_meta.json')),
)

app.get('/api/airports', (_req, res) => res.json(config.airports))

app.get('/api/sigwx-front-meta', (req, res) => {
  const tmfc = resolveSigwxTmfc(req.query.tmfc)
  if (!tmfc) return res.status(503).json({ error: 'sigwx data unavailable' })
  sendJsonFile(res, path.join(DATA_ROOT, 'sigwx_low', `fronts_meta_${tmfc}.json`))
})

app.get('/api/sigwx-cloud-meta', (req, res) => {
  const tmfc = resolveSigwxTmfc(req.query.tmfc)
  if (!tmfc) return res.status(503).json({ error: 'sigwx data unavailable' })
  sendJsonFile(res, path.join(DATA_ROOT, 'sigwx_low', `clouds_meta_${tmfc}.json`))
})

app.get('/api/stats', (_req, res) => res.json(stats.getStats()))
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }))

app.listen(PORT, HOST, () => console.log(`[server] Backend running on ${HOST}:${PORT}`))

startScheduler().catch((err) => {
  console.error('[server] Scheduler startup error:', err.message)
  process.exit(1)
})
