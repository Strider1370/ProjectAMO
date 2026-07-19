const LAST_KEY = 'amo_last_perf'

export const DEFAULT_PERFORMANCE_BY_RULE = {
  IFR: { tasKt: 450, altitudeFt: 31000 },
  VFR: { tasKt: 120, altitudeFt: 5500 },
}

function memStore() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null) }
}

const fallback = memStore()

function store(s) {
  if (s) return s
  return typeof localStorage !== 'undefined' ? localStorage : fallback
}

function readJson(s, key, dflt) {
  try {
    const raw = store(s).getItem(key)
    return raw ? JSON.parse(raw) : dflt
  } catch { return dflt }
}

export function getLastUsed(s) {
  return readJson(s, LAST_KEY, null)
}

export function getPerformanceForRule(rule, s) {
  const saved = getLastUsed(s)
  return { ...DEFAULT_PERFORMANCE_BY_RULE[rule], ...(saved?.[rule] ?? {}) }
}

export function setPerformanceForRule(rule, performance, s) {
  const target = store(s)
  const saved = getLastUsed(target)
  const profiles = saved?.IFR || saved?.VFR ? saved : {}
  target.setItem(LAST_KEY, JSON.stringify({ ...profiles, [rule]: { ...getPerformanceForRule(rule, target), ...performance } }))
}
