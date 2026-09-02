import apiHubUsage from '../api-hub-usage.js'
import { resolveApiOperation } from '../api-operation-registry.js'

export function createFetchApiHub({ usage = apiHubUsage, fetchImpl = fetch } = {}) {
  return async function fetchApiHub({ credential, url, options = {}, endpoint }) {
    usage.assertAllowed(credential)
    const upstream = await fetchImpl(url, options)
    const body = await upstream.arrayBuffer()
    await usage.record(credential, { bytes: body.byteLength, status: upstream.status, endpoint })
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

let installed = false
export function installApiHubFetchGuard() {
  if (installed) return
  installed = true
  const rawFetch = globalThis.fetch
  const guardedFetch = createFetchApiHub({ fetchImpl: rawFetch })
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.hostname !== 'apihub.kma.go.kr' || !url.searchParams.has('authKey')) return rawFetch(input, options)
    const endpoint = endpointFor(url)
    if (!endpoint) {
      const error = new Error('unknown_api_hub_endpoint')
      error.code = 'unknown_api_hub_endpoint'
      throw error
    }
    return guardedFetch({ credential: url.searchParams.get('authKey'), url: input, options, endpoint })
  }
}
