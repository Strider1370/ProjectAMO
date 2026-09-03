import { resolveApiOperation } from '../api-operation-registry.js'
import { requestObservedApi } from './request-observability.js'

/**
 * Compatibility seam for registered processor transports. The registry owns the
 * timeout; the retained timeout argument prevents call-site churn while callers
 * migrate to requestObservedApi directly.
 */
export async function fetchWithTimeout(url, timeoutMs, { signal } = {}) {
  void timeoutMs
  const operation = resolveApiOperation({ url })
  return requestObservedApi({ operation, url, options: signal ? { signal } : {} })
}
