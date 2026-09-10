import { organizationMapWeather } from './map-weather.js'
import { composeBriefing } from '../briefing/briefing-composer.js'
import { loadRouteCrossSection } from '../briefing/enroute-cross-section.js'
import { buildVerticalProfile } from '../briefing/vertical-profile.js'
import { readExactKimMapGrid, readExactKtgMapGrid } from '../briefing/pinned-map-resources.js'
import { canonicalJson, OrganizationError, sha256 } from './common.js'
import { projectOrganizationAnnotations } from './geometry.js'

const EMPTY_SECTION = Object.freeze({ available: false, crossSection: null, turbulence: null })
const MODEL_VARIABLES = Object.freeze(['wind', 'temperature', 'icing', 'turbulence'])

function iso(value) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function addHours(value, hours) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && Number.isFinite(Number(hours))
    ? new Date(parsed + Number(hours) * 3_600_000).toISOString()
    : null
}

export function buildOrganizationBriefingRequest(flight, overrides = {}) {
  const snapshot = flight.snapshot ?? {}
  const form = snapshot.base?.routeForm ?? snapshot.routeForm ?? {}
  const stored = flight.profileRequest ?? {}
  const routeGeometry = snapshot.routeGeometry ?? snapshot.enrouteGeometry ?? stored.routeGeometry
  if (routeGeometry?.type !== 'LineString' || !Array.isArray(routeGeometry.coordinates) || routeGeometry.coordinates.length < 2) {
    throw new OrganizationError(422, 'flight_geometry_unavailable')
  }
  const storedEtd = iso(flight.etd ?? snapshot.etd)
  const storedEta = iso(flight.eta ?? snapshot.eta)
  const etd = overrides.etd == null ? storedEtd : iso(overrides.etd)
  if (!etd) throw new OrganizationError(400, 'invalid_input', { field: 'overrides.etd' })
  const durationMs = Date.parse(storedEta) - Date.parse(storedEtd)
  const eta = overrides.etd == null ? storedEta : new Date(Date.parse(etd) + durationMs).toISOString()
  if (!eta || !(Date.parse(eta) > Date.parse(etd))) throw new OrganizationError(422, 'flight_time_window_invalid')
  const altitude = overrides.cruiseAltitudeFt ?? stored.plannedCruiseAltitudeFt ?? snapshot.cruiseAltitudeFt
  if (!Number.isFinite(Number(altitude)) || Number(altitude) <= 0 || Number(altitude) > 60000) {
    throw new OrganizationError(400, 'invalid_input', { field: 'overrides.cruiseAltitudeFt' })
  }
  return {
    ...stored,
    flightRule: stored.flightRule ?? form.flightRule ?? 'IFR',
    departureAirport: stored.departureAirport ?? form.departureAirport ?? null,
    arrivalAirport: stored.arrivalAirport ?? form.arrivalAirport ?? null,
    alternateAirport: stored.alternateAirport ?? snapshot.alternateAirport ?? null,
    routeGeometry,
    routeModel: { ...(snapshot.routeModel ?? stored.routeModel ?? {}), routeGeometry },
    routeMarkers: snapshot.routeMarkers ?? stored.routeMarkers ?? [],
    procedureContext: stored.procedureContext ?? null,
    plannedCruiseAltitudeFt: Number(altitude),
    etd,
    eta,
    nwpTimeSelection: overrides.nwpTimeSelection ?? snapshot.nwpTimeSelection ?? stored.nwpTimeSelection ?? null,
  }
}

function requestedTimes(request) {
  const selection = request.nwpTimeSelection
  const base = iso(selection?.baseTime) ?? iso(request.etd)
  const values = [base]
  for (const override of selection?.waypointOverrides ?? []) values.push(addHours(base, override?.offsetHours))
  return values.filter(Boolean)
}

function finiteCoverage(values, predicate) {
  if (!values.length) return { any: false, complete: false }
  const hits = values.filter(predicate).length
  return { any: hits > 0, complete: hits === values.length }
}

function inspectVariables(raw) {
  const values = (raw?.crossSection?.levels ?? []).flatMap((level) => level.values ?? [])
  const turbulenceValues = (raw?.turbulence?.levels ?? []).flatMap((level) => level.values ?? [])
  return {
    wind: finiteCoverage(values, (value) => Number.isFinite(value?.u) && Number.isFinite(value?.v)),
    temperature: finiteCoverage(values, (value) => Number.isFinite(value?.t)),
    icing: finiteCoverage(values, (value) => Number.isFinite(value?.icing)),
    turbulence: finiteCoverage(turbulenceValues, (value) => Number.isFinite(value?.ktg)),
  }
}

