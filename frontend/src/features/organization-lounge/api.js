async function request(url, { method = 'GET', body, signal, headers = {} } = {}) {
  const response = await fetch(url, {
    method, signal, credentials: 'include', headers,
    ...(body === undefined ? {} : body instanceof Blob ? {
      headers: { 'Content-Type': body.type || 'application/octet-stream', ...headers }, body,
    } : { headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || data.error || `요청 실패 (${response.status})`)
    error.status = response.status
    error.code = data.error
    error.details = data
    throw error
  }
  return data
}

export function organizationRequest(orgId, path = '', options) {
  return request(organizationApiUrl(orgId, path), options)
}

export function organizationApiUrl(orgId, path = '') {
  const prefix = orgId === 'preview'
    ? '/api/lounge-preview/organizations/1'
    : `/api/organizations/${encodeURIComponent(orgId)}`
  return `${prefix}${path}`
}

export function organizationResourceUrl(orgId, providedUrl, fallbackPath) {
  if (orgId !== 'preview') return providedUrl || organizationApiUrl(orgId, fallbackPath)
  if (!providedUrl) return organizationApiUrl(orgId, fallbackPath)
  return providedUrl.replace(/\/api\/organizations\/[^/]+/, '/api/lounge-preview/organizations/1')
}

export function startPreviewSession(options) {
  return request('/api/lounge-preview/session', { ...options, method: 'POST' })
}

export function resetPreviewSession(options) {
  return request('/api/lounge-preview/reset', { ...options, method: 'POST' })
}

export function listPreviewSavedRoutes(options) {
  return request('/api/lounge-preview/saved-routes', options).then((result) => Array.isArray(result?.routes) ? result.routes : [])
}

export function listOrganizations(options) {
  return request('/api/me/organizations', options)
}

export function createOrganization(body, options) {
  return request('/api/admin/organizations', { ...options, method: 'POST', body })
}

export function shareSavedFlight(orgId, body, options) {
  return organizationRequest(orgId, '/flights/share', { ...options, method: 'POST', body })
}

export function fetchOrganizationBriefing({ orgId, flightId, flightVersion, overrides = {}, signal }) {
  return organizationRequest(orgId, `/flights/${encodeURIComponent(flightId)}/weather-briefing`, {
    method: 'POST', body: { flightVersion, overrides }, signal,
  })
}
