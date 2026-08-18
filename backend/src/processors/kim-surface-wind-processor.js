import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { parseKimGridText } from '../parsers/kim-grid-parser.js'
import store from '../store.js'
import {
  KIM_NWP_FORECAST_HOURS,
  KIM_NWP_LEVELS,
  KIM_NWP_MODEL,
  buildKimNwpGrid,
  buildKimNwpIndex,
  buildKimNwpIndexEntry,
  buildKimWindGrid,
  buildKimSurfaceWindFieldFromWindGrid,
  isKimNwpIcingLevel,
  isKimNwpMoistureLevel,
} from './kim-nwp-model.js'
import {
  buildKimNwpRunId,
  cleanupKimNwpRuns,
  readKimNwpGrid,
  readKimNwpGridSafe,
  readKimNwpIndex,
  readKimNwpLatest,
  resolveKimNwpGridPath,
  resolveKimNwpRunDir,
  writeKimNwpGrid,
  writeKimNwpIndex,
  writeKimNwpLatest,
  writeKimNwpManifest,
} from './kim-nwp-store.js'
import { selectNearestForecastHour } from './kim-forecast-hour.js'
import { selectKimRunCredential } from './kim-run-credential.js'

const TYPE = 'kim_surface_wind'
const MODEL = 'KIMG/NE57'
const SYNOPTIC_HOURS = [0, 6, 12, 18]
const DEFAULT_ICING_VARIABLES = ['w', 'rh_liq', 'tqc', 'tqi', 'tqr', 'tqs', 'cld']
const ICING_UNIT_BY_VARIABLE = {
  w: 'm/s',
  rh_liq: '%',
  tqc: 'kg/kg',
  tqi: 'kg/kg',
  tqr: 'kg/kg',
  tqs: 'kg/kg',
  cld: '1',
}

function formatTmfc(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  return `${y}${m}${d}${h}`
}

function latestSynopticCycle(date) {
  const utc = new Date(date)
  const hour = utc.getUTCHours()
  const cycleHour = [...SYNOPTIC_HOURS].reverse().find((candidate) => candidate <= hour) ?? 18
  if (cycleHour === 18 && hour < 18) utc.setUTCDate(utc.getUTCDate() - 1)
  utc.setUTCHours(cycleHour, 0, 0, 0)
  return utc
}

export function resolveKimSurfaceWindCandidates(now = new Date()) {
  const cycle = latestSynopticCycle(now)
  return Array.from({ length: 8 }, (_, index) => {
    const candidate = new Date(cycle.getTime() - index * 6 * 60 * 60 * 1000)
    return { tmfc: formatTmfc(candidate), hf: 0 }
  })
}

function validateGridPair(uGrid, vGrid) {
  if (!uGrid || !vGrid) throw new Error('KIM surface wind requires u and v grids')
  if (uGrid.nx !== vGrid.nx || uGrid.ny !== vGrid.ny) {
    throw new Error('KIM u/v grids have different dimensions')
  }
  if (uGrid.values.length !== vGrid.values.length) {
    throw new Error('KIM u/v grids have different value counts')
  }
}

function expectedDimension(min, max, step) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return null
  return Math.round((max - min) / step) + 1
}

function validateGridBounds(grid) {
  const bounds = grid?.bounds || {}
  const expectedNx = expectedDimension(bounds.lonMin, bounds.lonMax, bounds.dx)
  const expectedNy = expectedDimension(bounds.latMin, bounds.latMax, bounds.dy)
  if (expectedNx && grid.nx !== expectedNx) {
    throw new Error(`KIM grid nx mismatch: expected ${expectedNx}, got ${grid.nx}`)
  }
  if (expectedNy && grid.ny !== expectedNy) {
    throw new Error(`KIM grid ny mismatch: expected ${expectedNy}, got ${grid.ny}`)
  }
}

export function buildKimSurfaceWindField({ uGrid, vGrid, tmfc, hf, fetchedAt = new Date().toISOString() }) {
  validateGridPair(uGrid, vGrid)
  validateGridBounds(uGrid)

  const grid = buildKimNwpGrid({
    model: MODEL,
    tmfc,
    hf,
    level: KIM_NWP_LEVELS[0],
    components: [
      { ...uGrid, variable: 'u' },
      { ...vGrid, variable: 'v' },
    ],
    fetchedAt,
  })
  return buildKimSurfaceWindFieldFromWindGrid(grid)
}