function timeCoverage(values) {
  const times = values.map((item) => iso(item?.validTime)).filter(Boolean).sort()
  return { from: times[0] ?? null, to: times.at(-1) ?? null }
}

function routeAxisCovered(request, raw) {
  const samples = raw?.axis?.samples
  const route = request?.routeGeometry?.coordinates
  if (!Array.isArray(samples) || samples.length < 2 || !Array.isArray(route) || route.length < 2) return false
  const near = (sample, coordinate) => Math.abs(Number(sample?.lon) - Number(coordinate?.[0])) < 0.01
    && Math.abs(Number(sample?.lat) - Number(coordinate?.[1])) < 0.01
  return near(samples[0], route[0]) && near(samples.at(-1), route.at(-1))
}

function modelAltitudeCovered(request, raw) {
  const requested = Number(request?.plannedCruiseAltitudeFt)
  if (!Number.isFinite(requested)) return { kim: false, ktg: false }
  const pressures = (raw?.crossSection?.levels ?? []).map((level) => Number(level.pressure)).filter((value) => value > 0)
  const kimMaxFt = pressures.length ? 44330 * (1 - (Math.min(...pressures) / 1013.25) ** 0.1903) * 3.28084 : null
  const ktgMaxFt = Math.max(...(raw?.turbulence?.levels ?? []).map((level) => Number(level.altFt)).filter(Number.isFinite), -Infinity)
  return { kim: Number.isFinite(kimMaxFt) && kimMaxFt + 2000 >= requested, ktg: Number.isFinite(ktgMaxFt) && ktgMaxFt + 2000 >= requested }
}

