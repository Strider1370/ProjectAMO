import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import config from '../config.js'
import stats from '../stats.js'
import wifsUsage from '../wifs-usage.js'

const script = fileURLToPath(new URL('../../../scripts/wafs-sigwx-live.py', import.meta.url))
const OPERATIONS = { metadata: 'wifs_sigwx_metadata', forecast: 'wifs_sigwx_forecast' }

export async function process({ signal, root = config.storage.base_path,
  credential = config.wifs.api_key, python = config.wifs.python,
  usage = wifsUsage, operationStats = stats } = {}) {
  if (!credential) throw new Error('wifs_sigwx_key_missing')
  const child = spawn(python, [script, '--root', root], {
    signal,
    env: { ...globalThis.process.env, WIFS_API_KEY: credential },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let result = null
  let active = null
  let protocolError = null
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; child.kill() }, 30 * 60_000)
  timeout.unref?.()

  function handleLine(line) {
    const event = JSON.parse(line)
    if (event.event === 'result') {
      if (result || active || !Number.isInteger(event.frames) || event.frames !== 11
        || typeof event.saved !== 'boolean' || !/^\d{10}$/.test(event.runId)) throw new Error('wifs_sigwx_result_invalid')
      result = event
      return
    }
    const operation = OPERATIONS[event.endpoint]
    if (!operation || result) throw new Error('wifs_sigwx_event_invalid')
    if (event.event === 'started') {
      if (active) throw new Error('wifs_sigwx_overlapping_request')
      active = operation
      operationStats.recordApiOperationStart(operation)
      return
    }
    if (event.event !== 'completed' || active !== operation
      || !Number.isInteger(event.bytes) || event.bytes < 0
      || !Number.isInteger(event.durationMs) || event.durationMs < 0
      || (event.status !== null && (!Number.isInteger(event.status) || event.status < 100 || event.status > 599))) {
      throw new Error('wifs_sigwx_event_invalid')
    }
    usage.record(event)
    if (event.status === 200) operationStats.recordApiOperationSuccess(operation, event.durationMs)
    else operationStats.recordApiOperationFailure(operation, event.status ? `WIFS HTTP ${event.status}; 수집 중단` : 'WIFS 요청 실패; 수집 중단', event.durationMs)
    active = null
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    if (protocolError) return
    stdout += chunk
    if (stdout.length > 16_384) { protocolError = new Error('wifs_sigwx_output_too_large'); child.kill(); return }
    let newline
    while ((newline = stdout.indexOf('\n')) >= 0) {
      const line = stdout.slice(0, newline)
      stdout = stdout.slice(newline + 1)
      try { handleLine(line) } catch (error) { protocolError = error; child.kill(); return }
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-1024) })
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    if (active) {
      operationStats.recordApiOperationFailure(active, 'WIFS 요청 중 프로세스 종료', null)
      active = null
    }
    if (protocolError || timedOut || code !== 0 || stdout.trim() || !result) {
      throw protocolError || new Error(timedOut ? 'wifs_sigwx_timeout' : stderr.trim() || `wifs_sigwx_exit_${code}`)
    }
    return { type: 'sigwx_high', saved: result.saved, runId: result.runId, frames: result.frames }
  } catch (error) {
    if (active) operationStats.recordApiOperationFailure(active, 'WIFS 요청 중 프로세스 종료', null)
    throw new Error(`wifs_sigwx_collector_failed:${String(error.message).replace(/[\r\n]+/g, ' ').slice(0, 300)}`)
  } finally {
    clearTimeout(timeout)
  }
}

export default { process }
