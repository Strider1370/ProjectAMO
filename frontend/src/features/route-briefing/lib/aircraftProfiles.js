const LAST_KEY = 'amo_last_perf'

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