export function validateOrganizationCrossSection({ request, result, sourceState = null } = {}) {
  const raw = result?.status === 'fulfilled' ? result.value : result
  const requestedTime = iso(request?.nwpTimeSelection?.baseTime) ?? iso(request?.etd)
  if (result?.status === 'rejected' || !raw) {
    return {
      status: 'unavailable', requestedTime, selectedValidTime: null,
      coverage: { from: null, to: null }, missingVariables: [...MODEL_VARIABLES],
      reason: result?.reason?.message ?? raw?.reason ?? 'model_unavailable',
      modelStatus: {
        kim: { status: 'unavailable', coverage: { from: null, to: null } },
        ktg: { status: 'unavailable', coverage: { from: null, to: null } },
      },
      composerInput: EMPTY_SECTION, displayData: null,
    }
  }
  const inspected = inspectVariables(raw)
  const times = requestedTimes(request)
  const coverage = timeCoverage(raw.availableTimes ?? [])
  const selectedValidTime = iso(raw.crossSection?.run?.validTime)
  const outside = !coverage.from || !coverage.to || times.some((time) => time < coverage.from || time > coverage.to)
  const ktgCoverage = sourceState ? timeCoverage(sourceState?.ktg?.index?.hours ?? []) : {
    from: iso(raw.turbulence?.run?.validTime), to: iso(raw.turbulence?.run?.validTime),
  }
  const ktgRun = raw.turbulence?.run
  const indexedKtgRun = !sourceState || (sourceState?.ktg?.index?.hours ?? []).some((entry) =>
    iso(entry?.validTime) === iso(ktgRun?.validTime)
    && (entry?.hf == null || Number(entry.hf) === Number(ktgRun?.hf))
    && (sourceState?.ktg?.latest?.tmfc == null || String(sourceState.ktg.latest.tmfc) === String(ktgRun?.tmfc)))
  const ktgOutside = !ktgRun?.validTime || !indexedKtgRun || !ktgCoverage.from || !ktgCoverage.to
    || times.some((time) => time < ktgCoverage.from || time > ktgCoverage.to)
  const ktgUsable = !ktgOutside && inspected.turbulence.any
  const axisCovered = routeAxisCovered(request, raw)
  const altitudeCovered = modelAltitudeCovered(request, raw)
  const expectedSamples = raw.axis?.samples?.length
  const kimSamplesCovered = Number.isSafeInteger(expectedSamples) && expectedSamples >= 2
    && (raw.crossSection?.levels ?? []).every((level) => (level.values ?? []).length === expectedSamples)
  const ktgSamplesCovered = Number.isSafeInteger(expectedSamples) && expectedSamples >= 2
    && (raw.turbulence?.levels ?? []).every((level) => (level.values ?? []).length === expectedSamples)
  const emptyKim = { ...(raw.crossSection ?? {}), available: false, run: null, levels: [] }
  const emptyKtg = { available: false, run: null, levels: [] }
  if (!raw.available && !ktgUsable) {
    return {
      status: 'unavailable', requestedTime, selectedValidTime: null,
      coverage, missingVariables: [...MODEL_VARIABLES], reason: raw.reason ?? 'model_unavailable',
      modelStatus: {
        kim: { status: 'unavailable', coverage },
        ktg: { status: ktgOutside ? 'out_of_range' : 'unavailable', coverage: ktgCoverage },
      },
      composerInput: EMPTY_SECTION, displayData: null,
    }
  }
  const kimOutside = !raw.available || outside || !selectedValidTime
    || selectedValidTime < coverage.from || selectedValidTime > coverage.to
  if (kimOutside) {
    const composerInput = ktgUsable
      ? { ...raw, available: true, crossSection: emptyKim, turbulence: raw.turbulence }
      : EMPTY_SECTION
    const missingVariables = ['wind', 'temperature', 'icing', ...(!ktgUsable ? ['turbulence'] : [])]
    return {
      status: 'out_of_range', requestedTime, selectedValidTime, coverage,
      missingVariables, reason: 'requested_time_outside_model_coverage', composerInput,
      modelStatus: {
        kim: { status: 'out_of_range', coverage, run: null },
        ktg: { status: ktgOutside ? 'out_of_range' : ktgUsable
          ? (inspected.turbulence.complete && axisCovered && ktgSamplesCovered && altitudeCovered.ktg ? 'available' : 'partial') : 'unavailable',
          coverage: ktgCoverage, run: ktgUsable ? raw.turbulence?.run ?? null : null },
      },
      displayData: {
        ...emptyKim, turbulence: ktgUsable ? raw.turbulence : emptyKtg,
        availableTimes: [], timeRules: null, nwpTimeAvailability: null,
        status: 'out_of_range', requestedTime, selectedValidTime, coverage, ktgCoverage, missingVariables,
      },
    }
  }
  const missingVariables = Object.entries(inspected).filter(([, state]) => !state.any).map(([name]) => name)
  const incompleteVariables = Object.entries(inspected).filter(([, state]) => state.any && !state.complete).map(([name]) => name)
  const ruleIncomplete = (raw.timeRules?.segments ?? []).some((segment) => !segment?.kim?.validTime || !segment?.ktg?.validTime)
  const kimIncomplete = ['wind', 'temperature', 'icing'].some((name) => !inspected[name].complete)
    || !axisCovered || !kimSamplesCovered || !altitudeCovered.kim
  const ktgIncomplete = !inspected.turbulence.complete || ruleIncomplete
    || !axisCovered || !ktgSamplesCovered || !altitudeCovered.ktg
  const status = ktgOutside ? 'out_of_range'
    : missingVariables.length || incompleteVariables.length || ruleIncomplete || kimIncomplete || ktgIncomplete ? 'partial' : 'available'
  const reason = ktgOutside ? 'requested_time_outside_ktg_coverage'
    : status === 'partial' ? (!axisCovered || !kimSamplesCovered || !ktgSamplesCovered || !altitudeCovered.kim || !altitudeCovered.ktg
      ? 'model_coverage_incomplete' : 'model_values_incomplete') : null
  const normalizedMissing = ktgOutside && !missingVariables.includes('turbulence') ? [...missingVariables, 'turbulence'] : missingVariables
  const composerInput = ktgOutside ? { ...raw, turbulence: emptyKtg } : raw
  return {
    status, requestedTime, selectedValidTime, coverage, missingVariables: normalizedMissing, incompleteVariables, reason,
    modelStatus: {
      kim: { status: kimIncomplete ? 'partial' : 'available', coverage, run: raw.crossSection?.run ?? null,
        reason: kimIncomplete ? reason : null },
      ktg: { status: ktgOutside ? 'out_of_range' : ktgIncomplete ? 'partial' : 'available', coverage: ktgCoverage,
        run: ktgOutside ? null : raw.turbulence?.run ?? null, reason: ktgOutside ? 'requested_time_outside_ktg_coverage' : ktgIncomplete ? reason : null },
    },
    composerInput,
    displayData: {
      ...composerInput.crossSection,
      turbulence: composerInput.turbulence,
      availableTimes: raw.availableTimes,
      timeRules: raw.timeRules,
      nwpTimeAvailability: raw.nwpTimeAvailability,
      status, requestedTime, selectedValidTime, coverage, ktgCoverage, missingVariables: normalizedMissing, incompleteVariables, reason,
    },
  }
}

