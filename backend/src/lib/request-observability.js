import https from 'node:https'

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

function safeLogValue(value) {
  return String(value ?? 'unknown')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\?\S*/g, '?[redacted]')
    .replace(/\b(?:authKey|serviceKey)\s*[=:]\s*\S+/gi, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
    .trim()
    .slice(0, 240)
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

function requestDeadline(signal, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(requestError('api_operation_timeout')), timeoutMs)
  const onAbort = () => controller.abort(signal.reason ?? requestError('api_operation_cancelled'))
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function withinDeadline(operation, signal) {
  if (signal.aborted) return Promise.reject(signal.reason ?? requestError('api_operation_cancelled'))
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(signal.reason ?? requestError('api_operation_cancelled'))
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve().then(operation).then((value) => {
      cleanup()
      resolve(value)
    }, (error) => {
      cleanup()
      reject(error)
    })
  })
}

async function withTimeout(fetchImpl, url, options, timeoutMs) {
  const deadline = requestDeadline(options.signal, timeoutMs)
  try {
    const upstream = await withinDeadline(() => fetchImpl(url, { ...options, signal: deadline.signal, [REQUEST_OBSERVED]: true }), deadline.signal)
    const body = await withinDeadline(() => upstream.arrayBuffer(), deadline.signal)
    return { upstream, body }
  } finally {
    deadline.cleanup()
  }
}

function shouldUseFallback(error, policy) {
  return Boolean(policy.transportFallback) && policy.transportFallback.trigger.causeCode === error?.cause?.code
}

async function httpsFallback(url, policy, signal) {
  const transport = policy.transportFallback.transport
  const deadline = requestDeadline(signal, policy.timeoutMs)
  let onAbort
  try {
    return await new Promise((resolve, reject) => {
      let settled = false
      const settle = (callback, value) => {
        if (settled) return
        settled = true
        callback(value)
      }
      const request = https.request(url, {
        method: 'GET', rejectUnauthorized: transport.rejectUnauthorized, headers: transport.headers,
      }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.once('error', (error) => settle(reject, error))
        response.once('aborted', () => settle(reject, requestError('api_operation_cancelled')))
        response.once('end', () => settle(resolve, new Response(Buffer.concat(chunks), { status: response.statusCode || 500, headers: response.headers })))
      })
      onAbort = () => request.destroy(deadline.signal.reason ?? requestError('api_operation_cancelled'))
      if (deadline.signal.aborted) onAbort()
      else deadline.signal.addEventListener('abort', onAbort, { once: true })
      request.once('error', (error) => settle(reject, error))
      request.end()
    })
  } finally {
    if (onAbort) deadline.signal.removeEventListener('abort', onAbort)
    deadline.cleanup()
  }
}

export function createRequestObservedApi({ usage = apiHubUsage, stats: executionStats = stats, fetchImpl = (...args) => globalThis.fetch(...args), sleep = defaultSleep, resolveOperation = resolveApiOperation, logger = console } = {}) {
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

    // 장부 적기가 실패해도 호출은 죽이지 않는다. 2026-09-06에 api-hub-usage.json 쓰기가
    // 어긋나자 이 세 자리가 전부 호출 실패로 번져 국내 수집이 6시간 40분 멈췄다.
    // 한도 차단은 그대로 산다: record는 파일에 쓰기 전에 메모리 장부부터 올린다.
    const recordUsage = (entry) => usage.record(credential, entry)
      .catch((recordError) => logger.warn?.(`[api] operation=${operation.id} usage_record_failed cause=${safeLogValue(messageFor(recordError))}`))

    const startedAt = Date.now()
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
          let upstream
          let body
          try {
            ({ upstream, body } = await withTimeout(fetchImpl, requestUrl, fetchOptions, policy.timeoutMs))
          } catch (error) {
            if (!shouldUseFallback(error, policy)) throw error
            if (operation.apiHub) await recordUsage({ bytes: 0, status: 0, endpoint: operation.id })
            upstream = await httpsFallback(requestUrl, policy, fetchOptions.signal)
            body = await upstream.arrayBuffer()
          }
          transportCompleted = true
          if (operation.apiHub) {
            await recordUsage({ bytes: body.byteLength, status: upstream.status, endpoint: operation.id })
          }
          finalResponse = upstream
          finalBody = body
          if ((upstream.status >= 500 || upstream.status === 429) && attempt < maxAttempts) {
            await sleepFor(sleep, retryDelayMs, fetchOptions.signal)
            continue
          }
          break
        } catch (error) {
          if (operation.apiHub && transportStarted && !transportCompleted) await recordUsage({ bytes: 0, status: 0, endpoint: operation.id })
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
      const durationMs = Date.now() - startedAt
      executionStats.recordApiOperationSuccess(operation.id, durationMs)
      logger.info?.(`[api] operation=${operation.id} outcome=succeeded duration_ms=${durationMs}`)
      return response
    } catch (error) {
      const durationMs = Date.now() - startedAt
      executionStats.recordApiOperationFailure(operation.id, messageFor(error), durationMs)
      logger.warn?.(`[api] operation=${operation.id} outcome=failed duration_ms=${durationMs} cause=${safeLogValue(error?.code || messageFor(error))}`)
      throw error
    }
  }
}

export const requestObservedApi = createRequestObservedApi()
