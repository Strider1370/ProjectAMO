// Explicit, one-frame live probe. Never imports or starts the scheduled collector.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import config from '../backend/src/config.js'
import usage from '../backend/src/api-hub-usage.js'
import { fetchKimGrid, buildKimGridUrl } from '../backend/src/api-client.js'
import { createRequestObservedApi } from '../backend/src/lib/request-observability.js'
import { resolveApiOperation } from '../backend/src/api-operation-registry.js'
import { parseKimGridText } from '../backend/src/parsers/kim-grid-parser.js'
import { loadAcimReference, seasonForTmfc, calculateAcim, topFeetForAcim, altitudeBand } from './lib/acim-reference.mjs'

const repo = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
// Explicit manual diagnostic requested by the user after the prior 403 ledger block.
// No ledger reset, key switch or scheduler change. Keep actual bytes/status recording.
const directOnce = args.includes('--direct-once')
const flag = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const released = new Date(Date.now() - 6 * 3600000)
released.setUTCHours(Math.floor(released.getUTCHours() / 6) * 6, 0, 0, 0)
const tmfc = flag('--tmfc') || released.toISOString().replace(/[-:T]/g, '').slice(0, 10)
const hf = Number(flag('--hf') ?? 6)
if (!/^\d{10}$/.test(tmfc) || !Number.isInteger(hf) || hf < 0 || hf > 12) throw new Error('Expected --tmfc YYYYMMDDHH and --hf 0..12')
const credential = config.api.radar_satellite_auth_key
if (!credential) throw new Error('Radar/satellite credential is unavailable')
const redact = text => String(text).replaceAll(credential, '[redacted]').replaceAll(encodeURIComponent(credential), '[redacted]').replace(/(authKey|serviceKey)\s*[=:]\s*[^\s&]+/gi, '$1=[redacted]')
const out = path.join(repo, 'artifacts/acim-probe', `${tmfc}-f${String(hf).padStart(3, '0')}`)
await fs.mkdir(out, { recursive: true })
const before = usage.snapshot().keys.find(key => key.category === 'radar_satellite')
const report = { testedAt: new Date().toISOString(), credentialCategory: 'radar_satellite', model: 'KIMG/NE57', tmfc, hf, requestedVariables: 2, retryPolicy: directOnce ? 'user-requested direct probe, maxAttempts=1' : 'existing kim_grid policy, maxAttempts=2', sub: config.kim_surface_wind.sub, variables: {}, temporalSemanticsVerified: false, usageBefore: { status: before.status, blockedReason: before.blockedReason, bytes: before.bytes, requests: before.requests, resetsAt: before.resetsAt }, notes: ['Single forecast frame; header metadata alone may not establish precipitation accumulation interval.'] }
const directRequest = directOnce ? createRequestObservedApi({
  usage: {
    assertAllowed(key) {
      if (key !== credential) throw new Error('Unexpected probe credential')
      const current = usage.snapshot().keys.find(key => key.category === 'radar_satellite')
      if (current.blockedReason !== 'upstream_403') usage.assertAllowed(key)
    },
    record: usage.record,
  },
  resolveOperation(params) {
    const operation = resolveApiOperation(params)
    if (operation.id !== 'kim_grid') throw new Error('Unexpected probe operation')
    return { ...operation, requestPolicy: { ...operation.requestPolicy, maxAttempts: 1 } }
  },
}) : null
const results = await Promise.allSettled(['ulwrtoa', 'precc'].map(async name => {
  const params = { data: 'U', name, level: 0, tmfc, hf, sub: config.kim_surface_wind.sub, credential }
  let text, receivedBytes
  if (directRequest) {
    const response = await directRequest({ operation: 'kim_grid', url: buildKimGridUrl(params), options: { signal: AbortSignal.timeout(35000) } })
    const bytes = await response.arrayBuffer()
    receivedBytes = bytes.byteLength
    text = /euc-kr|ks_c_5601|cp949/i.test(response.headers.get('content-type') || '') ? new TextDecoder('euc-kr').decode(bytes) : Buffer.from(bytes).toString('utf8')
    if (text.includes('\uFFFD')) text = new TextDecoder('euc-kr').decode(bytes)
  } else text = await fetchKimGrid({ ...params, signal: AbortSignal.timeout(65000) })
  const safe = redact(text)
  await fs.writeFile(path.join(out, `${name}.txt`), safe)
  const grid = parseKimGridText(text, { variable: name, level: 0, bounds: config.kim_surface_wind.bounds })
  const headers = safe.split(/\r?\n/).filter(line => line.trim().startsWith('#') && !/^#\s*j\s*=/.test(line))
  const stamp = `.ft${String(hf).padStart(3, '0')}.${tmfc}.nc`
  if (!text.includes(stamp) || !new RegExp(`=\\s*${name},\\s*unit`).test(text) || !text.includes('lon1 = 119.0, lat1 = 30.0, lon2 = 136.0, lat2 = 44.0')) throw new Error(`Unexpected identity/area for ${name}`)
  const expectedUnit = name === 'ulwrtoa' ? 'W/m2' : 'kg/m2'
  const unit = grid.unit.replace(/,$/, '').replaceAll('²', '2').replaceAll('^', '')
  if (unit !== expectedUnit || grid.nx !== 205 || grid.ny !== 169) throw new Error(`Unexpected unit/shape for ${name}: ${unit}, ${grid.nx}x${grid.ny}`)
  const good = grid.values.filter(value => Number.isFinite(value) && value >= 0)
  if (!good.length) throw new Error(`All values missing for ${name}`)
  report.variables[name] = { receivedBytes: receivedBytes ?? null, decodedTextBytes: Buffer.byteLength(text), nx: grid.nx, ny: grid.ny, unit: grid.unit, min: Math.min(...good), max: Math.max(...good), missing: grid.values.length - good.length, sha256: createHash('sha256').update(text).digest('hex'), headers }
  return { name, grid }
}))
const failed = results.filter(result => result.status === 'rejected')
const after = usage.snapshot().keys.find(key => key.category === 'radar_satellite')
report.ledgerRequestDelta = after.requests - before.requests
report.ledgerBytesDelta = after.bytes - before.bytes
if (failed.length) {
  report.outcome = failed.every(result => result.reason?.code === 'api_hub_budget_blocked') ? 'blocked_before_network' : 'failed'
  report.errors = failed.map(result => redact(result.reason?.message || result.reason))
} else {
  const grids = Object.fromEntries(results.map(result => [result.value.name, result.value.grid]))
  const reference = loadAcimReference(repo)
  const season = seasonForTmfc(tmfc)
  const aci = grids.ulwrtoa.values.map((value, i) => calculateAcim(value, grids.precc.values[i], reference.seasons[season]))
  const topFt = aci.map(value => topFeetForAcim(value, reference.table))
  const bins = Array(7).fill(0)
  topFt.forEach(value => { const band = altitudeBand(value); if (band != null && band >= 0) bins[band]++ })
  const runAt = new Date(`${tmfc.slice(0, 4)}-${tmfc.slice(4, 6)}-${tmfc.slice(6, 8)}T${tmfc.slice(8, 10)}:00:00Z`).toISOString()
  const validAt = new Date(Date.parse(runAt) + hf * 3600000).toISOString()
  const field = { model: report.model, tmfc, hf, runAt, validAt, season, grid: { ...config.kim_surface_wind.bounds, nx: 205, ny: 169 }, aci, topFt, referenceSources: reference.sources, temporalSemanticsVerified: false, precision: 'JavaScript float64; coefficients/branches from source; compiled REAL parity pending' }
  await fs.writeFile(path.join(out, 'field.json'), JSON.stringify(field))
  report.outcome = 'success'
  report.calculation = { season, precision: field.precision, aciMin: Math.min(...aci.filter(Number.isFinite)), aciMax: Math.max(...aci.filter(Number.isFinite)), maxTopFt: Math.max(...topFt.filter(Number.isFinite)), visibleCells: bins.reduce((sum, count) => sum + count, 0), missingCells: topFt.filter(value => value == null).length, altitudeBandCells: bins, referenceSources: reference.sources }
  report.totalBytes = report.ledgerBytesDelta
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ...report, output: path.relative(repo, out) }, null, 2))
if (failed.length) process.exitCode = 1
