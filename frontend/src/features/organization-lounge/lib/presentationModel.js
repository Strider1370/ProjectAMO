export function runFlights(session, run) {
  const pinned = run?.pinnedSnapshot?.flights
  if (Array.isArray(pinned) && pinned.length) return pinned
  const refs = run?.flightRefs || session?.flightRefs || []
  return refs.map((ref) => typeof ref === 'object' ? {
    ...ref,
    id: ref.id ?? ref.flightId,
    version: ref.version ?? ref.flightVersion,
  } : { id: ref })
}

export function activeRunFlightIndex(session, run) {
  const flights = runFlights(session, run)
  const index = flights.findIndex((flight) => String(flight.id) === String(run?.activeFlightId))
  return index >= 0 ? index : 0
}

export function presentationFlight(pinnedFlight, displayedBundle) {
  const displayed = displayedBundle?.flight
  return displayed && String(displayed.id) === String(pinnedFlight?.id) ? displayed : pinnedFlight
}

export function hydratePresentationBundle(bundle, run) {
  if (!bundle) return null
  const sourceRun = bundle.organizationSnapshot ? { pinnedSnapshot: bundle.organizationSnapshot } : run
  const pinnedFlight = runFlights(null, sourceRun).find((flight) => String(flight.id) === String(bundle.flight?.id || bundle.flightId))
  return pinnedFlight ? { ...bundle, flight: { ...pinnedFlight, ...(bundle.flight || {}) } } : bundle
}

export function candidateBundle(response) {
  return response?.candidate?.bundle || response?.bundle || response?.candidate || null
}

export function acceptCandidateResponse({ expectedRunId, expectedFlightId, response }) {
  const candidate = response?.candidate || response
  const bundle = candidateBundle(response)
  if (!bundle?.bundleId || String(candidate?.runId ?? expectedRunId) !== String(expectedRunId)) return null
  const flightId = candidate?.flightId ?? bundle.flight?.id ?? bundle.flightId
  return String(flightId) === String(expectedFlightId) ? { ...candidate, bundleId: bundle.bundleId, bundle } : null
}

export function appliedBundlesFromRun(run) {
  const entries = run?.appliedBundles || run?.displayBundles || []
  const restored = Array.isArray(entries) ? Object.fromEntries(entries.flatMap((entry) => {
    const bundle = entry?.bundle || entry?.displayBundle
    const flightId = entry?.flightId ?? bundle?.flight?.id
    return flightId != null && bundle?.bundleId ? [[String(flightId), hydratePresentationBundle(bundle, run)]] : []
  })) : Object.fromEntries(Object.entries(entries || {}).flatMap(([flightId, entry]) => {
    const bundle = entry?.bundle || entry
    return bundle?.bundleId ? [[String(flightId), hydratePresentationBundle(bundle, run)]] : []
  }))
  const appliedSnapshot = run?.appliedSnapshot
  const flightId = appliedSnapshot?.flight?.id ?? appliedSnapshot?.flightId ?? run?.activeFlightId
  if (appliedSnapshot?.bundleId && flightId != null && !restored[String(flightId)]) {
    restored[String(flightId)] = hydratePresentationBundle(appliedSnapshot, run)
  }
  return restored
}

export function presentationMapDataSelection(bundle) {
  if (!bundle?.mapDataSelection) return null
  return bundle.mapDataSelection.bundleId || !bundle.bundleId
    ? bundle.mapDataSelection
    : { ...bundle.mapDataSelection, bundleId: bundle.bundleId }
}

export function mapSelectionModels(mapDataSelection) {
  if (!mapDataSelection) return []
  const models = mapDataSelection.models || {
    kim: mapDataSelection.kim,
    ktg: mapDataSelection.ktg,
  }
  return Object.entries(models).filter(([, model]) => model)
}

function statuses(componentStatus) {
  const values = [
    componentStatus?.nwp,
    componentStatus?.terrain,
    componentStatus?.kim,
    componentStatus?.ktg,
    componentStatus?.verticalProfile,
    componentStatus?.models?.kim,
    componentStatus?.models?.ktg,
  ]
  return values.map((value) => typeof value === 'string' ? value : value?.status).filter(Boolean)
}

export function presentationWeatherState(bundle) {
  const values = statuses(bundle?.componentStatus)
  const known = Boolean(bundle?.componentStatus) && values.length > 0
  const limited = !known || values.some((status) => ['partial', 'out_of_range', 'unavailable', 'unsupported', 'error'].includes(status))
  return {
    limited,
    label: limited ? (known ? '기상 판단 제한' : '자료 상태 미확인') : '검증 자료 사용 가능',
    statuses: values.length ? values : ['unavailable'],
  }
}

export function materialReferences(session, run, flight, bundle = null) {
  const linked = bundle?.linkedContent
  const snapshot = bundle?.organizationSnapshot
  const snapshotFlight = snapshot?.flights?.find((item) => String(item.id) === String(bundle?.flight?.id ?? flight?.id))
  const refs = [
    ...(linked?.briefingMaterialRefs ?? snapshot?.materialRefs ?? run?.pinnedSnapshot?.materialRefs ?? session?.materialRefs ?? []),
    ...(linked?.materialRefs ?? snapshotFlight?.materialRefs ?? flight?.materialRefs ?? []),
  ]
  const unique = new Map()
  for (const ref of refs) {
    const normalized = typeof ref === 'object' ? ref : { materialId: ref }
    const id = normalized.materialId ?? normalized.id
    const version = normalized.materialVersion ?? normalized.version
    if (id != null) unique.set(`${id}:${version ?? 'current'}`, { ...normalized, materialId: id, materialVersion: version })
  }
  return [...unique.values()]
}

export function speakerNotes(session, run, flight, bundle) {
  const linked = bundle?.linkedContent
  const snapshot = bundle?.organizationSnapshot
  const snapshotFlight = snapshot?.flights?.find((item) => String(item.id) === String(bundle?.flight?.id ?? flight?.id))
  const blocks = [
    ...(linked?.briefingBlocks ?? snapshot?.briefing?.blocks ?? run?.pinnedSnapshot?.briefing?.blocks ?? session?.blocks ?? []),
    ...(linked?.blocks ?? snapshotFlight?.blocks ?? flight?.blocks ?? []),
  ]
  const flightId = flight?.id
  const unique = new Map()
  for (const [index, block] of blocks.entries()) {
    if (!block || (block.flightId != null && String(block.flightId) !== String(flightId))) continue
    const body = block.body ?? block.text ?? block.content
    if (typeof body !== 'string' || !body.trim()) continue
    const key = block.id ?? `${block.kind || 'note'}:${body}`
    if (!unique.has(key)) unique.set(key, { ...block, id: key || index, body })
  }
  return [...unique.values()]
}
