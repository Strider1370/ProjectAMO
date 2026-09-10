async function postJson(url, payload, { signal } = {}) {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`)
  }

  return data
}

export function fetchVerticalProfile(payload, options) {
  return postJson('/api/vertical-profile', payload, options)
}

export function fetchCrossSection(payload, options) {
  return postJson('/api/briefing/cross-section', payload, options)
}

export function fetchNwpTimeRefresh(payload, options) {
  return postJson('/api/briefing/nwp-time-refresh', payload, options)
}

export function fetchRouteBriefing(payload, options) {
  return postJson('/api/route-briefing', payload, options)
}

export function fetchRouteExposure(payload, options) {
  return postJson('/api/briefing/route-exposure', payload, options)
}

export function fetchRouteExposureBatch(payload, options) {
  return postJson('/api/briefing/route-exposure/batch', payload, options)
}

export function fetchAltitudeComparison(payload, options) {
  return postJson('/api/briefing/altitudes', payload, options)
}
