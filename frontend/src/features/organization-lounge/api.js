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
  return request(`/api/organizations/${encodeURIComponent(orgId)}${path}`, options)
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
