import { describeWeatherFrame } from './pinned-map-resources.js'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readKimNwpIndex, readKimNwpLatest, resolveKimNwpRunDir } from '../processors/kim-nwp-store.js'
import { readKtgIndex, readKtgLatest, resolveKtgRunDir } from '../processors/ktg-store.js'
import { loadRouteCrossSection } from './enroute-cross-section.js'

const TYPES = ['metar', 'taf', 'warning', 'sigmet', 'airmet', 'lightning', 'amos', 'takeoff_fcst', 'typhoon', 'metar_overseas', 'taf_overseas', 'sigmet_overseas']
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const safeRead = (fn) => { try { return fn() } catch { return null } }

export function organizationModelStorageRevision(dataRoot, sourceState) {
  const files = []
  function visit(directory) {
    let entries
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { files.push([directory, 'missing']); return }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(filename)
      else if (['grid.json', 'coords.json'].includes(entry.name)) {
        const stat = safeRead(() => fs.statSync(filename, { bigint: true }))
        files.push([filename, ...(stat ? [stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String) : ['missing'])])
      }
    }
  }
  const kim = sourceState?.kim?.latest ?? safeRead(() => readKimNwpLatest(dataRoot))
  const ktg = sourceState?.ktg?.latest ?? safeRead(() => readKtgLatest(dataRoot))
  if (kim?.latestRun) visit(path.join(resolveKimNwpRunDir({ root: dataRoot, model: kim.model || 'KIMG/NE57', tmfc: kim.latestRun }), 'normalized'))
  if (ktg?.tmfc) visit(resolveKtgRunDir({ root: dataRoot, tmfc: ktg.tmfc }))
  return digest(files)
}

export function createOrganizationWeatherDependencies({ dataRoot, readWeather, getDataContext, getNow, terrainSampler }) {
  function readWeatherSnapshot() {
    const context = getDataContext()
    const weather = Object.fromEntries(TYPES.map((type) => [type, readWeather(type)]))
    const sourceState = {
      kim: { index: safeRead(() => readKimNwpIndex(dataRoot)), latest: safeRead(() => readKimNwpLatest(dataRoot)) },
      ktg: { index: safeRead(() => readKtgIndex(dataRoot)), latest: safeRead(() => readKtgLatest(dataRoot)) },
    }
    const frameMetadata = Object.fromEntries(['radar/echo_meta.json', 'satellite/sat_meta.json'].map((name) => [name,
      safeRead(() => JSON.parse(fs.readFileSync(path.join(dataRoot, name), 'utf8'))),
    ]))
    const effectiveNowMs = getNow().getTime()
    const frames = {
      radar: describeWeatherFrame(dataRoot, 'radar', frameMetadata['radar/echo_meta.json'], effectiveNowMs),
      satellite: describeWeatherFrame(dataRoot, 'satellite', frameMetadata['satellite/sat_meta.json'], effectiveNowMs),
    }
    const modelStorageRevision = organizationModelStorageRevision(dataRoot, sourceState)
    const sourceRevision = digest({ context: context.revision, weather, sourceState, modelStorageRevision, frameMetadata, frames })
    return { dataRoot, weather, sourceState, sourceRevision, contextRevision: sourceRevision,
      dataContext: context, isDemo: context.mode !== 'live', effectiveNowMs: getNow().getTime(),
      frameMetadata, mapDataSelection: { frames },
      provenance: { dataMode: context.mode, sourceRevision,
        snapshots: Object.fromEntries(Object.entries(weather).map(([key, value]) => [key, { fetchedAt: value?.fetched_at ?? null, revision: value?.content_hash ?? null }])) },
    }
  }
  return { readWeatherSnapshot, terrainSampler,
    loadRouteCrossSection(args) {
      return loadRouteCrossSection({ ...args, allowPartialModels: true, cacheRevision: organizationModelStorageRevision(args.root) })
    },
    assertDataContextUnchanged(revision) {
      if (readWeatherSnapshot().contextRevision !== revision) {
        const error = new Error('data_context_changed')
        error.code = 'DATA_CONTEXT_CHANGED'
        throw error
      }
    },
  }
}
