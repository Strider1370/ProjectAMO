import sharp from 'sharp'
import config from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { parseCiNC, parseCtpsNC } from '../parsers/satellite-parser.js'
import { CTPS_MIN_FL_OPTIONS, buildCiFeatureCollection, encodeCtpsBinary, normalizeCtps, renderCtpsRgba } from './convective-satellite-model.js'
import { publishCi, publishCtps, readConvectiveMeta } from './convective-satellite-store.js'

function buildCiUrl(requestTm) { return `${config.satellite.fog_url}/${config.satellite.ci_product}/${config.satellite.region}/data?date=${requestTm}&authKey=${config.api.auth_key}` }
function buildCtpsUrl(requestTm) { return `${config.flight_category.ctps_url}?date=${requestTm}&authKey=${config.api.auth_key}` }
async function fetchNc(url) { const response = await fetchWithTimeout(url, config.satellite.timeout_ms); if (!response.ok) throw new Error(`HTTP ${response.status}`); const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x48 || buffer[2] !== 0x44 || buffer[3] !== 0x46) throw new Error('Invalid HDF5 response'); return buffer }
async function renderWebp(normalized, minFl) { return sharp(renderCtpsRgba(normalized, minFl), { raw: { width: 1200, height: 1049, channels: 4 } }).webp({ lossless: true }).toBuffer() }

export async function collectConvectiveSatelliteFrame(frame, dependencies = {}) {
  const activeConfig = dependencies.config || config
  if (!activeConfig.satellite.convective_enabled) return { saved: false, reason: 'disabled' }
  const root = dependencies.root || activeConfig.storage.base_path
  const readMeta = dependencies.readMeta || readConvectiveMeta
  const existing = readMeta(root)?.frames?.find((item) => item.tm === frame.tm)
  const tasks = []
  if (!existing?.ci) tasks.push(['ci', (async () => { const parsed = await (dependencies.parseCi || parseCiNC)(await (dependencies.fetchNc || fetchNc)(buildCiUrl(frame.request_tm_utc))); return (dependencies.publishCi || publishCi)({ root, frame, geojson: buildCiFeatureCollection(parsed), maxFrames: activeConfig.satellite.convective_max_frames }) })()])
  if (!existing?.ctps) tasks.push(['ctps', (async () => { const parsed = await (dependencies.parseCtps || parseCtpsNC)(await (dependencies.fetchNc || fetchNc)(buildCtpsUrl(frame.request_tm_utc))); const normalized = normalizeCtps(parsed), images = {}; for (const minFl of CTPS_MIN_FL_OPTIONS) images[minFl] = await (dependencies.renderWebp || renderWebp)(normalized, minFl); return (dependencies.publishCtps || publishCtps)({ root, frame, binary: encodeCtpsBinary(normalized), images, maxFrames: activeConfig.satellite.convective_max_frames }) })()])
  if (!tasks.length) return { saved: false, reason: 'already_complete' }
  const results = await Promise.allSettled(tasks.map(([, task]) => task))
  const saved = results.some((result) => result.status === 'fulfilled')
  for (let index = 0; index < results.length; index += 1) if (results[index].status === 'rejected') console.warn(`satellite: convective ${tasks[index][0]} failed ${frame.request_tm_utc}:`, results[index].reason?.message || results[index].reason)
  return { saved, ci: existing?.ci ? 'existing' : results[tasks.findIndex(([name]) => name === 'ci')]?.status || 'skipped', ctps: existing?.ctps ? 'existing' : results[tasks.findIndex(([name]) => name === 'ctps')]?.status || 'skipped' }
}
export default { collectConvectiveSatelliteFrame }
