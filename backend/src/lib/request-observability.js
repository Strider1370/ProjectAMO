import apiHubUsage from '../api-hub-usage.js'
import { resolveApiOperation } from '../api-operation-registry.js'
import stats from '../stats.js'

export const REQUEST_OBSERVED = Symbol('request_observed')

function requestError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error)
}

function requestedAttempts(policy, options) {
  const value = options.maxAttempts ?? policy.maxAttempts
  if (!Number.isInteger(value) || value < 1 || value > policy.maxAttempts) throw requestError('invalid_api_operation_attempts')
  return value
}

function allowedOptions(policy, options) {
  const allowed = new Set(policy.allowedOverrides)
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw requestError('api_operation_override_not_allowed')
  }
}

function toFetchOptions(options) {
  const { maxAttempts, retryDelayMs, skipApiHeader, ...fetchOptions } = options
  return fetchOptions
}

function responseCopy(response, body) {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function defaultSleep(ms, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms))
  if (signal.aborted) return Promise.reject(signal.reason ?? requestError('api_operation_cancelled'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason ?? requestError('api_operation_cancelled'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function sleepFor(sleep, ms, signal) {
  if (ms <= 0) return
  if (!signal || sleep === defaultSleep) return sleep(ms, signal)
  if (signal.aborted) throw signal.reason ?? requestError('api_operation_cancelled')

  await new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(signal.reason ?? requestError('api_operation_cancelled'))
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(sleep(ms)).then(() => {
      cleanup()
      resolve()
    }, (error) => {
      cleanup()
      reject(error)
    })
  })
}

function withTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(requestError('api_operation_timeout')), timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  return fetchImpl(url, { ...options, signal, [REQUEST_OBSERVED]: true }).finally(() => clearTimeout(timer))
}

export function createRequestObservedApi({ usage = apiHubUsage, stats: executionStats = stats, fetchImpl = (...args) => globalThis.fetch(...args), sleep = defaultSleep, resolveOperation = resolveApiOperation } = {}) {
  return async function requestObservedApi({ operation, url, options = {}, validate } = {}) {
    const requestUrl = new URL(url)
    const operationId = typeof operation === 'string' ? operation : operation?.id
    if (!operationId || typeof operationId !== 'string') throw requestError('invalid_api_operation')
    const resolvedOperation = resolveOperation({ id: operationId, url: requestUrl })
    if (!resolvedOperation?.requestPolicy) throw requestError('invalid_api_operation')
    operation = resolvedOperation
    const policy = operation.requestPolicy
    allowedOptions(policy, options)
    const maxAttempts = requestedAttempts(policy, options)
    const retryDelayMs = options.retryDelayMs ?? policy.retryDelayMs ?? 0
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) throw requestError('invalid_api_operation_retry_delay')
    const fetchOptions = toFetchOptions(options)
    const credential = operation.apiHub ? requestUrl.searchParams.get('authKey') : null
    if (operation.apiHub && !credential) throw requestError('missing_api_hub_credential')

    executionStats.recordApiOperationStart(operation.id)
    let finalResponse
    let finalBody
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let transportStarted = false
        let transportCompleted = false
        try {
          if (operation.apiHub) usage.assertAllowed(credential)
          transportStarted = true
          const upstream = await withTimeout(fetchImpl, requestUrl, fetchOptions, policy.timeoutMs)
          const body = await upstream.arrayBuffer()
          transportCompleted = true
          if (operation.apiHub) {
            await usage.record(credential, { bytes: body.byteLength, status: upstream.status, endpoint: operation.id })
          }
          finalResponse = upstream
          finalBody = body
          if ((upstream.status >= 500 || upstream.status === 429) && attempt < maxAttempts) {
            await sleepFor(sleep, retryDelayMs, fetchOptions.signal)
            continue
          }
          break
        } catch (error) {
          if (operation.apiHub && transportStarted && !transportCompleted) await usage.record(credential, { bytes: 0, status: 0, endpoint: operation.id })
          if (attempt >= maxAttempts) throw error
          await sleepFor(sleep, retryDelayMs, fetchOptions.signal)
        }
      }

      if (!finalResponse) throw requestError('api_operation_no_response')
      const response = responseCopy(finalResponse, finalBody)
      if (validate) await validate(response.clone())
      else if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`)
        error.status = response.status
        throw error
      }
      executionStats.recordApiOperationSuccess(operation.id)
      return response
    } catch (error) {
      executionStats.recordApiOperationFailure(operation.id, messageFor(error))
      throw error
    }
  }
}

export const requestObservedApi = createRequestObservedApi()