export function resolveKimTemperatureComponentRequest({ level }) {
  if (level?.id === '10m') {
    return { data: 'U', name: 't2m', level: 0, variable: 'T', unit: 'K' }
  }
  return { data: 'P', name: 'T', level: level.level, variable: 'T', unit: 'K' }
}

export function resolveKimHumidityComponentRequest({ level }) {
  if (!isKimNwpMoistureLevel(level)) return null
  return { data: 'P', name: 'rh', level: level.level, variable: 'rh', unit: '%' }
}

export function resolveKimSpecificHumidityComponentRequest({
  level,
  collectSpecificHumidity = config.kim_nwp?.collect_specific_humidity !== false,
} = {}) {
  if (!collectSpecificHumidity || !isKimNwpMoistureLevel(level)) return null
  return { data: 'P', name: 'q', level: level.level, variable: 'q', unit: 'kg/kg' }
}

export function resolveKimHgtComponentRequest({ level }) {
  if (level?.kind !== 'pressure') return null
  return { data: 'P', name: 'hgt', level: level.level, variable: 'hgt', unit: 'm' }
}

export function resolveKimIcingComponentRequests({
  level,
  collectIcing = config.kim_nwp?.collect_icing !== false,
  variables = config.kim_nwp?.icing_variables || DEFAULT_ICING_VARIABLES,
} = {}) {
  if (!collectIcing || !isKimNwpIcingLevel(level)) return []
  return variables.map((name) => ({
    data: 'P',
    name,
    level: level.level,
    variable: name,
    unit: ICING_UNIT_BY_VARIABLE[name] || '',
  }))
}

function rawComponentFileName({ level, name, variable }) {
  if (variable === 'T') return 'T.txt'
  if (variable === 'rh') return 'rh.txt'
  if (variable === 'hgt') return 'hgt.txt'
  if (variable === 'q') return 'q.txt'
  if (DEFAULT_ICING_VARIABLES.includes(variable)) return `${variable}.txt`
  return `${name === level.uName ? 'u' : 'v'}.txt`
}

function writeRawComponent({ level, tmfc, hf, name, variable, text }) {
  if (config.kim_nwp?.keep_raw === false) return
  const runDir = resolveKimNwpRunDir({ root: config.storage.base_path, model: KIM_NWP_MODEL, tmfc })
  const rawPath = path.join(runDir, 'raw', `hf${String(Number(hf)).padStart(3, '0')}`, level.id, rawComponentFileName({ level, name, variable }))
  fs.mkdirSync(path.dirname(rawPath), { recursive: true })
  fs.writeFileSync(rawPath, text, 'utf8')
}

async function fetchComponentForLevel({ name, level, tmfc, hf, credential }) {
  const kim = config.kim_surface_wind
  const text = await fetchKimGrid({
    data: level.kind === 'pressure' ? 'P' : 'U',
    name,
    level: level.level,
    tmfc,
    hf,
    sub: kim.sub,
    map: 'S',
    disp: 'A',
    credential,
  })
  writeRawComponent({ level, tmfc, hf, name, variable: name, text })
  return parseKimGridText(text, {
    variable: name,
    level: level.level,
    bounds: kim.bounds,
  })
}

async function fetchTemperatureComponent({ level, tmfc, hf, credential }) {
  const kim = config.kim_surface_wind
  const request = resolveKimTemperatureComponentRequest({ level })
  const text = await fetchKimGrid({
    data: request.data,
    name: request.name,
    level: request.level,
    tmfc,
    hf,
    sub: kim.sub,
    map: 'S',
    disp: 'A',
    credential,
  })
  writeRawComponent({ level, tmfc, hf, name: request.name, variable: 'T', text })
  const grid = parseKimGridText(text, {
    variable: request.name,
    level: request.level,
    bounds: kim.bounds,
  })
  return { ...grid, variable: request.variable, unit: request.unit }
}

async function fetchHumidityComponent({ level, tmfc, hf, credential }) {
  const kim = config.kim_surface_wind
  const request = resolveKimHumidityComponentRequest({ level })
  if (!request) return null
  const text = await fetchKimGrid({
    data: request.data,
    name: request.name,
    level: request.level,
    tmfc,
    hf,
    sub: kim.sub,
    map: 'S',
    disp: 'A',
    credential,
  })
  writeRawComponent({ level, tmfc, hf, name: request.name, variable: 'rh', text })
  const grid = parseKimGridText(text, {
    variable: request.name,
    level: request.level,
    bounds: kim.bounds,
  })
  return { ...grid, variable: request.variable, unit: request.unit }
}

