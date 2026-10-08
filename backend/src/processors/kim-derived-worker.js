// GKTG·권계면을 별도 Node 자식 프로세스에서 돌린다.
//
// 백엔드 안에서 돌 때는 격자 수백 장을 읽고 검증하는 동안 이벤트 루프가 100초 넘게 막혀 사이트 요청이
// 504로 끝났다(2026-10-04). 자식은 낮은 CPU 우선순위와 자기 힙 한도로 돌고, 끝나면 종료해 쓴 메모리를
// 모두 운영체제에 돌려준다. 메모리가 작은 서버라 위성 워커와 같은 순번(heavyChildGate)을 받아 한 번에 하나만 계산한다.
// 순번은 자식이 예보시각마다 요청한다(turn → turn_result, 끝나면 turn_release). 받은 뒤 서버 남은 메모리가 기준
// 이상인지 확인하고 넘겨준다. 예보시각 사이에는 위성 처리가 순번을 받을 수 있다.
import { fork } from 'node:child_process'
import os from 'node:os'

import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { createExclusiveGate, heavyChildGate } from '../lib/heavy-child-gate.js'
import { waitForMemoryReserve } from '../lib/memory-reserve.js'
import { KIM_DERIVED_JOBS, errorPayload, restoreError } from './kim-derived-worker-entry.js'

const ENTRY = new URL('./kim-derived-worker-entry.js', import.meta.url)
// 취소를 받은 자식이 Python 계산을 끝내고 'cancelled'를 기록할 시간.
const DEFAULT_KILL_GRACE_MS = 10_000

const isPlainObject = (value) => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype

// GKTG·권계면 자식은 서로 하나씩만 띄운다. 쉬는 자식도 메모리를 잡고 있어 둘이 함께 떠 있으면 계산 하나와 겹쳐 서버가 모자란다.
export const kimDerivedJobGate = createExclusiveGate()

export function runKimDerivedWorker(kind, { jobGate = kimDerivedJobGate, ...options } = {}) {
  if (!KIM_DERIVED_JOBS.includes(kind)) return Promise.reject(new Error('invalid kim derived worker job'))
  return jobGate.run(() => runOnce(kind, options), { signal: options.signal })
}

function runOnce(kind, {
  jobOptions = {},
  gate = heavyChildGate,
  waitForMemory = waitForMemoryReserve,
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
    let heldTurn = null
    let turnPending = false

    // 진행이 없는 시간의 한도. 순번을 받거나 돌려줄 때 다시 재고, 순번을 기다리는 동안은 멈춘다.
    const armTimeout = () => {
      clearTimeout(timeoutId)
      if (!settled) timeoutId = setTimeout(() => stop(new Error(`${kind}_worker_timeout`)), workerConfig.timeout_ms)
    }

    const releaseTurn = () => {
      const release = heldTurn
      heldTurn = null
      release?.()
    }

    const finish = (error, result) => {
      if (settled) return
      settled = true
      releaseTurn()
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

    async function grantTurn(message) {
      if (!Number.isInteger(message.id) || heldTurn || turnPending) return stop(new Error('invalid kim derived worker turn'))
      turnPending = true
      clearTimeout(timeoutId)
      try {
        const release = await gate.acquire({ signal: fetches.signal })
        if (settled) return release()
        heldTurn = release
        const waitedMs = await waitForMemory({ minBytes: workerConfig.memory_reserve_mb * 1048576, timeoutMs: workerConfig.memory_wait_ms, signal: fetches.signal })
        sendToChild({ type: 'turn_result', id: message.id, ok: true, waitedMs })
      } catch (error) {
        releaseTurn()
        sendToChild({ type: 'turn_result', id: message.id, ok: false, error: errorPayload(error) })
      } finally {
        turnPending = false
        armTimeout()
      }
    }

    function onMessage(message) {
      if (message?.type === 'fetch') return relayFetch(message)
      if (message?.type === 'turn') return grantTurn(message)
      if (message?.type === 'turn_release') {
        releaseTurn()
        return armTimeout()
      }
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
    armTimeout()
    sendToChild({ type: 'job', kind, ...(Object.keys(jobOptions).length ? { options: jobOptions } : {}) })
  })
}

export default { runKimDerivedWorker }
