import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const artifactPath = path.join(rootDir, 'artifacts', 'verification', 'port-conflict.json')
const ports = [3001, 5173]

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', windowsHide: true })
  } catch (error) {
    return error.stdout || ''
  }
}

function listenersOnWindows(port) {
  const rows = commandOutput('netstat.exe', ['-ano', '-p', 'tcp'])
    .split(/\r?\n/)
    .filter((row) => row.includes('LISTENING') && new RegExp(`:${port}\\s`).test(row))

  return rows.map((row) => {
    const pid = row.trim().split(/\s+/).at(-1)
    const task = commandOutput('tasklist.exe', ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'])
      .split(/\r?\n/)[0] || ''
    return { pid: Number(pid), process: task.replace(/^"|"$/g, '').split('","')[0] || 'unknown' }
  })
}

function listenersOnPosix(port) {
  return commandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'])
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((row) => {
      const [process, pid] = row.trim().split(/\s+/)
      return { pid: Number(pid), process }
    })
}

const conflicts = ports.flatMap((port) => (process.platform === 'win32'
  ? listenersOnWindows(port)
  : listenersOnPosix(port)).map((listener) => ({ port, ...listener })))

await mkdir(path.dirname(artifactPath), { recursive: true })
await writeFile(artifactPath, JSON.stringify({ checkedAt: new Date().toISOString(), conflicts }, null, 2))

if (conflicts.length) {
  console.error(`Playwright contract server ports are already in use. See ${artifactPath}`)
  process.exit(1)
}
