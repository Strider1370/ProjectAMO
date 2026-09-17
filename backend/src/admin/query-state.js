// 관리자 조회의 마지막 정상 결과를 endpoint + request key + 요청 scope 별로 보관한다.
//
// 성공 응답 본문은 기존 DTO 그대로 두고, 조회 수명주기 정보는 HTTP 헤더/실패
// 응답의 `query`에 둔다. 이렇게 하면 기존 소비자는 정상 응답을 그대로 읽을 수
// 있고, 상태를 인식하는 소비자는 stale/error/요청 세대를 함께 판단할 수 있다.

const MESSAGE = '관리자 조회에 실패했습니다.'

function clone(value) {
  return structuredClone(value)
}

function asGeneration(value, fallback) {
  if (value == null || value === '') return { value: String(fallback), ordinal: fallback }
  const text = String(value).trim().slice(0, 128)
  const ordinal = /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : fallback
  return { value: text || String(fallback), ordinal }
}

function asScope(value) {
  if (value == null || value === '') return 'legacy'
  const text = String(value).trim().slice(0, 128)
  return text || 'legacy'
}

function publicState(entry, request) {
  return {
    endpoint: request.endpoint,
    requestKey: request.requestKey,
    requestGeneration: request.requestGeneration,
    ...(request.exposeRequestScope ? { requestScope: request.requestScope } : {}),
    current: request.ordinal === entry.latestOrdinal,
    status: entry.error ? (entry.payload === undefined ? 'error' : 'stale') : 'ready',
    stale: Boolean(entry.error && entry.payload !== undefined),
    error: entry.error,
    lastSuccessAt: entry.lastSuccessAt,
    failedAt: entry.failedAt,
  }
}

// `requestGeneration` is issued by one browser query owner. Numeric values
// preserve creation order even if the requests arrive at the server in the
// opposite order, but only within the same opaque `requestScope`. A browser
// runtime must create a new scope token after restart/reload and reuse it for
// all A/B requests in that runtime. Legacy callers share the `legacy` scope.
export function createAdminQueryState({ now = () => new Date().toISOString() } = {}) {
  const entries = new Map()
  let sequence = 0

  function entryFor(endpoint, requestKey, requestScope) {
    const key = `${endpoint}\u0000${requestKey}\u0000${requestScope}`
    if (!entries.has(key)) entries.set(key, {
      latestOrdinal: -1,
      payload: undefined,
      lastSuccessAt: null,
      error: null,
      failedAt: null,
    })
    return entries.get(key)
  }

  function begin({ endpoint, requestKey = endpoint, requestGeneration = null, requestScope = null, exposeRequestScope = true }) {
    if (typeof endpoint !== 'string' || !endpoint) throw new TypeError('endpoint is required')
    if (typeof requestKey !== 'string' || !requestKey) throw new TypeError('requestKey is required')
    sequence += 1
    const generation = asGeneration(requestGeneration, sequence)
    const scope = asScope(requestScope)
    const entry = entryFor(endpoint, requestKey, scope)
    entry.latestOrdinal = Math.max(entry.latestOrdinal, generation.ordinal)
    return {
      endpoint, requestKey, requestGeneration: generation.value, ordinal: generation.ordinal,
      requestScope: scope, exposeRequestScope,
    }
  }

  function succeed(request, payload) {
    const entry = entryFor(request.endpoint, request.requestKey, request.requestScope)
    if (request.ordinal === entry.latestOrdinal) {
      entry.payload = clone(payload)
      entry.lastSuccessAt = now()
      entry.error = null
      entry.failedAt = null
    }
    return publicState(entry, request)
  }

  function fail(request, error) {
    const entry = entryFor(request.endpoint, request.requestKey, request.requestScope)
    if (request.ordinal === entry.latestOrdinal) {
      entry.error = { code: 'admin_query_failed', message: MESSAGE }
      entry.failedAt = now()
    }
    const state = publicState(entry, request)
    return {
      ...state,
      ...(entry.payload === undefined ? {} : { lastGood: clone(entry.payload) }),
    }
  }

  function inspect({ endpoint, requestKey = endpoint, requestScope = null }) {
    const entry = entries.get(`${endpoint}\u0000${requestKey}\u0000${asScope(requestScope)}`)
    if (!entry) return null
    return {
      lastSuccessAt: entry.lastSuccessAt,
      error: entry.error,
      failedAt: entry.failedAt,
      ...(entry.payload === undefined ? {} : { lastGood: clone(entry.payload) }),
    }
  }

  return { begin, succeed, fail, inspect }
}

export function adminRequestKey(req, endpoint) {
  const params = new URLSearchParams()
  for (const key of Object.keys(req.query || {}).sort()) {
    const value = req.query[key]
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item))
  }
  const query = params.toString()
  return query ? `${endpoint}?${query}` : endpoint
}

export function setAdminQueryHeaders(res, state) {
  res.set({
    'X-Admin-Query-State': state.status,
    'X-Admin-Query-Stale': String(state.stale),
    'X-Admin-Query-Current': String(state.current),
    'X-Admin-Query-Request-Generation': state.requestGeneration,
    'X-Admin-Query-Request-Key': encodeURIComponent(state.requestKey),
    ...(state.requestScope ? { 'X-Admin-Query-Request-Scope': encodeURIComponent(state.requestScope) } : {}),
    ...(state.lastSuccessAt ? { 'X-Admin-Query-Last-Success-At': state.lastSuccessAt } : {}),
  })
}

export default { createAdminQueryState, adminRequestKey, setAdminQueryHeaders }
