// Manual prototype collection only. Does not start or modify the project collector.
import fs from 'node:fs/promises'
import path from 'node:path'
import config from '../../../../backend/src/config.js'
import { fetchKimGrid } from '../../../../backend/src/api-client.js'
import { parseKimGridText } from '../../../../backend/src/parsers/kim-grid-parser.js'

const repo = process.cwd()
const out = path.join(repo, 'artifacts/aci-experiment/private')
const tmfc = '2026092306', hf = 3, step = 1
const names = ['ps', 't2m', 'q2m', 'pr', 'ulwrtoa']
await fs.mkdir(out, { recursive: true })
const bounds = config.kim_surface_wind.bounds
const grids = {}
for (const name of names) {
  const cached = path.join(out, `${tmfc}-hf${hf}-${name}.txt`)
  let raw
  try { raw = await fs.readFile(cached, 'utf8') } catch {
    raw = await fetchKimGrid({ data: 'U', name, level: 0, tmfc, hf, sub: config.kim_surface_wind.sub, signal: AbortSignal.timeout(55000) })
    // Cached replies are private and never served by the prototype HTTP server.
    const safe = raw.replace(/(authKey|serviceKey)\s*[=:]\s*[^\s&]+/gi, '$1=[redacted]')
    await fs.writeFile(cached, safe)
  }
  if (!raw.includes(`.ft${String(hf).padStart(3, '0')}.${tmfc}.nc`)) throw new Error(`Unexpected run/time for ${name}`)
  const grid = parseKimGridText(raw, { variable: name, bounds })
  const expected = { ps: 'Pa', t2m: 'K', q2m: 'kg/kg', pr: 'kg/m2/s', ulwrtoa: 'W/m2' }[name]
  const unit = grid.unit.replace(/,$/, '').replaceAll('^', '').replaceAll('²', '2').replace(/[()]/g, '')
  if (unit !== expected || grid.nx !== 205 || grid.ny !== 169) throw new Error(`Unexpected ${name} unit/shape: ${unit} ${grid.nx}x${grid.ny}`)
  grids[name] = grid
  console.log(`Ready ${name}: ${unit}, ${grid.nx}x${grid.ny}`)
}
const dir = path.join(repo, `backend/data/kim_nwp/runs/KIMG_NE57_${tmfc}/normalized/hf003`)
const levels = []
for (const name of await fs.readdir(dir)) {
  if (!/^\d+hPa$/.test(name)) continue
  const d = JSON.parse(await fs.readFile(path.join(dir, name, 'grid.json'), 'utf8'))
  if (d.tmfc !== tmfc || d.hf !== hf || d.grid.nx !== 205 || d.grid.ny !== 169) throw new Error('Stored profile identity mismatch')
  if (!d.variables.T || !d.variables.q) throw new Error(`Missing T/q at ${name}`)
  levels.push({ p: Number(name.replace('hPa', '')), variables: d.variables })
}
levels.sort((a, b) => b.p - a.p)
if (levels.length < 20 || levels.at(-1).p > 150) throw new Error('Stored profile has insufficient vertical coverage')
const decode = (v, i) => v.values[i] == null || v.values[i] === -32768 ? null : v.values[i] * (v.scale ?? 1) + (v.offset ?? 0)
const xs = Array.from({ length: Math.floor(204 / step) + 1 }, (_, i) => i * step)
const ys = Array.from({ length: Math.floor(168 / step) + 1 }, (_, i) => i * step)
const points = []
for (const y of ys) for (const x of xs) {
  const i = y * 205 + x
  points.push({ x, y, lon: 119 + x / 12, lat: 30 + y / 12,
    ps: grids.ps.values[i], t2m: grids.t2m.values[i], q2m: grids.q2m.values[i],
    rainRate: grids.pr.values[i] * 3600, olr: grids.ulwrtoa.values[i],
    profile: levels.map(l => ({ p: l.p, T: decode(l.variables.T, i), q: decode(l.variables.q, i) })) })
}
const payload = { tmfc, hf, model: 'KIMG/NE57', validAt: '2026-09-23T09:00:00.000Z', fetchedAt: new Date().toISOString(),
  grid: { nx: xs.length, ny: ys.length, stepDegrees: step / 12, lonMin: 119, latMin: 30, lonMax: 119 + xs.at(-1) / 12, latMax: 30 + ys.at(-1) / 12 },
  sources: { vertical: 'Stored project API snapshot', surface: names, cape: 'MetPy surface_based_cape_cin; surface pressure + 2m T/q + pressure levels through 150 hPa', rain: 'KIM pr (kg/m²/s) × 3600 = mm/h equivalent rate; no accumulation assumption' }, points }
await fs.writeFile(path.join(out, 'inputs.json'), JSON.stringify(payload))
console.log(`Prepared ${points.length} real KIM profiles at ${payload.validAt}`)