export function buildOrganizationMapDataSelection(snapshot, validated) {
  const kimRun = validated.displayData?.run ?? null
  const ktgRun = validated.displayData?.turbulence?.run ?? null
  const map = snapshot?.mapDataSelection ?? {}
  return {
    mode: 'pinned',
    contextRevision: snapshot?.contextRevision ?? null,
    kim: kimRun ? { tmfc: kimRun.tmfc, hf: kimRun.hf, validTime: kimRun.validTime, status: validated.modelStatus?.kim?.status ?? validated.status } : null,
    ktg: ktgRun ? { tmfc: ktgRun.tmfc, hf: ktgRun.hf, validTime: ktgRun.validTime, status: validated.modelStatus?.ktg?.status ?? validated.status } : null,
    frames: map.frames ?? null,
    radar: map.frames?.radar ?? map.radar ?? null,
    satellite: map.frames?.satellite ?? map.satellite ?? null,
    sourceRevision: snapshot?.sourceRevision ?? null,
  }
}

function withExactModelResources(selection, snapshot, validated) {
  const root = snapshot?.dataRoot
  if (!root) return selection
  const kim = selection.kim
  if (kim && ['available', 'partial'].includes(kim.status)) {
    const levels = validated.displayData?.levels ?? []
    const levelIds = levels.map((level) => `${Number(level.pressure)}hPa`)
      .filter((level) => /^\d+hPa$/.test(level))
    const exact = levelIds.flatMap((levelId) => {
      const result = readExactKimMapGrid(root, { tmfc: kim.tmfc, hf: kim.hf, level: levelId })
      return result.status === 200 ? [{ levelId, revision: result.revision }] : []
    })
    const forVariable = (endpoint, allowed = () => true) => exact.filter((resource) => allowed(resource.levelId)).map((resource) => ({
      ...resource,
      resourceId: `/api/kim/${endpoint}/field?tmfc=${encodeURIComponent(kim.tmfc)}&hf=${kim.hf}&level=${encodeURIComponent(resource.levelId)}&revision=${resource.revision}`,
    }))
    const icingLevels = new Set(levels.filter((level) => (level.values ?? []).some((value) => Number.isFinite(value?.icing)))
      .map((level) => `${Number(level.pressure)}hPa`))
    selection.kim = { ...kim, levelIds, resources: {
      wind: forVariable('wind'), temp: forVariable('temp'), cloud: forVariable('cloud'),
      icing: forVariable('icing', (levelId) => icingLevels.has(levelId)),
    } }
  }
  const ktg = selection.ktg
  if (ktg && ['available', 'partial'].includes(ktg.status)) {
    const altLevelsFt = (validated.displayData?.turbulence?.levels ?? []).map((level) => Number(level.altFt)).filter(Number.isFinite)
    const resources = altLevelsFt.flatMap((altFt) => {
      const result = readExactKtgMapGrid(root, { tmfc: ktg.tmfc, hf: ktg.hf, altFt })
      return result.status === 200 ? [{ altFt, revision: result.data.revision,
        resourceId: `/api/ktg/grid?tmfc=${encodeURIComponent(ktg.tmfc)}&hf=${ktg.hf}&altFt=${altFt}&revision=${result.data.revision}` }] : []
    })
    selection.ktg = { ...ktg, altLevelsFt, resources: { turbulence: resources } }
  }
  selection.models = { kim: selection.kim, ktg: selection.ktg }
  return selection
}

function terrainStatus(result) {
  if (result.status === 'rejected') return 'unavailable'
  return result.value?.warnings?.length ? 'partial' : 'available'
}

