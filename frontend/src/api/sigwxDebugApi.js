async function fetchJson(url, { optional = false } = {}) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`)
    return res.json()
  } catch (error) {
    if (optional) return null
    throw error
  }
}

export function normalizeSigwxDebugSamples(samples) {
  return (Array.isArray(samples) ? samples : [])
    .filter((sample) => /^\d{10}$/.test(String(sample?.tmfc || '')))
    .map((sample) => ({
      tmfc: String(sample.tmfc),
      itemCount: Number(sample.itemCount) || 0,
      targetImageUrl: sample.targetImageUrl || buildSigwxDebugSampleTargetUrl(sample.tmfc),
    }))
    .sort((a, b) => b.tmfc.localeCompare(a.tmfc))
}

export function buildSigwxDebugSampleTargetUrl(tmfc) {
  return `/api/debug/sigwx-low-samples/${encodeURIComponent(String(tmfc || ''))}/target.png`
}

export async function fetchSigwxDebugSamples() {
  return normalizeSigwxDebugSamples(await fetchJson('/api/debug/sigwx-low-samples'))
}

export async function fetchSigwxDebugSample(tmfc) {
  if (!tmfc) return null
  return fetchJson(`/api/debug/sigwx-low-samples/${encodeURIComponent(tmfc)}`, { optional: true })
}
