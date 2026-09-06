import apiHubUsage from '../api-hub-usage.js'
import { resolveApiOperation } from '../api-operation-registry.js'

export function createFetchApiHub({ usage = apiHubUsage, fetchImpl = fetch, logger = console } = {}) {
  return async function fetchApiHub({ credential, url, options = {}, endpoint }) {
    usage.assertAllowed(credential)
    const upstream = await fetchImpl(url, options)
    const body = await upstream.arrayBuffer()
    // 장부를 못 적었다고 이미 받아온 데이터를 버리지 않는다. 위성 수집이 예전부터 이렇게 한다
    // (satellite/worker-runner.js) — 집계 하나 때문에 수집이 통째로 멈추면 손해가 훨씬 크다.
    // 한도 차단은 그대로 산다: record는 파일에 쓰기 전에 메모리 장부부터 올린다.
    await usage.record(credential, { bytes: body.byteLength, status: upstream.status, endpoint })
      .catch((recordError) => logger.warn?.('[api-hub] 사용량 기록 실패:', recordError?.message))
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
  }
}

export const fetchApiHub = createFetchApiHub()

export function endpointFor(url) {
  try { return resolveApiOperation({ url }).id } catch { return null }
}
