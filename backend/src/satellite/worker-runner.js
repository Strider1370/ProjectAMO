import { fork } from 'node:child_process'

import { satellite as satelliteConfig } from '../config.js'
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

function validDelay(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function runSatelliteWorker(job, {
  forkImpl = fork,
  timeoutMs = satelliteConfig.worker_timeout_ms,
  signal,
  killGraceMs = DEFAULT_KILL_GRACE_MS,
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
      if (terminal?.kind === 'success' && code === 0 && exitSignal === null) return finish(null, terminal.work)
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
