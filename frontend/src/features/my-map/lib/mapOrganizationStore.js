const root = '/api/organizations'

export class MapOrganizationError extends Error {
  constructor(status, code, details) {
    const message = status === 409 ? '다른 변경이 먼저 저장되었습니다. 최신 버전을 확인한 뒤 다시 공유하세요.'
      : status === 401 ? '기관 공유는 로그인 후 사용할 수 있습니다.'
        : status === 403 ? '이 기관 지도에 접근할 권한이 없습니다.'
          : status === 404 ? '지도 또는 공유할 개인 원본을 찾지 못했습니다.'
            : status === 413 ? '기관 지도 저장 용량 한도를 초과했습니다.' : '기관 지도 요청을 처리하지 못했습니다.'
    super(message)
    this.name = 'MapOrganizationError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request(url, method, body, { signal, fetchImpl = globalThis.fetch } = {}) {
  let response
  try {
    response = await fetchImpl(url, { method, credentials: 'include', signal,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new MapOrganizationError(0, 'network_error', null)
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new MapOrganizationError(response.status, result?.error, result?.details)
  return result
}

const url = (orgId, id) => `${root}/${encodeURIComponent(orgId)}/maps${id == null ? '' : `/${encodeURIComponent(id)}`}`
export const listMemberships = (options) => request('/api/me/organizations', 'GET', undefined, options).then((r) => r.organizations ?? [])
export const listOrganizationMaps = (orgId, options) => request(url(orgId), 'GET', undefined, options).then((r) => r.maps ?? [])
export const getOrganizationMap = (orgId, id, options) => request(url(orgId, id), 'GET', undefined, options).then((r) => r.map)
export const shareOrganizationMap = (orgId, input, options) => request(url(orgId), 'POST', input, options).then((r) => r.map)
export const updateOrganizationMap = (orgId, id, input, options) => request(`${url(orgId, id)}/versions`, 'POST', input, options).then((r) => r.map)
export const stopOrganizationMap = (orgId, id, options) => request(url(orgId, id), 'DELETE', undefined, options)

export const organizationDocumentId = (orgId, id) => `organization:${orgId}:${id}`

export function organizationDocument(summary, membership, snapshot) {
  const share = {
    organizationId: summary.organizationId, mapId: summary.id, organizationName: membership.name, role: membership.role,
    version: summary.version, latestVersion: summary.version, publisherUserId: summary.publisherUserId,
    sourcePersonalMapId: summary.sourcePersonalMapId, sourcePersonalRevision: summary.sourcePersonalRevision,
    note: summary.note, updatedAt: summary.updatedAt,
  }
  return {
    ...(snapshot ? structuredClone(snapshot) : { groups: [], items: [], source: null }),
    id: organizationDocumentId(summary.organizationId, summary.id), name: summary.name, kind: 'organization', loaded: Boolean(snapshot),
    itemCount: summary.itemCount, groupCount: summary.groupCount, organization: share,
  }
}

// One instance belongs to one account. Remote snapshots live only in memory.
// Refresh discovers versions and revocations; only load/apply replaces a viewed snapshot.
export function createOrganizationMapSession({ api = { listMemberships, listOrganizationMaps, getOrganizationMap }, onInstall, onRemove, onMemberships, onError } = {}) {
  let disposed = false, refreshing = null
  const controller = new AbortController(), options = { signal: controller.signal }
  const memberships = new Map(), summaries = new Map(), documents = new Map(), epochs = new Map()
  const denied = (error) => [401, 403, 404].includes(error?.status)
  const remove = (id) => {
    epochs.set(id, (epochs.get(id) ?? 0) + 1)
    summaries.delete(id)
    if (documents.delete(id)) onRemove?.(id)
  }
  const revokeOrganization = (orgId) => {
    for (const [id, summary] of summaries) if (summary.organizationId === orgId) remove(id)
  }
  const install = (document) => { documents.set(document.id, document); onInstall?.(document); return document }

  const refresh = async () => {
    let nextMemberships
    try { nextMemberships = await api.listMemberships(options) }
    catch (error) {
      if (disposed) return
      if (denied(error)) { for (const id of [...summaries.keys()]) remove(id); memberships.clear(); onMemberships?.([]) }
      onError?.(error.message)
      return
    }
    if (disposed) return
    const active = nextMemberships.filter((member) => member.status == null || member.status === 'active')
    const ids = new Set(active.map((member) => member.id))
    for (const orgId of memberships.keys()) if (!ids.has(orgId)) revokeOrganization(orgId)
    memberships.clear(); active.forEach((member) => memberships.set(member.id, member))
    onMemberships?.(active)
    await Promise.all(active.map(async (member) => {
      const before = new Map(epochs)
      let rows
      try { rows = await api.listOrganizationMaps(member.id, options) }
      catch (error) {
        if (disposed) return
        if (denied(error)) { revokeOrganization(member.id); memberships.delete(member.id); onMemberships?.([...memberships.values()]) }
        onError?.(error.message)
        return
      }
      if (disposed || !memberships.has(member.id)) return
      const nextIds = new Set(rows.map((row) => organizationDocumentId(member.id, row.id)))
      for (const [id, prior] of summaries) if (prior.organizationId === member.id && !nextIds.has(id)) remove(id)
      for (const row of rows) {
        const id = organizationDocumentId(member.id, row.id)
        if ((epochs.get(id) ?? 0) !== (before.get(id) ?? 0)) continue
        if ((summaries.get(id)?.version ?? 0) > row.version) continue
        summaries.set(id, row)
        const current = documents.get(id)
        if (!current?.loaded) install(organizationDocument(row, member))
        else if (current.organization.latestVersion !== row.version || current.organization.role !== member.role || current.organization.organizationName !== member.name) {
          install({ ...current, organization: { ...current.organization, latestVersion: row.version, role: member.role, organizationName: member.name } })
        }
      }
    }))
  }

  return {
    refresh() {
      if (disposed) return Promise.resolve()
      if (!refreshing) refreshing = refresh().finally(() => { refreshing = null })
      return refreshing
    },
    async load(id, { applyLatest = false } = {}) {
      if (disposed) return null
      const summary = summaries.get(id), current = documents.get(id)
      if (!summary || !memberships.has(summary.organizationId)) return null
      if (current?.loaded && !applyLatest) return current
      const epoch = (epochs.get(id) ?? 0) + 1
      epochs.set(id, epoch)
      try {
        const result = await api.getOrganizationMap(summary.organizationId, summary.id, options)
        if (disposed || epochs.get(id) !== epoch || !memberships.has(summary.organizationId) || !summaries.has(id)) return null
        const known = summaries.get(id)
        // A newer list may arrive while a detail request is in flight; keep its notice.
        const next = organizationDocument(result, memberships.get(summary.organizationId), result.snapshot)
        next.organization.latestVersion = Math.max(known.version, result.version)
        summaries.set(id, known.version > result.version ? known : result)
        return install(next)
      } catch (error) {
        if (disposed || epochs.get(id) !== epoch) return null
        if (error.status === 401) {
          for (const key of [...summaries.keys()]) remove(key)
          memberships.clear(); onMemberships?.([])
        } else if (error.status === 403) {
          revokeOrganization(summary.organizationId); memberships.delete(summary.organizationId); onMemberships?.([...memberships.values()])
        } else if (error.status === 404) remove(id)
        onError?.(error.message)
        return null
      }
    },
    dispose() { disposed = true; controller.abort(); documents.clear(); summaries.clear(); memberships.clear() },
  }
}
