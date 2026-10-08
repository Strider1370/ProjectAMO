// KIM 회차 점검(읽기 전용). 저장 형식(JSON·NC)과 관계없이 회차 상태·값·진행 기록을 본다.
//
//   node scripts/kim-inspect.mjs [--data <DATA_PATH>] [--domain ea]   회차 목록·게시 상태·예보시각 완성도·용량(영역 기본 kr)
//   node scripts/kim-inspect.mjs --run 2026100700 --hf 6 --level 850hPa [--point 37.5,127]
//                                                                     변수별 최솟값·최댓값·결측 수, 지점 값
//   node scripts/kim-inspect.mjs --run 2026100700 --events 30         회차 진행 기록(events.jsonl) 마지막 30줄
//   node scripts/kim-inspect.mjs --run 2026100700 --compare           JSON·NC가 함께 있는 문서를 모두 비교
//
// 운영 서버: cd /opt/projectamo/current && node scripts/kim-inspect.mjs --data /opt/projectamo/shared/data
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual, parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: {
  data: { type: 'string' }, run: { type: 'string' }, hf: { type: 'string' }, level: { type: 'string' },
  point: { type: 'string' }, events: { type: 'string' }, compare: { type: 'boolean' }, domain: { type: 'string' },
} })

const root = path.resolve(args.data || process.env.DATA_PATH || 'backend/data')
const { readKimNcDocument } = await import('../backend/src/processors/kim-doc-store.js')
const { decodeComponent, KIM_NWP_LEVELS, KIM_NWP_MODEL } = await import('../backend/src/processors/kim-nwp-model.js')
const store = await import('../backend/src/processors/kim-nwp-store.js')
const { readKimRunEvents } = await import('../backend/src/processors/kim-run-events.js')
const { parseKimDomain } = await import('../backend/src/processors/kim-domain.js')

const domain = parseKimDomain(args.domain)
const kimRoot = store.resolveKimNwpRoot(root, domain)
if (!fs.existsSync(kimRoot)) {
  console.error(`KIM 저장소가 없습니다: ${kimRoot}`)
  process.exit(1)
}
const runDir = tmfc => store.resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain })
const mb = bytes => `${(bytes / 1e6).toFixed(1)} MB`
const out = (value) => console.log(JSON.stringify(value, null, 2))

function walk(dir, visit) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file, visit)
    else visit(file, entry.name)
  }
}

function runUsage(dir) {
  const usage = { json: 0, nc: 0, raw: 0, other: 0, files: 0 }
  walk(dir, (file, name) => {
    const size = fs.statSync(file).size
    usage.files += 1
    if (file.includes(`${path.sep}raw${path.sep}`)) usage.raw += size
    else if (name.endsWith('.nc')) usage.nc += size
    else if (name.endsWith('.json')) usage.json += size
    else usage.other += size
  })
  return usage
}

function hourCompleteness(tmfc) {
  const normalized = path.join(runDir(tmfc), 'normalized')
  const hours = {}
  for (const hour of fs.existsSync(normalized) ? fs.readdirSync(normalized).filter(name => /^hf\d{3}$/.test(name)).sort() : []) {
    const levels = KIM_NWP_LEVELS.map(level => level.id)
    const present = levels.filter(id => ['grid.json', 'grid.nc'].some(name => fs.existsSync(path.join(normalized, hour, id, name))))
    hours[Number(hour.slice(2))] = `${present.length}/${levels.length}`
  }
  return hours
}