function linkedWeatherHazards(briefing, weather = {}) {
  const originals = new Map()
  for (const [source, payloads] of [
    ['SIGMET', [weather.sigmet, weather.sigmetOverseas, weather.sigmet_overseas]],
    ['AIRMET', [weather.airmet]],
  ]) {
    for (const payload of payloads) for (const item of payload?.items ?? []) {
      if (item?.id) originals.set(`${source}:${item.id}`, item)
    }
  }
  return (briefing?.sections?.adverse?.hazards ?? []).flatMap((hazard) => {
    if (!hazard?.sourceId) return []
    const source = String(hazard.source ?? '').toUpperCase()
    const original = originals.get(`${source}:${hazard.sourceId}`)
    const geometry = original?.geometry ?? hazard.geometry ?? null
    if (!geometry) return []
    return [{
      ...hazard, id: String(hazard.sourceId), sourceId: String(hazard.sourceId),
      sourceKind: source.toLowerCase(), geometry,
      title: hazard.label ?? original?.phenomenon_label ?? original?.phenomenon_code ?? source,
    }]
  })
}

async function buildOnce(flight, overrides, deps) {
  const request = buildOrganizationBriefingRequest(flight, overrides)
  const snapshot = await deps.readWeatherSnapshot()
  const [profileResult, nwpResult] = await Promise.allSettled([
    Promise.resolve().then(() => deps.buildVerticalProfile(request, deps.terrainSampler)),
    Promise.resolve().then(() => deps.loadRouteCrossSection({ root: snapshot.dataRoot, routeGeometry: request.routeGeometry, body: request })),
  ])
  const validated = validateOrganizationCrossSection({ request, result: nwpResult, sourceState: snapshot.sourceState })
  const briefing = deps.composeBriefing(request, {
    ...(snapshot.weather ?? {}),
    now: snapshot.effectiveNowMs,
    dataRoot: snapshot.dataRoot,
    enrouteCrossSection: validated.composerInput ?? EMPTY_SECTION,
    // 기관 자동 분석에는 공식/개인 NOTAM을 섞지 않는다. 사용자 발췌는 blocks/materials다.
    notam: null,
    airspaceZones: [],
  })
  const mapDataSelection = withExactModelResources(buildOrganizationMapDataSelection(snapshot, validated), snapshot, validated)
  await deps.assertDataContextUnchanged?.(snapshot.contextRevision)
  const linkedAnnotations = projectOrganizationAnnotations({
    annotations: flight.annotations, routeGeometry: request.routeGeometry, flightId: flight.id,
  })
  const candidate = {
    flightRevision: flight.version,
    flight: { id: flight.id, orgId: flight.orgId, version: flight.version, name: flight.name, etd: request.etd, eta: request.eta },
    briefing,
    verticalProfile: profileResult.status === 'fulfilled' ? profileResult.value : null,
    crossSection: validated.displayData,
    componentStatus: { terrain: terrainStatus(profileResult), nwp: validated.status, models: validated.modelStatus },
    mapDataSelection,
    mapData: organizationMapWeather(snapshot.weather),
    linkedItems: [...linkedWeatherHazards(briefing, snapshot.weather), ...linkedAnnotations],
    organizationSnapshot: flight.organizationSnapshot ?? null,
    linkedContent: {
      blocks: flight.blocks, materialRefs: flight.materialRefs,
      briefingBlocks: flight.briefingBlocks ?? flight.organizationSnapshot?.briefing?.blocks ?? [],
      briefingMaterialRefs: flight.briefingMaterialRefs ?? flight.organizationSnapshot?.materialRefs ?? [],
    },
    provenance: {
      ...(snapshot.provenance ?? {}),
      contextRevision: snapshot.contextRevision ?? null,
      generatedAt: new Date(snapshot.effectiveNowMs ?? Date.now()).toISOString(),
      automaticNotamIncluded: false,
    },
  }
  const bundleId = sha256(JSON.stringify(canonicalJson(candidate)))
  candidate.mapDataSelection.bundleId = bundleId
  return { bundleId, ...candidate }
}

export async function buildOrganizationBriefingBundle(flight, overrides = {}, dependencies = {}) {
  const deps = {
    composeBriefing,
    buildVerticalProfile,
    loadRouteCrossSection,
    ...dependencies,
  }
  if (typeof deps.readWeatherSnapshot !== 'function' || !deps.terrainSampler) {
    throw new OrganizationError(503, 'organization_briefing_not_configured')
  }
  let firstError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await buildOnce(flight, overrides, deps) } catch (error) {
      const changed = error?.code === 'DATA_CONTEXT_CHANGED' || error?.message === 'data_context_changed'
      if (!changed || attempt === 1) throw error
      firstError = error
    }
  }
  throw firstError
}

export default {
  buildOrganizationBriefingBundle,
  buildOrganizationBriefingRequest,
  buildOrganizationMapDataSelection,
  validateOrganizationCrossSection,
}
