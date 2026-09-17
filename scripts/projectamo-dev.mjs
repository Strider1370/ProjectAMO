import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const logDir = path.join(rootDir, 'artifacts', 'runtime-logs')
const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const backendHealthUrl = process.env.PROJECTAMO_BACKEND_HEALTH_URL || 'http://127.0.0.1:3001/api/health'
const command = process.argv[2] || 'verify'
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const testDataDir = path.join(rootDir, 'artifacts', 'dev-test-data')

export async function prepareTestDataPath(env = process.env, {
  directory = testDataDir,
  mkdirFn = mkdir,
  mkdtempFn = mkdtemp,
} = {}) {
  if (typeof env.DATA_PATH === 'string' && env.DATA_PATH.trim()) {
    return { dataPath: env.DATA_PATH, ownsDataPath: false }
  }

  await mkdirFn(directory, { recursive: true })
  const dataPath = await mkdtempFn(path.join(directory, 'run-'))
  env.DATA_PATH = dataPath
  return { dataPath, ownsDataPath: true }
}

export async function cleanupTestDataPath(testData, { rmFn = rm } = {}) {
  if (!testData?.ownsDataPath || !testData.dataPath) return false
  await rmFn(testData.dataPath, { recursive: true, force: true })
  return true
}

export async function startProcess(name, cmd, args, cwd = rootDir, readyPattern) {
  const out = createWriteStream(path.join(logDir, `${name}.out.log`), { flags: 'w' })
  const err = createWriteStream(path.join(logDir, `${name}.err.log`), { flags: 'w' })
  const child = spawn(cmd, args, {
    cwd,
    env: process.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let resolveReady
  let rejectReady
  let readySettled = false
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const markReady = (chunk) => {
    if (!readySettled && readyPattern?.test(String(chunk))) {
      readySettled = true
      resolveReady()
    }
  }

  child.stdout.on('data', markReady)
  child.stderr.on('data', markReady)
  child.stdout.pipe(out)
  child.stderr.pipe(err)
  child.on('exit', (code, signal) => {
    if (code !== null) {
      err.write(`[projectamo-dev] ${name} exited with code ${code}\n`)
    } else {
      err.write(`[projectamo-dev] ${name} exited with signal ${signal}\n`)
    }
    if (!readySettled) {
      readySettled = true
      rejectReady(new Error(`${name} process exited before its own startup signal`))
    }
  })
  child.on('error', (error) => {
    if (!readySettled) {
      readySettled = true
      rejectReady(new Error(`${name} process failed to start: ${error.message}`))
    }
  })

  return { child, out, err, name, ready }
}

export function stopProcess(entry) {
  if (!entry?.child?.pid || entry.child.exitCode !== null) {
    return
  }

  try {
    process.kill(-entry.child.pid, 'SIGTERM')
  } catch {
    try {
      entry.child.kill('SIGTERM')
    } catch {}
  }
}

export function assertStartedProcessAlive(entry) {
  const child = entry?.child
  if (!child?.pid) {
    throw new Error(`${entry?.name || 'server'} did not start a child process`)
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    const reason = child.exitCode !== null ? `exit code ${child.exitCode}` : `signal ${child.signalCode}`
    throw new Error(`${entry.name} process exited before readiness (${reason})`)
  }
}

export async function waitForStartedProcess(entry, timeoutMs = 60000) {
  assertStartedProcessAlive(entry)
  if (!entry.ready) return

  let timer
  try {
    await Promise.race([
      entry.ready,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${entry.name} did not emit its startup signal`)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
  assertStartedProcessAlive(entry)
}

export async function waitForUrl(url, label, entry, {
  timeoutMs = 60000,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  const deadline = now() + timeoutMs
  let lastError = null

  while (now() < deadline) {
    assertStartedProcessAlive(entry)
    try {
      const response = await fetchImpl(url)
      if (response.ok) {
        // A port can already have a healthy human-owned server.  Do not use
        // that response as proof that this launcher successfully bound it.
        assertStartedProcessAlive(entry)
        return response
      }
      lastError = new Error(`${label} returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(1000)
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError?.message || 'timeout'}`)
}

export async function runNpm(name, args, extraEnv = {}) {
  const child = spawn('npm', args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })

  const code = await new Promise((resolve) => child.on('exit', resolve))
  if (code !== 0) {
    throw new Error(`${name} failed with exit code ${code}`)
  }
}

export async function startServers() {
  await mkdir(logDir, { recursive: true })
  const backend = await startProcess(
    'backend',
    process.execPath,
    ['server.js'],
    path.join(rootDir, 'backend'),
    /\[server\] Backend running on 127\.0\.0\.1:3001/,
  )
  const frontend = await startProcess(
    'frontend',
    process.execPath,
    [
      path.join(rootDir, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
    '--strictPort',
    ],
    path.join(rootDir, 'frontend'),
    /Local:\s+http:\/\/127\.0\.0\.1:5173\//,
  )

  return { backend, frontend }
}

export async function withServers(task, {
  startServersFn = startServers,
  waitForStartedProcessFn = waitForStartedProcess,
  waitForUrlFn = waitForUrl,
  stopProcessFn = stopProcess,
} = {}) {
  const servers = await startServersFn()
  try {
    await waitForStartedProcessFn(servers.backend)
    await waitForUrlFn(backendHealthUrl, 'backend', servers.backend)
    await waitForStartedProcessFn(servers.frontend)
    await waitForUrlFn(appUrl, 'frontend', servers.frontend)
    console.log(`[projectamo-dev] backend ready: ${backendHealthUrl}`)
    console.log(`[projectamo-dev] frontend ready: ${appUrl}`)
    await task()
  } finally {
    stopProcessFn(servers.frontend)
    stopProcessFn(servers.backend)
  }
}

export async function runMain() {
  if (!['serve', 'serve:test', 'serve:no-nwp', 'verify', 'smoke', 'screenshots', 'ground-signage-capture'].includes(command)) {
    throw new Error('Usage: node scripts/projectamo-dev.mjs [serve|serve:test|serve:no-nwp|verify|smoke|screenshots|ground-signage-capture]')
  }

  let testData
  try {
    // serve:test는 자동수집을 끄고 admin(local_admin) 세션을 제공한다. 호출자가
    // DATA_PATH를 지정하지 않으면 이 실행만 소유하는 ignored 경로를 만든다.
    if (command === 'serve:test') {
      testData = await prepareTestDataPath()
      process.env.DISABLE_COLLECTION = '1'
      process.env.ENABLE_TEST_MUTATIONS = '1'
      process.env.AUTO_ADMIN_LOGIN = '1'
      console.log(`[projectamo-dev] TEST MODE — 자동수집 비활성 + admin(local_admin) 자동 로그인. DATA_PATH=${testData.dataPath}${testData.ownsDataPath ? ' (ephemeral)' : ' (caller-provided)'}.`)
    }

    if (command === 'serve:no-nwp') {
      process.env.KIM_NWP_DISABLED = '1'
      console.log('[projectamo-dev] KIM NWP disabled — other collection jobs remain enabled.')
    }

  if (command === 'serve' || command === 'serve:test' || command === 'serve:no-nwp') {
    await withServers(async () => {
      console.log('[projectamo-dev] press Ctrl+C to stop')
      await new Promise((resolve) => {
        const keepAlive = setInterval(() => {}, 2 ** 31 - 1)
        const stop = () => {
          clearInterval(keepAlive)
          resolve()
        }
        process.once('SIGINT', stop)
        process.once('SIGTERM', stop)
      })
    })
  }

  if (command === 'verify') {
    await withServers(async () => {})
  }

  if (command === 'smoke') {
    await withServers(async () => {
      await runNpm('responsive smoke', ['run', 'smoke:responsive', '--prefix', 'frontend'], {
        PROJECTAMO_URL: appUrl,
      })
    })
  }

  if (command === 'screenshots') {
    await withServers(async () => {
      await runNpm('responsive screenshots', ['run', 'screenshots:responsive', '--prefix', 'frontend'], {
        PROJECTAMO_URL: appUrl,
      })
    })
  }

  if (command === 'ground-signage-capture') {
    await withServers(async () => {
      await runNpm(
        'ground signage capture',
        ['run', 'capture:monitoring-ground-signage', '--prefix', 'frontend'],
        { PROJECTAMO_URL: appUrl },
      )
    })
  }
  } finally {
    await cleanupTestDataPath(testData)
  }
}

if (isMainModule) {
  try {
    await runMain()
  } catch (error) {
    console.error(`[projectamo-dev] ${error.message}`)
    process.exitCode = 1
  }
}