function summary() {
  const latest = store.readKimNwpLatest(root, domain)
  const gktg = store.readKimGktgLatest(root, domain)
  const trop = store.readKimTropopauseLatest(root, domain)
  const runs = store.listKimNwpRuns(root, domain).map((runId) => {
    const tmfc = runId.match(/_(\d{10})$/)?.[1]
    const manifest = store.readKimNwpManifest(root, runId, domain)
    const usage = runUsage(path.join(kimRoot, 'runs', runId))
    const events = readKimRunEvents(path.join(kimRoot, 'runs', runId))
    return {
      runId,
      serving: [latest?.latestRunId === runId && 'base', gktg?.runId === runId && 'gktg', trop?.runId === runId && 'tropopause'].filter(Boolean),
      manifest: manifest ? { usable: manifest.usable, complete: manifest.complete, grids: `${manifest.gridCount}/${manifest.expectedGridCount}` } : 'collecting (no manifest)',
      hours: tmfc ? hourCompleteness(tmfc) : {},
      size: { json: mb(usage.json), nc: mb(usage.nc), raw: mb(usage.raw), other: mb(usage.other), files: usage.files },
      lastEvent: events.at(-1) || null,
    }
  })
  return { root, storeFormat: process.env.KIM_STORE_FORMAT || 'json', base: latest?.latestRunId || null,
    gktg: gktg ? { runId: gktg.runId, revision: gktg.revision, complete: gktg.complete } : null,
    tropopause: trop ? { runId: trop.runId, revision: trop.revision, complete: trop.complete } : null, runs }
}

function stats(values) {
  let min = Infinity
  let max = -Infinity
  let missing = 0
  for (const value of values) {
    if (!Number.isFinite(value)) { missing += 1; continue }
    if (value < min) min = value
    if (value > max) max = value
  }
  return { min: Number.isFinite(min) ? +min.toPrecision(6) : null, max: Number.isFinite(max) ? +max.toPrecision(6) : null, missing, size: values.length }
}

function nearestIndex(grid, lat, lon) {
  const x = Math.round((lon - grid.lonMin) / grid.dx)
  const y = Math.round((lat - grid.latMin) / grid.dy)
  if (x < 0 || y < 0 || x >= grid.nx || y >= grid.ny) throw new Error('지점이 격자 밖입니다')
  return { x, y, index: y * grid.nx + x, lat: +(grid.latMin + y * grid.dy).toFixed(4), lon: +(grid.lonMin + x * grid.dx).toFixed(4) }
}

function levelDetail() {
  const hf = Number(args.hf ?? 0)
  const levelId = args.level || '850hPa'
  const grid = store.readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc: args.run, hf, levelId, domain })
  const point = args.point ? nearestIndex(grid.grid, ...args.point.split(',').map(Number)) : null
  const variables = Object.fromEntries(Object.entries(grid.variables).map(([name, variable]) => {
    const decoded = decodeComponent(variable.values, variable)
    return [name, { unit: variable.unit, ...stats(decoded), ...(point ? { atPoint: decoded[point.index] } : {}) }]
  }))
  const storagePath = ['grid.nc', 'grid.json'].map(name => path.join(path.dirname(store.resolveKimNwpGridPath({ root, model: KIM_NWP_MODEL, tmfc: args.run, hf, levelId, domain })), name)).filter(file => fs.existsSync(file))
  return { run: args.run, hf, level: levelId, validTime: grid.validTime, grid: grid.grid, files: storagePath.map(file => path.relative(root, file)), point, variables }
}

function compare() {
  const result = { compared: 0, equal: 0, mismatches: [] }
  walk(runDir(args.run), (file) => {
    if (!file.endsWith('.nc')) return
    const json = `${file.slice(0, -3)}.json`
    if (!fs.existsSync(json)) return
    result.compared += 1
    try {
      if (isDeepStrictEqual(readKimNcDocument(file), JSON.parse(fs.readFileSync(json, 'utf8')))) result.equal += 1
      else result.mismatches.push({ file: path.relative(root, file), reason: 'value_mismatch' })
    } catch (error) {
      result.mismatches.push({ file: path.relative(root, file), reason: error.message })
    }
  })
  return result
}

if (args.compare) {
  if (!args.run) throw new Error('--compare에는 --run이 필요합니다')
  const result = compare()
  out(result)
  if (result.mismatches.length) process.exitCode = 1
} else if (args.events) {
  if (!args.run) throw new Error('--events에는 --run이 필요합니다')
  const events = readKimRunEvents(runDir(args.run)).slice(-Number(args.events || 30))
  for (const event of events) console.log(JSON.stringify(event))
} else if (args.run) {
  out(levelDetail())
} else {
  out(summary())
}
