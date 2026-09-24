import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createDataContext } from './data-context.js'
import { createReferenceStore } from './reference-store.js'
import { executeBriefing, BRIEFING_DATASETS } from '../briefing/briefing-service.js'
import { getAirportWeather } from './tools/get-airport-weather.js'
import { getRouteBriefing } from './tools/get-route-briefing.js'
import { getBriefingDetail } from './tools/get-briefing-detail.js'
import { getWeatherAdvisories } from './tools/get-weather-advisories.js'
import { briefingFailure } from './briefing-contracts.js'
import { normalizeRouteContext } from './route-context.js'
import { createProcedureCatalog } from './procedure-catalog.js'
import { createDefaultTerrainSampler } from '../terrain/terrain-sampler.js'
import { compareRouteAltitudes } from './tools/compare-route-altitudes.js'
import { readStoredBriefing } from './stored-briefing.js'
import { createFileRoutePlanningProvider } from '../briefing/route-planning-provider.js'
import { planRouteTool } from './tools/plan-route.js'

const MAX_FILE_BYTES = 32 * 1024 * 1024
const hash = (value) => createHash('sha256').update(value).digest('hex')

export function readLocalSnapshot(root, kind) {
  // Dataset names are application constants, never model-controlled file paths.
  if (!Object.values(BRIEFING_DATASETS).includes(kind)) throw new Error('Unknown dataset')
  const file = path.join(root, kind, 'latest.json')
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Invalid snapshot size')
    const bytes = fs.readFileSync(fd)
    if (bytes.length > MAX_FILE_BYTES) throw new Error('Invalid snapshot size')
    const snapshot = JSON.parse(bytes)
    return { snapshot, meta: { contentHash: hash(bytes), snapshotId: `${kind}:${hash(bytes)}` } }
  } catch (error) {
    if (error.code === 'ENOENT') return { snapshot: null }
    throw new Error('Snapshot read failed')
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

export function createLocalRuntime({ dataRoot, fixture = null, now = Date.now, displayTimezone = 'Asia/Seoul',
  navdata = null, procedureRoot = null, planningOptions = {},
  createPlanningProvider = () => createFileRoutePlanningProvider(planningOptions),
  readSnapshot = (kind) => readLocalSnapshot(dataRoot, kind) }) {
  const references = createReferenceStore({ now })
  const resolveProcedure = procedureRoot ? createProcedureCatalog(procedureRoot) : null
  const terrainSampler = createDefaultTerrainSampler(dataRoot)
  const fixtures = new Map()
  const captured = new Map()
  const sources = []
  let planningProvider
  const getPlanningProvider = () => {
    planningProvider ??= Promise.resolve().then(createPlanningProvider).catch((error) => {
      planningProvider = null
      throw error
    })
    return planningProvider
  }
  const readPlanningWind = () => {
    try {
      const { snapshot, meta } = readSnapshot('metar')
      return { snapshot, source: { kind: 'planningMetar', status: snapshot ? 'available' : 'missing',
        snapshotId: meta?.snapshotId ?? null, contentHash: meta?.contentHash ?? (snapshot ? hash(JSON.stringify(snapshot)) : null),
        fetchedAt: snapshot?.fetched_at ?? null } }
    } catch {
      return { snapshot: null, source: { kind: 'planningMetar', status: 'invalid', snapshotId: null, contentHash: null, fetchedAt: null } }
    }
  }
  if (fixture) {
    // Pin weather objects at startup; no scheduler, writes or network collection.
    fixtures.set(fixture.id, structuredClone(fixture))
    for (const kind of Object.values(BRIEFING_DATASETS)) {
      try {
        const { snapshot, meta } = readSnapshot(kind)
        captured.set(kind, snapshot)
        sources.push({ kind, status: snapshot ? 'available' : 'missing',
          snapshotId: meta?.snapshotId ?? null, contentHash: meta?.contentHash ?? null,
          fetchedAt: snapshot?.fetched_at ?? null })
      } catch {
        captured.set(kind, null)
        sources.push({ kind, status: 'invalid', snapshotId: null, contentHash: null, fetchedAt: null })
      }
    }
    sources.push({ kind: 'airspaceZones', status: 'not_loaded' })
  }
  const airportContext = createDataContext({
    readers: Object.fromEntries(['metar', 'taf', 'warning'].map((kind) => [kind, () => readSnapshot(kind)])),
    weatherNow: fixture ? () => Date.parse(fixture.effectiveNow) : now,
    realNow: now, clockMode: fixture ? 'fixture' : 'live', displayTimezone,
  })
  // Airport reads in fixture mode must use the same pinned capture as the route.
  const fixedAirportContext = fixture ? createDataContext({
    readers: Object.fromEntries(['metar', 'taf', 'warning'].map((kind) => [kind, () => ({ snapshot: captured.get(kind) })])),
    weatherNow: () => Date.parse(fixture.effectiveNow), realNow: now, clockMode: 'fixture', displayTimezone,
  }) : airportContext
  return {
    // Workers pin a publication at startup. A failed capture does not disable
    // airport tools; planning retries a fresh capture and reports its own error.
    initializePlanning: () => fixture ? Promise.resolve(null) : getPlanningProvider(),
    registerContext(input, owner) {
      if (fixture) return briefingFailure('LIVE_CONTEXT_UNAVAILABLE_IN_FIXTURE')
      try {
        const normalized = normalizeRouteContext(input, { navdata, resolveProcedure })
        const ref = references.put(owner, 'context', normalized)
        return { status: 'ok', contextRef: ref.id, revision: normalized.revision,
          inputHash: ref.contentHash, expiresAt: ref.expiresAt, issues: normalized.issues }
      } catch (error) {
        return briefingFailure(error.status === 400 || error.code === 'RESULT_TOO_LARGE' ? error.code : 'CONTEXT_REGISTRATION_FAILED')
      }
    },
    getResult(ref, owner) {
      try {
        const result = readStoredBriefing(references, owner, ref)
        const { comparisonInputs, sections: _sections, baseBriefingRef: _base, baseResultHash: _hash, ...value } = result.value
        const model = comparisonInputs?.model
        return { status: 'ok', ...value, resultHash: result.contentHash, expiresAt: result.expiresAt,
          reference: { ...value.reference, briefingRef: ref, resultHash: result.contentHash, expiresAt: result.expiresAt },
          advisories: (comparisonInputs?.hazards ?? []).map(({ source, item }) => ({ ...item, kind: source.toLowerCase() })),
          verticalProfile: comparisonInputs?.verticalProfile ?? null,
          crossSection: model?.available ? { ...model.crossSection, turbulence: model.turbulence, availableTimes: model.availableTimes,
            timeRules: model.timeRules, nwpTimeAvailability: model.nwpTimeAvailability } : null }
      } catch (error) { return briefingFailure(error.code ?? 'REFERENCE_NOT_FOUND') }
    },
    async call(name, input, owner) {
      const context = { owner, references, fixtures, fixture, realNow: now, displayTimezone, getPlanningProvider, readPlanningWind,
        execute(selection) {
          if (!selection.id) {
            const live = new Map()
            const liveSources = []
            for (const kind of Object.values(BRIEFING_DATASETS)) {
              try {
                const { snapshot, meta } = readSnapshot(kind)
                live.set(kind, snapshot)
                liveSources.push({ kind, status: snapshot ? 'available' : 'missing',
                  contentHash: meta?.contentHash ?? (snapshot ? hash(JSON.stringify(snapshot)) : null),
                  snapshotId: meta?.snapshotId ?? null, fetchedAt: snapshot?.fetched_at ?? null })
              } catch {
                live.set(kind, null)
                liveSources.push({ kind, status: 'invalid', contentHash: null, snapshotId: null, fetchedAt: null })
              }
            }
            liveSources.push({ kind: 'airspaceZones', status: 'not_loaded' })
            return { ...executeBriefing(selection.request, {
              readCached: (kind) => live.get(kind), weatherNow: now, dataRoot, captureComparison: true, terrainSampler,
            }), sources: liveSources }
          }
          // No mutable model/AIP roots in fixture execution. Unsupported sources
          // remain explicit, instead of mixing newly loaded grids into old facts.
          const result = executeBriefing(selection.request, {
            readCached: (kind) => captured.get(kind) ?? null,
            weatherNow: () => Date.parse(selection.effectiveNow),
            enrouteCrossSection: { available: false },
            captureComparison: true,
          })
          return { ...result, sources }
        },
      }
      if (name === 'get_airport_weather') return getAirportWeather(input, fixedAirportContext)
      if (name === 'plan_route') return planRouteTool(input, context)
      if (name === 'get_weather_advisories') return getWeatherAdvisories(input, {
        ...context, weatherNow: fixedAirportContext.weatherNow, clockMode: fixedAirportContext.clockMode,
        readers: Object.fromEntries(['sigmet', 'airmet'].map((kind) => [kind, () => {
          if (!fixture) return readSnapshot(kind)
          if (sources.find((s) => s.kind === kind)?.status === 'invalid') throw new Error('Invalid pinned source')
          return { snapshot: captured.get(kind) ?? null }
        }])),
      })
      if (name === 'get_route_briefing') return getRouteBriefing(input, context)
      if (name === 'get_briefing_detail') return getBriefingDetail(input, context)
      if (name === 'compare_route_altitudes') return compareRouteAltitudes(input, context)
      return briefingFailure('UNKNOWN_TOOL')
    },
    clearOwner: (owner) => references.clearOwner(owner),
  }
}
