import { fork } from 'node:child_process'

import config, { satellite as satelliteConfig } from '../config.js'
import apiHubUsage from '../api-hub-usage.js'
import { assertSatelliteJob, failureMessage, successMessage } from './worker-protocol.js'

const DEFAULT_KILL_GRACE_MS = 1_000

function workerError(name, message) {
  const error = new Error(message)
  error.name = name
  return error
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyKeys(value, keys) {
  return isPlainObject(value)
    && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key))
}

function decodeTerminalMessage(message) {
  if (!hasOnlyKeys(message, ['ok', 'result']) && !hasOnlyKeys(message, ['ok', 'error'])) {
    throw workerError('SatelliteWorkerProtocolError', 'invalid satellite worker terminal message')
  }

  if (message.ok === true && hasOnlyKeys(message, ['ok', 'result'])) {
    try {
      return { kind: 'success', work: successMessage(message.result).result }
    } catch {
      throw workerError('SatelliteWorkerProtocolError', 'invalid satellite worker terminal message')
    }
  }

  if (message.ok === false && hasOnlyKeys(message, ['ok', 'error'])) {
    const expected = failureMessage(new Error())
    if (JSON.stringify(message) !== JSON.stringify(expected)) {
      throw workerError('SatelliteWorkerProtocolError', 'invalid satellite worker terminal message')
    }
    return { kind: 'failure', error: workerError(message.error.name, message.error.message) }
  }

  throw workerError('SatelliteWorkerProtocolError', 'invalid satellite worker terminal message')
}

// 워커가 재서 보고한 사용량을 부모가 장부에 적는다. 위성 호출은 모두 레이더·위성 열쇠를 쓰므로
// 자격증명을 IPC로 실어 나르지 않고 여기서 설정에서 집는다 — 열쇠를 메시지에 담을 이유가 없다.
// 적기에 실패해도 수집 결과는 그대로 돌려준다: 집계 하나 때문에 위성이 통째로 멈추면 손해가 크다.
function recordApiHubUsage(entry) {
  const credential = config.api?.radar_satellite_auth_key
  if (!credential) return
  Promise.resolve(apiHubUsage.record(credential, entry))
    .catch((error) => console.warn('[satellite] API 사용량 기록 실패:', error?.message))
}

function validDelay(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function runSatelliteWorker(job, {
  forkImpl = fork,
  timeoutMs = satelliteConfig.worker_timeout_ms,
  signal,
  killGraceMs = DEFAULT_KILL_GRACE_MS,
  recordUsage = recordApiHubUsage,
} = {}) {
  let safeJob
  try {
    safeJob = assertSatelliteJob(job)
  } catch (error) {
    return Promise.reject(error)
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(workerError('SatelliteWorkerTimeoutError', 'invalid satellite worker timeout'))
  }

  return new Promise((resolve, reject) => {
    let child
    let terminal
    let terminalError
    let exitSeen = false
    let settled = false
    let terminationRequested = false
    let timeoutId
    let killId

    const cleanup = () => {
      clearTimeout(timeoutId)
      clearTimeout(killId)
      signal?.removeEventListener('abort', onAbort)
      child?.removeListener('message', onMessage)
      child?.removeListener('error', onError)
      child?.removeListener('exit', onExit)
      child?.removeListener('disconnect', onDisconnect)
    }

    const finish = (error, result) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(result)
    }

    const kill = (killSignal) => {
      try {
        child?.kill(killSignal)
      } catch {
        // Exit/error handling decides the terminal failure.
      }
    }

    const requestTermination = (error) => {
      if (terminalError) return
      terminalError = error
      if (exitSeen) {
        finish(terminalError)
        return
      }
      if (!terminationRequested) {
        terminationRequested = true
        kill('SIGTERM')
        killId = setTimeout(() => kill('SIGKILL'), validDelay(killGraceMs, DEFAULT_KILL_GRACE_MS))
      }
    }

    const onAbort = () => requestTermination(signal.reason ?? workerError('AbortError', 'satellite worker cancelled'))
    const onMessage = (message) => {
      if (terminal || terminalError) {
        requestTermination(workerError('SatelliteWorkerProtocolError', 'multiple satellite worker terminal messages'))
        return
      }
      try {
        terminal = decodeTerminalMessage(message)
        if (terminal.kind === 'failure') requestTermination(terminal.error)
      } catch (error) {
        requestTermination(error)
      }
    }
    const onError = () => requestTermination(workerError('SatelliteWorkerExitError', 'satellite worker process error'))
    const onDisconnect = () => {
      if (!terminal && !terminalError) requestTermination(workerError('SatelliteWorkerProtocolError', 'satellite worker disconnected before terminal message'))
    }
    const onExit = (code, exitSignal) => {
      exitSeen = true
      if (terminalError) return finish(terminalError)
      if (terminal?.kind === 'success' && code === 0 && exitSignal === null) {
        for (const entry of terminal.work.apiHubUsage ?? []) recordUsage(entry)
        return finish(null, terminal.work)
      }
      if (terminal?.kind === 'failure') return finish(terminal.error)
      finish(workerError('SatelliteWorkerExitError', `satellite worker exited (${code ?? 'null'}, ${exitSignal ?? 'none'})`))
    }

    try {
      child = forkImpl(new URL('./worker-entry.js', import.meta.url), [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      })
      child.on('message', onMessage)
      child.once('error', onError)
      child.once('exit', onExit)
      child.once('disconnect', onDisconnect)
      if (signal?.aborted) {
        onAbort()
      } else {
        signal?.addEventListener('abort', onAbort, { once: true })
        timeoutId = setTimeout(() => requestTermination(
          workerError('SatelliteWorkerTimeoutError', 'satellite worker timed out'),
        ), timeoutMs)
        child.send(safeJob)
      }
    } catch (error) {
      requestTermination(workerError('SatelliteWorkerExitError', 'satellite worker failed to start'))
      if (!child) finish(error)
    }
  })
}
