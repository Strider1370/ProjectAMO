import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'
import { STOP_GRACE_MS, stopProcess } from './projectamo-dev-lifecycle.mjs'

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const launcher = readFileSync(new URL('./projectamo-dev.mjs', import.meta.url), 'utf8')
const lifecycle = readFileSync(new URL('./projectamo-dev-lifecycle.mjs', import.meta.url), 'utf8')

test('registers the managed terminal signage capture command', () => {
  assert.equal(
    rootPackage.scripts['dev:terminal-capture'],
    'node scripts/projectamo-dev.mjs terminal-signage-capture',
  )
  const allowedCommands = launcher.match(/if \(!\[([^\]]+)]\.includes\(command\)\)/)?.[1]
  assert.ok(allowedCommands, 'launcher must declare an allowed command list')
  assert.match(allowedCommands, /'terminal-signage-capture'/)
  assert.match(rootPackage.scripts.test, /node --test scripts\/\*\.test\.mjs/)
})

test('signals terminate the active capture task before server cleanup', () => {
  assert.match(launcher, /let activeTaskChild = null/)
  assert.match(launcher, /let shutdownRequested = false/)
  assert.match(launcher, /function terminateManagedLifecycle\(\) \{\s+shutdownRequested = true/s)
  assert.match(launcher, /process\.once\('SIGINT', terminateManagedLifecycle\)/)
  assert.match(launcher, /process\.once\('SIGTERM', terminateManagedLifecycle\)/)
  assert.match(launcher, /async function withServers[\s\S]*?if \(shutdownRequested\) throw new Error\('managed lifecycle cancelled'\)/s)
  assert.match(launcher, /if \(shutdownRequested\) throw new Error\('managed lifecycle cancelled'\)\s+await task\(\)/)
  assert.match(lifecycle, /function hasExited\(child\) \{\s+return child\.exitCode !== null \|\| child\.signalCode !== null/s)
  assert.match(launcher, /async function runNpm[\s\S]*?activeTaskChild = child/s)
  assert.match(launcher, /async function runNode[\s\S]*?activeTaskChild = child[\s\S]*?finally \{\s+activeTaskChild = null/s)
  assert.match(launcher, /import \{ stopProcess \} from '\.\/projectamo-dev-lifecycle\.mjs'/)
  assert.match(launcher, /finally \{\s+await stopProcess\(servers\.frontend\)\s+await stopProcess\(servers\.backend\)/s)
})

test('stopProcess escalates a signal-ignoring detached child without hanging', async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  await once(child, 'spawn')
  await once(child.stdout, 'data')

  await stopProcess({ child }, { graceMs: 25 })

  assert.equal(child.exitCode, null)
  assert.equal(child.signalCode, 'SIGKILL')
  assert.ok(STOP_GRACE_MS > 0)
})

test('SIGTERM child records signalCode while exitCode remains null', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
  await once(child, 'spawn')
  child.kill('SIGTERM')
  await once(child, 'exit')
  assert.equal(child.exitCode, null)
  assert.equal(child.signalCode, 'SIGTERM')
})

test('runs terminal signage capture inside managed server cleanup', () => {
  assert.match(
    launcher,
    /if \(command === 'terminal-signage-capture'\) \{\s+await withServers\(async \(\) => \{\s+await runNode\('terminal signage capture', \[path\.join\(rootDir, 'frontend', 'scripts', 'terminal-signage-capture\.mjs'\)\], \{\s+PROJECTAMO_URL: appUrl,\s+\}\)\s+\}\)\s+\}/s,
  )
  assert.doesNotMatch(launcher, /\['exec', '--prefix', 'frontend', 'node'/)
  assert.match(launcher, /async function withServers\(task\) \{[\s\S]*?finally \{[\s\S]*?stopProcess\(servers\.frontend\)[\s\S]*?stopProcess\(servers\.backend\)/)
})
