// GKTG·권계면을 별도 Node 자식 프로세스에서 돌린다.
//
// 백엔드 안에서 돌 때는 격자 수백 장을 읽고 검증하는 동안 이벤트 루프가 100초 넘게 막혀 사이트 요청이
// 504로 끝났다(2026-10-04). 자식은 낮은 CPU 우선순위와 자기 힙 한도로 돌고, 끝나면 종료해 쓴 메모리를
// 모두 운영체제에 돌려준다. 메모리가 작은 서버라 위성 워커와 같은 순번(heavyChildGate)을 받아 한 번에 하나만 띄운다.
import { fork } from 'node:child_process'
import os from 'node:os'

import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { heavyChildGate } from '../lib/heavy-child-gate.js'
import { KIM_DERIVED_JOBS, errorPayload, restoreError } from './kim-derived-worker-entry.js'

const ENTRY = new URL('./kim-derived-worker-entry.js', import.meta.url)
// 취소를 받은 자식이 Python 계산을 끝내고 'cancelled'를 기록할 시간.
const DEFAULT_KILL_GRACE_MS = 10_000

const isPlainObject = (value) => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype

export function runKimDerivedWorker(kind, { gate = heavyChildGate, ...options } = {}) {
  if (!KIM_DERIVED_JOBS.includes(kind)) return Promise.reject(new Error('invalid kim derived worker job'))
  return gate.run(() => runOnce(kind, options), { signal: options.signal })
}

function runOnce(kind, {
  signal,
  forkImpl = fork,
  fetchGrid = fetchKimGrid,
  setPriority = os.setPriority,
  workerConfig = config.kim_derived_worker,
  killGraceMs = DEFAULT_KILL_GRACE_MS,
} = {}) {
  if (!KIM_DERIVED_JOBS.includes(kind)) return Promise.reject(new Error('invalid kim derived worker job'))
  if (signal?.aborted) return Promise.reject(signal.reason)

  return new Promise((resolve, reject) => {
    const fetches = new AbortController()
    let child
    let terminal = null
    let stopReason = null
    let settled = false
    let timeoutId
    let killId

    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      clearTimeout(killId)
      signal?.removeEventListener('abort', onAbort)
      fetches.abort()
      if (error) reject(error)
      else resolve(result)
    }

    const sendToChild = (message) => {
      try { if (child?.connected !== false) child?.send(message) } catch {}
    }

    // 먼저 자식에게 취소를 알리고, 시간 안에 끝나지 않으면 강제로 끝낸다.
    const stop = (reason) => {
      if (stopReason || settled) return
      stopReason = reason
      fetches.abort(reason)
      sendToChild({ type: 'abort' })
      killId = setTimeout(() => { try { child?.kill('SIGKILL') } catch {} }, killGraceMs)
    }

    const onAbort = () => stop(signal.reason ?? new Error('kim derived worker cancelled'))

    async function relayFetch(message) {
      if (!Number.isInteger(message.id) || !isPlainObject(message.params)) return stop(new Error('invalid kim derived worker fetch'))
      try {
        const text = await fetchGrid({ ...message.params, signal: fetches.signal })
        sendToChild({ type: 'fetch_result', id: message.id, ok: true, text })
      } catch (error) {
        sendToChild({ type: 'fetch_result', id: message.id, ok: false, error: errorPayload(error) })
      }
    }

    function onMessage(message) {
      if (message?.type === 'fetch') return relayFetch(message)
      if (message?.type === 'done' && !terminal) {
        if (message.ok && isPlainObject(message.result) && message.result.type === kind) terminal = { ok: true, result: message.result }
        else terminal = { ok: false, error: message.ok ? new Error('invalid kim derived worker result') : restoreError(message.error) }
        return
      }
      stop(new Error('invalid kim derived worker message'))
    }

    function onExit(code, exitSignal) {
      if (stopReason) return finish(stopReason)
      if (terminal?.ok && code === 0 && exitSignal === null) return finish(null, terminal.result)
      if (terminal && !terminal.ok) return finish(terminal.error)
      finish(new Error(`kim derived worker exited (${code ?? 'null'}, ${exitSignal ?? 'none'})`))
    }

    try {
      child = forkImpl(ENTRY, [], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        execArgv: [`--max-old-space-size=${workerConfig.max_old_space_mb}`],
      })
    } catch (error) {
      return finish(error)
    }
    try { setPriority(child.pid, workerConfig.nice) } catch {}
    child.on('message', onMessage)
    child.once('error', (error) => { stop(error); if (!child.pid) finish(error) })
    child.once('exit', onExit)
    signal?.addEventListener('abort', onAbort, { once: true })
    timeoutId = setTimeout(() => stop(new Error(`${kind}_worker_timeout`)), workerConfig.timeout_ms)
    sendToChild({ type: 'job', kind })
  })
}

export default { runKimDerivedWorker }
