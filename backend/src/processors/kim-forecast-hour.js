function tmfcToMs(tmfc) {
  const s = String(tmfc || '')
  if (!/^\d{10}$/.test(s)) return null
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10))
}

function forecastValidMs(tmfc, time) {
  const explicitMs = Date.parse(time?.validTime)
  if (Number.isFinite(explicitMs)) return explicitMs
  const baseMs = tmfcToMs(tmfc)
  const hf = Number(time?.hf)
  return baseMs != null && Number.isFinite(hf) ? baseMs + hf * 3_600_000 : null
}

// Selects the available source valid time with the smallest absolute difference
// from the flight reference time. Exact ties prefer the later forecast.
export function selectClosestForecastTime({ tmfc, targetMs = Date.now(), candidateTimes = [] }) {
  const referenceMs = Number.isFinite(Number(targetMs)) ? Number(targetMs) : Date.now()
  const candidates = candidateTimes.flatMap((time) => {
    const hf = Number(time?.hf)
    const validMs = forecastValidMs(tmfc, time)
    return Number.isFinite(hf) && Number.isFinite(validMs) ? [{ hf, validMs }] : []
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const difference = Math.abs(a.validMs - referenceMs) - Math.abs(b.validMs - referenceMs)
    return difference || b.validMs - a.validMs
  })
  return {
    hf: candidates[0].hf,
    validTime: new Date(candidates[0].validMs).toISOString(),
  }
}

// Returns smallest hf whose valid time (tmfc+hf hours) >= nowMs.
// Falls back to last candidate if all valid times are past.
// Returns first candidate if run itself is in the future.
export function selectNearestForecastHour({ tmfc, nowMs = Date.now(), candidateHours = [] }) {
  const baseMs = tmfcToMs(tmfc)
  const hours = [...candidateHours].sort((a, b) => a - b)
  if (baseMs == null || hours.length === 0) return hours[0] ?? 0
  const future = hours.filter((hf) => baseMs + hf * 3_600_000 >= nowMs)
  return future.length > 0 ? future[0] : hours[hours.length - 1]
}