async function fetchIcingComponent({ request, level, tmfc, hf, credential }) {
  const kim = config.kim_surface_wind
  const text = await fetchKimGrid({
    data: request.data,
    name: request.name,
    level: request.level,
    tmfc,
    hf,
    sub: kim.sub,
    map: 'S',
    disp: 'A',
    credential,
  })
  writeRawComponent({ level, tmfc, hf, name: request.name, variable: request.variable, text })
  const grid = parseKimGridText(text, {
    variable: request.name,
    level: request.level,
    bounds: kim.bounds,
  })
  return { ...grid, variable: request.variable, unit: request.unit }
}

export async function fetchIcingComponents({ level, tmfc, hf, credential }) {
  const components = []
  let lastError = null
  const requests = resolveKimIcingComponentRequests({ level })
  for (const request of requests) {
    try {
      components.push(await fetchIcingComponent({ request, level, tmfc, hf, credential }))
    } catch (error) {
      lastError = error
    }
  }
  return { components, lastError }
}

async function fetchWindGrid({ level, tmfc, hf, credential }) {
  const [uComponent, vComponent] = await Promise.all([
    fetchComponentForLevel({ name: level.uName, level, tmfc, hf, credential }),
    fetchComponentForLevel({ name: level.vName, level, tmfc, hf, credential }),
  ])
  validateGridBounds(uComponent)
  return buildKimWindGrid({
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    level,
    components: [
      { ...uComponent, variable: 'u' },
      { ...vComponent, variable: 'v' },
    ],
  })
}

async function addTemperatureToGrid({ grid, level, tmfc, hf, credential }) {
  const tempComponent = await fetchTemperatureComponent({ level, tmfc, hf, credential })
  validateGridBounds(tempComponent)
  return {
    ...grid,
    variables: {
      ...grid.variables,
      T: buildKimNwpGrid({
        model: KIM_NWP_MODEL,
        tmfc,
        hf,
        level,
        components: [tempComponent],
        fetchedAt: grid.fetched_at,
      }).variables.T,
    },
    fetched_at: new Date().toISOString(),
  }
}

export function mergeHumidityComponentIntoGrid({ grid, level, tmfc, hf, humidityComponent, fetchedAt = new Date().toISOString() }) {
  if (!humidityComponent) return grid
  validateGridBounds(humidityComponent)
  return {
    ...grid,
    variables: {
      ...grid.variables,
      rh: buildKimNwpGrid({
        model: KIM_NWP_MODEL,
        tmfc,
        hf,
        level,
        components: [humidityComponent],
        fetchedAt: grid.fetched_at,
      }).variables.rh,
    },
    fetched_at: fetchedAt,
  }
}

export function mergeHgtComponentIntoGrid({ grid, level, tmfc, hf, hgtComponent, fetchedAt = new Date().toISOString() }) {
  if (!hgtComponent) return grid
  validateGridBounds(hgtComponent)
  return {
    ...grid,
    variables: {
      ...grid.variables,
      hgt: buildKimNwpGrid({
        model: KIM_NWP_MODEL,
        tmfc,
        hf,
        level,
        components: [hgtComponent],
        fetchedAt: grid.fetched_at,
      }).variables.hgt,
    },
    fetched_at: fetchedAt,
  }
}

async function addHumidityToGrid({ grid, level, tmfc, hf, credential }) {
  const humidityComponent = await fetchHumidityComponent({ level, tmfc, hf, credential })
  return mergeHumidityComponentIntoGrid({ grid, level, tmfc, hf, humidityComponent })
}

async function fetchHgtComponent({ level, tmfc, hf, credential }) {
  const kim = config.kim_surface_wind
  const request = resolveKimHgtComponentRequest({ level })
  if (!request) return null
  const text = await fetchKimGrid({
    data: request.data,
    name: request.name,
    level: request.level,
    tmfc,
    hf,
    sub: kim.sub,
    map: 'S',
    disp: 'A',
    credential,
  })
  writeRawComponent({ level, tmfc, hf, name: request.name, variable: 'hgt', text })
  const grid = parseKimGridText(text, {
    variable: request.name,
    level: request.level,
    bounds: kim.bounds,
  })
  return { ...grid, variable: request.variable, unit: request.unit }
}

async function addHgtToGrid({ grid, level, tmfc, hf, credential }) {
  const hgtComponent = await fetchHgtComponent({ level, tmfc, hf, credential })
  return mergeHgtComponentIntoGrid({ grid, level, tmfc, hf, hgtComponent })
}

