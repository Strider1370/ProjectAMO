// 시연 전용 백엔드. 운영 백엔드가 관리자 요청으로 띄우고 끈다.
//
// 시연 스냅샷을 모든 방문자에게 보이지 않고 시연하는 브라우저에서만 보이게 한다. 시연용 백엔드는 같은 코드(server.js)를
// 다른 포트(config.demo_instance.port)에서 PROJECTAMO_DEMO_INSTANCE=1로 띄운 것이다. 수집·알림·백업은 하지 않고, 자료는
// 따로 둔 시연 자료 위치(storage.demo_active_path → 스냅샷 view)에서 읽는다. 웹서버(nginx)는 시연 쿠키
// (config.demo_instance.cookie)가 있는 요청만 이 백엔드와 시연 자료로 보낸다. 로그인 세션은 같은 DB에 있어 그대로 이어진다.
//
// 서버 메모리(1.9 GB)에 확대 KIM 계산과 시연 백엔드를 같이 둘 수 없어, 켜져 있는 동안 확대 회차를 멈추고 돌던 회차는 중단한다.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import config from '../config.js'
import { abortCollections } from '../index.js'
import { pauseExpandedRuns, resumeExpandedRuns } from '../processors/kim-expanded-processor.js'
import { createDataViewManager } from './data-view.js'
import { inspectSnapshot } from './snapshot-store.js'

const SERVER_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server.js')
const EXPANDED_TYPES = ['kim_expanded_00', 'kim_expanded_06']
// 시연 백엔드 힙 한도와, 띄우기 전에 남아 있어야 하는 메모리(운영 백엔드 약 400 MB, 시연 백엔드 약 300 MB).
const DEMO_HEAP_MB = 512
export const DEMO_MIN_AVAILABLE_BYTES = 500 * 1024 ** 2
export const DEMO_LOG_PATH = path.join(os.tmpdir(), 'projectamo-demo-instance.log')

function codedError(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra })
}

// 리눅스의 실제로 쓸 수 있는 메모리(MemAvailable). 없으면 os.freemem.
export function readMemAvailable() {
  try {
    const match = /^MemAvailable:\s+(\d+) kB/m.exec(fs.readFileSync('/proc/meminfo', 'utf8'))
    if (match) return Number(match[1]) * 1024
  } catch {}
  return os.freemem()
}

function launchDemoServer({ port, activePath }) {
  const log = fs.openSync(DEMO_LOG_PATH, 'w')
  try {
    const child = spawn(process.execPath, [`--max-old-space-size=${DEMO_HEAP_MB}`, SERVER_ENTRY], {
      cwd: path.dirname(SERVER_ENTRY),
      env: { ...process.env, NODE_OPTIONS: '', BACKEND_PORT: String(port), ACTIVE_DATA_PATH: activePath, PROJECTAMO_DEMO_INSTANCE: '1' },
      stdio: ['ignore', log, log],
    })
    // 운영 백엔드가 끝나면 시연 백엔드도 끝낸다(배포 재시작 등).
    const killChild = () => { try { child.kill('SIGTERM') } catch {} }
    process.once('exit', killChild)
    child.once('exit', () => process.removeListener('exit', killChild))
    return child
  } finally {
    fs.closeSync(log)
  }
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const done = (open) => { socket.destroy(); resolve(open) }
    socket.setTimeout(2_000, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

async function waitDemoHealthy({ port, child, timeoutMs = 40_000, pollMs = 500 }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) throw codedError('demo_instance_exited', { exitCode: child.exitCode })
    // 포트가 열리면 준비된 것이다(server.js는 시작 준비를 마친 뒤 listen한다). 바깥 요청은 request-observability만 하므로
    // HTTP가 아니라 연결만 확인한다.
    if (await portOpen(port)) return
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  throw codedError('demo_instance_start_timeout')
}

function waitExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs)
    child.once('exit', () => { clearTimeout(timer); resolve(true) })
  })
}

export function createDemoInstance({
  basePath = config.storage.base_path,
  activePath = config.storage.demo_active_path,
  port = config.demo_instance.port,
  views = createDataViewManager({ basePath, activePath }),
  inspect = inspectSnapshot,
  launch = launchDemoServer,
  waitHealthy = waitDemoHealthy,
  memAvailable = readMemAvailable,
  minAvailableBytes = DEMO_MIN_AVAILABLE_BYTES,
  abortExpanded = () => abortCollections(EXPANDED_TYPES),
  pauseExpanded = pauseExpandedRuns,
  resumeExpanded = resumeExpandedRuns,
  memoryWaitMs = 30_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let current = null
  let starting = false
  let lastExit = null

  function release() {
    try { views.activateLive() } catch {}
    resumeExpanded()
  }

  function status() {
    return {
      running: Boolean(current),
      starting,
      name: current?.name ?? null,
      referenceTime: current?.referenceTime ?? null,
      startedAt: current?.startedAt ?? null,
      pid: current?.child.pid ?? null,
      port,
      lastExit,
    }
  }

  async function start(name) {
    if (current) throw codedError('demo_instance_running')
    if (starting) throw codedError('demo_instance_starting')
    const report = inspect(basePath, name)
    if (!report.ready) throw codedError(report.blockers.includes('snapshot_not_found') ? 'snapshot_not_found' : 'snapshot_not_ready', { report })
    starting = true
    pauseExpanded('demo_instance_running')
    let child = null
    try {
      // 돌던 확대 회차를 끊고, 그 계산 프로세스들이 메모리를 돌려줄 때까지 잠깐 기다린다.
      const aborted = abortExpanded()
      const deadline = Date.now() + (aborted.length ? memoryWaitMs : 0)
      while (memAvailable() < minAvailableBytes && Date.now() < deadline) await sleep(1_000)
      const available = memAvailable()
      if (available < minAvailableBytes) throw codedError('demo_instance_low_memory', { available, required: minAvailableBytes })
      const context = views.activateDemo(name)
      child = launch({ port, activePath })
      const startedChild = child
      child.once('exit', (code, signal) => {
        lastExit = { code, signal, at: new Date().toISOString() }
        if (current?.child === startedChild) {
          current = null
          release()
        }
      })
      await waitHealthy({ port, child })
      current = { child, name, referenceTime: context.referenceTime, startedAt: new Date().toISOString(), abortedExpanded: aborted }
      return { ...status(), abortedExpanded: aborted }
    } catch (error) {
      if (child) { try { child.kill('SIGKILL') } catch {} }
      release()
      throw error
    } finally {
      starting = false
    }
  }

  async function stop() {
    const running = current
    current = null
    if (running) {
      running.child.kill('SIGTERM')
      if (!(await waitExit(running.child, 5_000))) running.child.kill('SIGKILL')
    }
    release()
    return status()
  }

  return { start, stop, status }
}

export const demoInstance = createDemoInstance()

export default demoInstance
