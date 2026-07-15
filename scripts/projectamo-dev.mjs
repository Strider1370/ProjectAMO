import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const logDir = path.join(rootDir, 'artifacts', 'runtime-logs')
const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const backendHealthUrl = process.env.PROJECTAMO_BACKEND_HEALTH_URL || 'http://127.0.0.1:3001/api/health'
const command = process.argv[2] || 'verify'

function normalizedEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  const pathEntry = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')
  const pathValue = pathEntry?.[1]

  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') {
      delete env[key]
    }
  }

  if (pathValue) {
    env[process.platform === 'win32' ? 'Path' : 'PATH'] = pathValue
  }

  return env
}

function npmInvocation(args) {
  if (process.platform === 'win32') {
    return {
      cmd: 'cmd.exe',
      args: ['/d', '/s', '/c', ['npm.cmd', ...args].map(quoteCmdArg).join(' ')],
    }
  }

  return { cmd: 'npm', args }
}

function quoteCmdArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value
  }
  return `"${String(value).replace(/"/g, '\\"')}"`
}

async function startProcess(name, cmd, args, cwd = rootDir) {
  const out = createWriteStream(path.join(logDir, `${name}.out.log`), { flags: 'w' })
  const err = createWriteStream(path.join(logDir, `${name}.err.log`), { flags: 'w' })
  const child = spawn(cmd, args, {
    cwd,
    env: normalizedEnv(),
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stdout.pipe(out)
  child.stderr.pipe(err)
  child.on('exit', (code, signal) => {
    if (code !== null) {
      err.write(`[projectamo-dev] ${name} exited with code ${code}\n`)
    } else {
      err.write(`[projectamo-dev] ${name} exited with signal ${signal}\n`)
    }
  })

  return { child, out, err, name }
}

function stopProcess(entry) {
  if (!entry?.child?.pid || entry.child.exitCode !== null) {
    return
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(entry.child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })
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

async function waitForUrl(url, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return response
      }
      lastError = new Error(`${label} returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError?.message || 'timeout'}`)
}

async function runNpm(name, args, extraEnv = {}) {
  const invocation = npmInvocation(args)
  const child = spawn(invocation.cmd, invocation.args, {
    cwd: rootDir,
    env: normalizedEnv(extraEnv),
    stdio: 'inherit',
    windowsHide: true,
  })

  const code = await new Promise((resolve) => child.on('exit', resolve))
  if (code !== 0) {
    throw new Error(`${name} failed with exit code ${code}`)
  }
}

async function startServers() {
  await mkdir(logDir, { recursive: true })
  const backend = await startProcess(
    'backend',
    process.execPath,
    ['server.js'],
    path.join(rootDir, 'backend'),
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
  )

  return { backend, frontend }
}

async function withServers(task) {
  const servers = await startServers()
  try {
    await waitForUrl(backendHealthUrl, 'backend')
    await waitForUrl(appUrl, 'frontend')
    console.log(`[projectamo-dev] backend ready: ${backendHealthUrl}`)
    console.log(`[projectamo-dev] frontend ready: ${appUrl}`)
    await task()
  } finally {
    stopProcess(servers.frontend)
    stopProcess(servers.backend)
  }
}

if (!['serve', 'serve:test', 'verify', 'smoke', 'screenshots'].includes(command)) {
  console.error('Usage: node scripts/projectamo-dev.mjs [serve|serve:test|verify|smoke|screenshots]')
  process.exit(2)
}

// serve:test = 테스트 인스턴스: 자동수집(cron)을 꺼서 데이터를 고정. 나머지는 serve와 동일(같은 포트).
// startProcess가 process.env를 상속하므로 여기서 세팅하면 백엔드에 전달됨.
if (command === 'serve:test') {
  process.env.DISABLE_COLLECTION = '1'
  console.log('[projectamo-dev] TEST MODE — 자동수집 비활성(DISABLE_COLLECTION=1). 데이터 고정, 자유 조작 가능.')
}

try {
  if (command === 'serve' || command === 'serve:test') {
    await withServers(async () => {
      console.log('[projectamo-dev] press Ctrl+C to stop')
      await new Promise((resolve) => {
        process.once('SIGINT', resolve)
        process.once('SIGTERM', resolve)
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
} catch (error) {
  console.error(`[projectamo-dev] ${error.message}`)
  process.exit(1)
}
