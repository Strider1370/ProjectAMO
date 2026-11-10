import { buildSatelliteNcUrl } from '../lib/satellite-api.js'
import sharp from 'sharp'
import config from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { parseCtpsNC } from '../parsers/satellite-parser.js'
import { CTPS_MIN_FL_OPTIONS, encodeCtpsBinary, normalizeCtps, renderCtpsRgba } from './convective-satellite-model.js'
import { publishCtps, readConvectiveMeta } from './convective-satellite-store.js'

function buildCtpsUrl(activeConfig, requestTm) { return buildSatelliteNcUrl({ endpoint: activeConfig.satellite.nc_url, level: 'l2', element: 'ctps', area: 'ela', map: 'GE', tm: requestTm, key: activeConfig.api.radar_satellite_auth_key }) }
async function fetchNc(url, timeoutMs) { const response = await fetchWithTimeout(url, timeoutMs); if (!response.ok) throw new Error(`HTTP ${response.status}`); const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x48 || buffer[2] !== 0x44 || buffer[3] !== 0x46) throw new Error('Invalid HDF5 response'); return buffer }
async function renderWebp(normalized, minFl) { return sharp(renderCtpsRgba(normalized, minFl), { raw: { width: 1200, height: 1049, channels: 4 } }).webp({ lossless: true }).toBuffer() }

export async function collectConvectiveSatelliteFrame(frame, dependencies = {}) {
  const activeConfig = dependencies.config || config
  if (!activeConfig.satellite.convective_enabled) return { saved: false, reason: 'disabled' }
  const root = dependencies.root || activeConfig.storage.base_path
  const stored = (dependencies.readMeta || readConvectiveMeta)(root)?.frames?.find((item) => item.tm === frame.tm)
  if (CTPS_MIN_FL_OPTIONS.every((level) => stored?.ctps?.images?.[level])) return { saved: false, reason: 'already_complete' }
  const parsed = await (dependencies.parseCtps || parseCtpsNC)(await (dependencies.fetchNc || fetchNc)(buildCtpsUrl(activeConfig, frame.request_tm_utc), activeConfig.satellite.timeout_ms))
  const normalized = normalizeCtps(parsed)
  const images = {}
  for (const minFl of CTPS_MIN_FL_OPTIONS) images[minFl] = await (dependencies.renderWebp || renderWebp)(normalized, minFl)
  await (dependencies.publishCtps || publishCtps)({ root, frame, binary: encodeCtpsBinary(normalized), images, maxFrames: activeConfig.satellite.convective_max_frames })
  return { saved: true, ctps: 'fulfilled' }
}
export default { collectConvectiveSatelliteFrame }
