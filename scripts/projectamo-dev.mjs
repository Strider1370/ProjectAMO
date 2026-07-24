import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const logDir = path.join(rootDir, 'artifacts', 'runtime-logs')
const appUrl = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const backendHealthUrl = process.env.PROJECTAMO_BACKEND_HEALTH_URL || 'http://127.0.0.1:3001/api/health'
const command = process.argv[2] || 'verify'

async function startProcess(name, cmd, args, cwd = rootDir) {
  const out = createWriteStream(path.join(logDir, `${name}.out.log`), { flags: 'w' })
  const err = createWriteStream(path.join(logDir, `${name}.err.log`), { flags: 'w' })
  const child = spawn(cmd, args, {
    cwd,
    env: process.env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
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

if (!['serve', 'serve:test', 'serve:no-nwp', 'verify', 'smoke', 'screenshots'].includes(command)) {
  console.error('Usage: node scripts/projectamo-dev.mjs [serve|serve:test|serve:no-nwp|verify|smoke|screenshots]')
  process.exit(2)
}

// serve:test = 테스트 인스턴스: 자동수집(cron) 끄고, 로그인 없이 admin(local_admin) 세션으로 바로 시작.
// startProcess가 process.env를 상속하므로 여기서 세팅하면 백엔드에 전달됨.
if (command === 'serve:test') {
  process.env.DISABLE_COLLECTION = '1'
  process.env.AUTO_ADMIN_LOGIN = '1'
  console.log('[projectamo-dev] TEST MODE — 자동수집 비활성 + admin(local_admin) 자동 로그인. 데이터 고정, 자유 조작 가능.')
}

if (command === 'serve:no-nwp') {
  process.env.KIM_NWP_DISABLED = '1'
  console.log('[projectamo-dev] KIM NWP disabled — other collection jobs remain enabled.')
}

try {
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
} catch (error) {
  console.error(`[projectamo-dev] ${error.message}`)
  process.exit(1)
}
