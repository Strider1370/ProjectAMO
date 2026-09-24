import { isAbsoluteIsoInstant } from './contracts.js'

export function displayInstant(value, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${timezone === 'UTC' ? 'UTC' : 'KST'}`
}

// Model-only representation; source payloads/cards and stored instants stay UTC.
// Preserve weather values, uncertainty, validity and coverage. This generic
// projection omits only storage metadata; window scoping is explicit below.
const STORAGE_KEYS = new Set(['contentHash', 'resultHash', 'routeInputHash', 'snapshotId', 'hashBasis', 'confirmationToken'])
export function modelContext(value, timezone) {
  if (typeof value === 'string' && isAbsoluteIsoInstant(value)) return displayInstant(value, timezone)
  if (Array.isArray(value)) return value.map((item) => modelContext(item, timezone))
  if (value && typeof value === 'object') {
    const projected = Object.fromEntries(Object.entries(value)
      .filter(([key]) => !STORAGE_KEYS.has(key))
      .map(([key, item]) => [key, modelContext(item, timezone)]))
    // KIM/KTG run identifiers encode UTC, unlike the user's display timezone.
    // Keep the identifier and explicitly render its initialization instant so
    // the model need not reinterpret 2026091006 as local 06:00.
    if (typeof value.tmfc === 'string' && /^\d{10}$/.test(value.tmfc)) {
      const raw = value.tmfc
      const instant = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:00:00Z`
      if (isAbsoluteIsoInstant(instant)) projected.initializedAtDisplay = displayInstant(instant, timezone)
    }
    return projected
  }
  return value
}

// Reduce the model's temporal matching workload. Never remove unresolved groups,
// or prior FM/BECMG transitions that may establish the requested conditions.
// The full UTC result remains in the UI card. Removed groups are accounted for.
export function modelToolResult(tool, result, timezone) {
  const airportDigest = tool === 'get_airport_weather' || tool === 'get_route_briefing'
    || (tool === 'get_my_saved_route' && result.data?.mode === 'current_briefing')
  if (!airportDigest || !Array.isArray(result.data?.airports)) return modelContext(result, timezone)
  const value = structuredClone(result)
  for (const airport of value.data.airports) {
    const coverage = value.coverage?.find((item) => item.icao === airport.icao)
    const start = Date.parse(coverage?.requested?.start), end = Date.parse(coverage?.requested?.end)
    if (!airport.taf || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const omitted = []
    airport.taf.changes = (airport.taf.changes ?? []).filter((change) => {
      const from = Date.parse(change.start), to = Date.parse(change.end)
      const after = Number.isFinite(from) && from >= end
      const temporary = ['temporary', 'probabilistic'].includes(change.semantics)
      const before = temporary && Number.isFinite(to) && to <= start
      if (!after && !before) return true
      omitted.push({ index: change.index, type: change.type, reason: after ? 'starts_after_request' : 'ended_before_request' })
      return false
    })
    const completedPermanentChanges = airport.taf.changes.flatMap(change => {
      const from = Date.parse(change.start), to = Date.parse(change.end)
      const effective = change.semantics === 'from' ? from
        : change.semantics === 'transition' && Number.isFinite(from) && to >= from ? to : NaN
      return Number.isFinite(effective) && effective <= start
        ? [{ index: change.index, effectiveBy: new Date(effective).toISOString() }] : []
    }).sort((a, b) => Date.parse(a.effectiveBy) - Date.parse(b.effectiveBy))
    airport.taf.windowProjection = { requested: coverage.requested, omittedChangeCount: omitted.length, omittedChanges: omitted,
      completedPermanentChanges,
      note: 'base is the INITIAL forecast, not the window-start state. Apply completedPermanentChanges chronologically before describing any overlapping transition; keep fields not changed. An earlier BECMG/FM is not undone by base. Unknown timings remain unresolved. Full report remains in the source card.' }
  }
  return modelContext(value, timezone)
}

export function resolveAirportWindow(args, { previousWindow, now, timezone }) {
  const { hoursFromNow = 1, window, localWindow, usePreviousWindow, ...rest } = args
  let selected = window
  if (usePreviousWindow) {
    if (!previousWindow) throw Object.assign(new Error('PREVIOUS_WINDOW_REQUIRED'), { code: 'PREVIOUS_WINDOW_REQUIRED' })
    selected = previousWindow
  } else if (localWindow) {
    selected = { start: localToUtc(localWindow.start, timezone), end: localToUtc(localWindow.end, timezone) }
  }
  return { ...rest, window: selected ?? { start: new Date(now).toISOString(), end: new Date(now + hoursFromNow * 3600_000).toISOString() } }
}

export function localToUtc(value, timezone) {
  const suffix = timezone === 'UTC' ? 'Z' : '+09:00'
  const instant = `${value.length === 16 ? value + ':00' : value}${suffix}`
  if (!isAbsoluteIsoInstant(instant)) throw Object.assign(new Error('INVALID_LOCAL_TIME'), { code: 'INVALID_LOCAL_TIME' })
  return new Date(instant).toISOString()
}

export function resolveAdvisoryTime({ localAt, localWindow, ...args }, timezone) {
  if (localAt) return { ...args, at: localToUtc(localAt, timezone) }
  if (localWindow) return { ...args, window: { start: localToUtc(localWindow.start, timezone), end: localToUtc(localWindow.end, timezone) } }
  return args
}
