// Pure helpers for the unified timeline rail (past observations -> now -> future forecast).
// One absolute-ms axis shared by radar/satellite/lightning (past frames) and NWP (future valid times).
// Color rules: no past/future color coding (design constitution: color = meaning). Past = solid, future = dashed.

const HOUR_MS = 60 * 60 * 1000

// Empty-state window so the rail is always present even with no layer on.
export const DEFAULT_PAST_WINDOW_MS = 2 * HOUR_MS
export const DEFAULT_FUTURE_WINDOW_MS = 1 * HOUR_MS

// Scrolling-tape geometry: a fixed playhead with the selected time under it; the tape scrolls past.
export const VISIBLE_SPAN_MS = 12 * HOUR_MS
export const PLAYHEAD_RATIO = 0.5
export const MINOR_STEP_MS = 15 * 60 * 1000

// Tiered ruler ticks across a visible window: major = hour (labeled), mid = half-hour, minor = 15 min.
export function buildTapeTicks({ startMs, endMs }, stepMs = MINOR_STEP_MS) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || stepMs <= 0) return []
  const ticks = []
  const first = Math.ceil(startMs / stepMs) * stepMs
  for (let ms = first; ms <= endMs; ms += stepMs) {
    const tier = ms % HOUR_MS === 0 ? 'major' : (ms % (HOUR_MS / 2) === 0 ? 'mid' : 'minor')
    ticks.push({ ms, tier })
  }
  return ticks
}

// Horizontal position (percent, may fall outside 0-100 when off-screen) of an absolute time on the tape.
export function tapePercent({ ms, selectedMs, visibleSpanMs = VISIBLE_SPAN_MS, playheadRatio = PLAYHEAD_RATIO }) {
  if (!Number.isFinite(ms) || !Number.isFinite(selectedMs) || visibleSpanMs <= 0) return playheadRatio * 100
  return (playheadRatio + (ms - selectedMs) / visibleSpanMs) * 100
}

// Inverse: a horizontal drag (fraction of the viewport width) maps to a time delta. Dragging right -> earlier.
export function dragToTimeDelta(dxFraction, visibleSpanMs = VISIBLE_SPAN_MS) {
  if (!Number.isFinite(dxFraction)) return 0
  return -dxFraction * visibleSpanMs
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

// NWP slider times carry { hf, validTime }; normalize to { hf, ms } on the absolute axis.
export function normalizeNwpTimes(nwpTimes) {
  return (Array.isArray(nwpTimes) ? nwpTimes : [])
    .map((time) => ({ hf: Number(time?.hf), ms: Date.parse(time?.validTime) }))
    .filter((time) => finite(time.ms) && Number.isFinite(time.hf))
    .sort((a, b) => a.ms - b.ms)
}

// Domain spans from the oldest datum (or now - window) to the newest (or now + window).
export function buildTimelineDomain({
  pastTicksMs = [],
  nwpTimesMs = [],
  qpfTimesMs = [],
  nowMs,
  pastWindowMs = DEFAULT_PAST_WINDOW_MS,
  futureWindowMs = DEFAULT_FUTURE_WINDOW_MS,
}) {
  const now = finite(nowMs) ? nowMs : Date.now()
  const past = pastTicksMs.filter(finite)
  const future = [...nwpTimesMs, ...qpfTimesMs].filter(finite)
  const earliest = past.length ? Math.min(...past) : now
  const latest = future.length ? Math.max(...future) : now
  return {
    startMs: Math.min(now - pastWindowMs, earliest),
    endMs: Math.max(now + futureWindowMs, latest),
    nowMs: now,
    forecastTicksMs: [...new Set(future)].sort((a, b) => a - b),
  }
}

export function toPercent(domain, ms) {
  if (!domain || domain.endMs <= domain.startMs || !finite(ms)) return 0
  const ratio = (ms - domain.startMs) / (domain.endMs - domain.startMs)
  return Math.max(0, Math.min(100, ratio * 100))
}

export function percentToMs(domain, percent) {
  if (!domain || domain.endMs <= domain.startMs) return domain?.startMs ?? 0
  const ratio = Math.max(0, Math.min(1, percent / 100))
  return Math.round(domain.startMs + ratio * (domain.endMs - domain.startMs))
}

export function clampMs(domain, ms) {
  if (!domain) return ms
  return Math.max(domain.startMs, Math.min(domain.endMs, ms))
}

// Map a selected absolute time back to the nearest past frame index (for the index-based weather model).
export function pickNearestPastIndex(pastTicksMs, selectedMs) {
  const past = (Array.isArray(pastTicksMs) ? pastTicksMs : []).filter(finite)
  if (!past.length || !finite(selectedMs)) return -1
  let best = 0
  let bestDelta = Infinity
  past.forEach((ms, index) => {
    const delta = Math.abs(ms - selectedMs)
    if (delta < bestDelta) {
      bestDelta = delta
      best = index
    }
  })
  return best
}

// Map a selected absolute time to the nearest NWP forecast entry (for setNwpSelection).
export function pickNearestNwp(nwpTimesMs, selectedMs) {
  const future = normalizeNwpMsList(nwpTimesMs)
  if (!future.length || !finite(selectedMs)) return null
  let best = future[0]
  let bestDelta = Math.abs(best.ms - selectedMs)
  for (const time of future) {
    const delta = Math.abs(time.ms - selectedMs)
    if (delta < bestDelta) {
      bestDelta = delta
      best = time
    }
  }
  return best
}

function normalizeNwpMsList(list) {
  return (Array.isArray(list) ? list : [])
    .map((time) => ({ hf: Number(time?.hf), ms: finite(time?.ms) ? time.ms : Date.parse(time?.validTime) }))
    .filter((time) => finite(time.ms))
}

// Build hour-aligned major ticks across the domain (sparse labels handled by the view).
export function buildHourTicks(domain) {
  if (!domain || domain.endMs <= domain.startMs) return []
  const ticks = []
  const first = Math.ceil(domain.startMs / HOUR_MS) * HOUR_MS
  for (let ms = first; ms <= domain.endMs; ms += HOUR_MS) {
    ticks.push(ms)
  }
  return ticks
}