async function fetchSpecificHumidityComponent({ level, tmfc, hf, credential }) {
  const kim = config.kim_surface_wind
  const request = resolveKimSpecificHumidityComponentRequest({ level })
  if (!request) return null
  const text = await fetchKimGrid({
    data: request.data,
    name: request.name,
    level: request.level,
    tmfc,
    hf,
    sub: kim.sub,
    map: 'S',
    disp: 'A',
    credential,
  })
  writeRawComponent({ level, tmfc, hf, name: request.name, variable: 'q', text })
  const grid = parseKimGridText(text, {
    variable: request.name,
    level: request.level,
    bounds: kim.bounds,
  })
  return { ...grid, variable: request.variable, unit: request.unit }
}

export function mergeSpecificHumidityComponentIntoGrid({ grid, level, tmfc, hf, specificHumidityComponent, fetchedAt = new Date().toISOString() }) {
  if (!specificHumidityComponent) return grid
  validateGridBounds(specificHumidityComponent)
  return {
    ...grid,
    variables: {
      ...grid.variables,
      q: buildKimNwpGrid({
        model: KIM_NWP_MODEL,
        tmfc,
        hf,
        level,
        components: [specificHumidityComponent],
        fetchedAt: grid.fetched_at,
      }).variables.q,
    },
    fetched_at: fetchedAt,
  }
}

async function addSpecificHumidityToGrid({ grid, level, tmfc, hf, credential }) {
  const specificHumidityComponent = await fetchSpecificHumidityComponent({ level, tmfc, hf, credential })
  return mergeSpecificHumidityComponentIntoGrid({ grid, level, tmfc, hf, specificHumidityComponent })
}

export function mergeIcingComponentsIntoGrid({ grid, level, tmfc, hf, icingComponents = [], fetchedAt = new Date().toISOString() }) {
  if (!icingComponents.length) return grid
  const variables = { ...grid.variables }
  for (const component of icingComponents) {
    validateGridBounds(component)
    variables[component.variable] = buildKimNwpGrid({
      model: KIM_NWP_MODEL,
      tmfc,
      hf,
      level,
      components: [component],
      fetchedAt: grid.fetched_at,
    }).variables[component.variable]
  }
  return {
    ...grid,
    variables,
    fetched_at: fetchedAt,
  }
}

async function addIcingToGrid({ grid, level, tmfc, hf, credential }) {
  const { components, lastError } = await fetchIcingComponents({ level, tmfc, hf, credential })
  return {
    grid: mergeIcingComponentsIntoGrid({ grid, level, tmfc, hf, icingComponents: components }),
    lastError,
  }
}

function requiredVariablesForTask(level, {
  collectIcing = config.kim_nwp?.collect_icing !== false,
  collectSpecificHumidity = config.kim_nwp?.collect_specific_humidity !== false,
} = {}) {
  const variables = ['u', 'v', 'T']
  if (level?.kind === 'pressure') variables.push('hgt')
  if (isKimNwpMoistureLevel(level)) variables.push('rh')
  if (collectSpecificHumidity && isKimNwpMoistureLevel(level)) variables.push('q')
  if (collectIcing && isKimNwpIcingLevel(level)) {
    variables.push(...(config.kim_nwp?.icing_variables || DEFAULT_ICING_VARIABLES))
  }
  return variables
}

function hasGridVariables(grid, requiredVariables = []) {
  return requiredVariables.every((name) => grid?.variables?.[name])
}

