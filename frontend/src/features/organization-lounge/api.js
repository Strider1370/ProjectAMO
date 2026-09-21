async function request(url, { method = 'GET', body, signal, headers = {} } = {}) {
  const response = await fetch(url, {
    method, signal, credentials: 'include', headers,
    ...(body === undefined ? {} : body instanceof Blob ? {
      headers: { 'Content-Type': body.type || 'application/octet-stream', ...headers }, body,
    } : { headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const messages = {
      map_rate_limit: '요청이 많습니다. 잠시 후 다시 시도하세요.',
      map_write_busy: '자료를 처리 중입니다. 잠시 후 다시 시도하세요.',
      material_write_busy: '다른 자료를 저장 중입니다. 잠시 후 다시 시도하세요.',
      organization_material_storage_full: '기관 자료의 누적 저장 한도(100MB)에 도달했습니다. 관리자에게 문의하세요.',
      map_storage_full: '서버 지도·자료의 전체 저장 한도에 도달했습니다.',
      map_storage_low_disk: '서버 저장 공간이 부족해 새 자료 저장을 중단했습니다.',
      invalid_map_material: '지도 파일이 손상되었거나 보안·복잡도 제한을 초과했습니다. 파일 내용을 줄이거나 부속 파일을 확인하세요.',
    }
    const error = new Error(data.message || messages[data.error] || data.error || `요청 실패 (${response.status})`)
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
  return request('/api/me/organizations', { ...options, method: 'POST', body })
}

export function shareSavedFlight(orgId, body, options) {
  return organizationRequest(orgId, '/flights/share', { ...options, method: 'POST', body })
}

export function fetchOrganizationBriefing({ orgId, flightId, flightVersion, overrides = {}, signal }) {
  return organizationRequest(orgId, `/flights/${encodeURIComponent(flightId)}/weather-briefing`, {
    method: 'POST', body: { flightVersion, overrides }, signal,
  })
}
