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