export async function collectKimNwpTask({
  task,
  fetchWind = fetchWindGrid,
  addTemperature = addTemperatureToGrid,
  addHgt = addHgtToGrid,
  addHumidity = addHumidityToGrid,
  addSpecificHumidity = addSpecificHumidityToGrid,
  addIcing = addIcingToGrid,
  collectIcing = config.kim_nwp?.collect_icing !== false,
  collectSpecificHumidity = config.kim_nwp?.collect_specific_humidity !== false,
  incrementalRetry = config.kim_nwp?.incremental_retry !== false,
  readExistingGrid = ({ level, tmfc, hf }) => readKimNwpGridSafe({
    root: config.storage.base_path,
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    levelId: level.id,
  }),
  writeGrid = (grid) => writeKimNwpGrid({ root: config.storage.base_path, grid }),
}) {
  if (incrementalRetry) {
    const existingGrid = readExistingGrid(task)
    if (hasGridVariables(existingGrid, requiredVariablesForTask(task.level, { collectIcing, collectSpecificHumidity }))) {
      return { grid: existingGrid, lastError: null, reused: true }
    }
  }

  const windGrid = await fetchWind(task)
  let grid = windGrid
  let lastError = null
  try {
    grid = await addTemperature({ grid: windGrid, ...task })
  } catch (error) {
    lastError = error
  }
  try {
    grid = await addHgt({ grid, ...task })
  } catch (error) {
    lastError = error
  }
  try {
    grid = await addHumidity({ grid, ...task })
  } catch (error) {
    lastError = error
  }
  if (collectSpecificHumidity) {
    try {
      grid = await addSpecificHumidity({ grid, ...task })
    } catch (error) {
      lastError = error
    }
  }
  if (collectIcing) {
    try {
      const result = await addIcing({ grid, ...task })
      grid = result.grid
      if (result.lastError) lastError = result.lastError
    } catch (error) {
      lastError = error
    }
  }
  writeGrid(grid)
  return { grid, lastError }
}

export async function mapKimNwpTasksWithConcurrency(items, concurrency, worker) {
  const results = []
  let nextIndex = 0
  let firstError = null
  async function run() {
    while (!firstError && nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = await worker(items[index])
      } catch (error) {
        firstError ||= error
        break
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Number(concurrency) || 1, items.length) }, run))
  if (firstError) throw firstError
  return results
}

export function shouldPublishKimNwpRun({ entries, expectedGridCount }) {
  if (!Array.isArray(entries) || entries.length === 0) return false
  return entries.every((entry) => entry.variables?.includes('u') && entry.variables?.includes('v'))
}

export function hasCompleteKimNwpRun({
  latest,
  index,
  tmfc,
  forecastHours = KIM_NWP_FORECAST_HOURS,
  levels = KIM_NWP_LEVELS,
  collectIcing = config.kim_nwp?.collect_icing !== false,
  collectSpecificHumidity = config.kim_nwp?.collect_specific_humidity !== false,
  icingVariables = config.kim_nwp?.icing_variables || DEFAULT_ICING_VARIABLES,
}) {
  if (!latest || !index || latest.latestRun !== tmfc || index.latestRun !== tmfc) return false
  for (const level of levels) {
    for (const hf of forecastHours) {
      const variables = index.availability?.[level.id]?.[String(hf)]?.variables || []
      if (!variables.includes('u') || !variables.includes('v') || !variables.includes('T')) return false
      if (level.kind === 'pressure' && !variables.includes('hgt')) return false
      if (isKimNwpMoistureLevel(level) && !variables.includes('rh')) return false
      if (collectSpecificHumidity && isKimNwpMoistureLevel(level) && !variables.includes('q')) return false
      if (collectIcing && isKimNwpIcingLevel(level) && !icingVariables.every((name) => variables.includes(name))) return false
    }
  }
  return true
}

export function selectLegacySurfaceWindGrid(grids = []) {
  return grids.find((grid) => grid?.level?.id === '10m' && Number(grid?.hf) === 0)
    || null
}

export function resolveCollectedForecastHours({ tmfc, nowMs = Date.now(), candidateHours, single }) {
  if (!single) return [...candidateHours]
  return [selectNearestForecastHour({ tmfc, nowMs, candidateHours })]
}

