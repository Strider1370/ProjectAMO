// 관리자 조회는 화면 수명 동안 하나의 scope를 공유한다. endpoint/query별 최신 요청만
// 반영하고, 실패한 조회는 마지막 정상 결과를 지우지 않는다.
export function createAdminRequestScope(random = Math.random) {
  return `admin-${Date.now().toString(36)}-${Math.floor(random() * 0x7fffffff).toString(36)}`
}

function queryState(response, fallback = {}) {
  const header = (name) => response.headers?.get?.(name) ?? null
  return {
    status: header('X-Admin-Query-State') || fallback.status || (response.ok ? 'ready' : 'error'),
    stale: (header('X-Admin-Query-Stale') || String(Boolean(fallback.stale))) === 'true',
    current: (header('X-Admin-Query-Current') || String(fallback.current !== false)) !== 'false',
    lastSuccessAt: header('X-Admin-Query-Last-Success-At') || fallback.lastSuccessAt || null,
    failedAt: fallback.failedAt || null,
    requestKey: decodeURIComponent(header('X-Admin-Query-Request-Key') || fallback.requestKey || ''),
    requestGeneration: header('X-Admin-Query-Request-Generation') || fallback.requestGeneration || null,
  }
}

export function createAdminQuerySession({ fetchImpl = fetch, scope = createAdminRequestScope() } = {}) {
  let generation = 0
  const latestByKey = new Map()
  const lastGoodByKey = new Map()

  async function get(url, init = {}) {
    const requestGeneration = String(++generation)
    const key = String(url)
    latestByKey.set(key, requestGeneration)
    const headers = new Headers(init.headers || {})
    headers.set('X-Admin-Request-Generation', requestGeneration)
    headers.set('X-Admin-Request-Generation-Scope', scope)

    let response
    let body
    try {
      response = await fetchImpl(url, { ...init, credentials: 'include', headers })
      body = await response.json().catch(() => ({}))
    } catch (cause) {
      const error = Object.assign(new Error('관리자 조회에 실패했습니다.'), {
        cause,
        query: { status: 'error', stale: lastGoodByKey.has(key), current: latestByKey.get(key) === requestGeneration, lastSuccessAt: null },
        lastGood: lastGoodByKey.get(key),
      })
      throw error
    }

    const fallback = body?.query || {}
    const query = queryState(response, fallback)
    const current = latestByKey.get(key) === requestGeneration && query.current
    const result = { data: body, query: { ...query, current }, requestGeneration, scope }
    if (response.ok) {
      if (current) lastGoodByKey.set(key, body)
      return result
    }

    const error = Object.assign(new Error(body?.error || String(response.status)), {
      status: response.status,
      body,
      query: { ...query, current },
      lastGood: body?.query?.lastGood ?? lastGoodByKey.get(key),
    })
    throw error
  }

  return { scope, get }
}