export async function process({ candidates = resolveKimSurfaceWindCandidates() } = {}) {
  let lastError = null

  for (const candidate of candidates) {
    const credential = selectKimRunCredential({
      tmfc: candidate.tmfc,
      kimCredential: config.api.kim_nwp_auth_key,
      aviationCredential: config.api.auth_key,
    })
    const candidateHours = config.kim_nwp?.forecast_hours || KIM_NWP_FORECAST_HOURS
    const forecastHours = resolveCollectedForecastHours({
      tmfc: candidate.tmfc,
      candidateHours,
      single: config.kim_nwp?.single_forecast !== false,
    })
    if (hasCompleteKimNwpRun({
      latest: readKimNwpLatest(config.storage.base_path),
      index: readKimNwpIndex(config.storage.base_path),
      tmfc: candidate.tmfc,
      forecastHours,
      levels: KIM_NWP_LEVELS,
      collectIcing: config.kim_nwp?.collect_icing !== false,
    })) {
      return {
        type: TYPE,
        skipped: true,
        reason: 'kim_nwp_latest_run_complete',
        tmfc: candidate.tmfc,
      }
    }
    const entries = []
    let surfaceGrid = null
    const tasks = []
    for (const hf of forecastHours) {
      for (const level of KIM_NWP_LEVELS) tasks.push({ level, tmfc: candidate.tmfc, hf, credential })
    }

    const latestRunId = buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc: candidate.tmfc })
    const expectedGridCount = forecastHours.length * KIM_NWP_LEVELS.length

    await mapKimNwpTasksWithConcurrency(tasks, config.kim_nwp?.concurrency || 4, async (task) => {
      try {
        const { grid, lastError: taskError } = await collectKimNwpTask({
          task,
          collectIcing: config.kim_nwp?.collect_icing !== false,
          incrementalRetry: config.kim_nwp?.incremental_retry !== false,
        })
        if (taskError) lastError = taskError
        entries.push(buildKimNwpIndexEntry(grid, path.relative(
          config.storage.base_path,
          resolveKimNwpGridPath({
            root: config.storage.base_path,
            model: grid.model,
            tmfc: grid.tmfc,
            hf: grid.hf,
            levelId: grid.level.id,
          }),
        ).replace(/\\/g, '/')))
        if (grid.level?.id === '10m' && Number(grid.hf) === 0) surfaceGrid = grid
      } catch (error) {
        lastError = error
        throw error
      }
    }).catch((error) => {
      lastError = error
    })

    if (!shouldPublishKimNwpRun({ entries, expectedGridCount })) {
      writeKimNwpManifest(config.storage.base_path, {
        type: 'kim_nwp_manifest',
        model: KIM_NWP_MODEL,
        tmfc: candidate.tmfc,
        runId: latestRunId,
        usable: false,
        gridCount: entries.length,
        expectedGridCount,
        updated_at: new Date().toISOString(),
      })
      continue
    }
    const index = buildKimNwpIndex({
      model: KIM_NWP_MODEL,
      tmfc: candidate.tmfc,
      entries,
    })
    const complete = hasCompleteKimNwpRun({
      latest: { latestRun: candidate.tmfc },
      index,
      tmfc: candidate.tmfc,
      forecastHours,
      levels: KIM_NWP_LEVELS,
      collectIcing: config.kim_nwp?.collect_icing !== false,
    })
    writeKimNwpManifest(config.storage.base_path, {
      type: 'kim_nwp_manifest',
      model: KIM_NWP_MODEL,
      tmfc: candidate.tmfc,
      runId: latestRunId,
      usable: true,
      complete,
      gridCount: entries.length,
      expectedGridCount,
      updated_at: new Date().toISOString(),
    })
    writeKimNwpIndex(config.storage.base_path, index)
    writeKimNwpLatest(config.storage.base_path, {
      type: 'kim_nwp_latest',
      model: KIM_NWP_MODEL,
      latestRun: candidate.tmfc,
      latestRunId,
      indexPath: 'kim_nwp/index.json',
      updated_at: new Date().toISOString(),
      content_hash: store.canonicalHash(index),
    })
    cleanupKimNwpRuns({ root: config.storage.base_path, maxRuns: config.kim_nwp?.max_runs || 2, latestRunId })

    if (!surfaceGrid) {
      return {
        type: TYPE,
        latestRun: candidate.tmfc,
        skippedLegacySurfaceWind: true,
        reason: 'kim_surface_wind_grid_unavailable',
      }
    }
    const field = buildKimSurfaceWindFieldFromWindGrid(surfaceGrid)
    return store.save(TYPE, field)
  }

  throw lastError || new Error('KIM surface wind collection failed')
}

export function readSelectedKimNwpField({ tmfc, hf, level }) {
  const grid = readKimNwpGrid({
    root: config.storage.base_path,
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    levelId: level,
  })
  return buildKimSurfaceWindFieldFromWindGrid(grid)
}

export default {
  process,
  buildKimSurfaceWindField,
  collectKimNwpTask,
  fetchIcingComponents,
  readSelectedKimNwpField,
  mergeIcingComponentsIntoGrid,
  mergeHumidityComponentIntoGrid,
  resolveKimHumidityComponentRequest,
  resolveKimIcingComponentRequests,
  resolveKimTemperatureComponentRequest,
  resolveKimSurfaceWindCandidates,
  mapKimNwpTasksWithConcurrency,
  hasCompleteKimNwpRun,
  selectLegacySurfaceWindGrid,
  shouldPublishKimNwpRun,
}
