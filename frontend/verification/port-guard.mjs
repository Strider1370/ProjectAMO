import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const artifactPath = path.join(rootDir, 'artifacts', 'verification', 'port-conflict.json')
const ports = [3001, 5173]

function commandOutput(command, args) {
  try {
    return { output: execFileSync(command, args, { encoding: 'utf8' }), missing: false }
  } catch (error) {
    return { output: error.stdout || '', missing: error.code === 'ENOENT' }
  }
}

function listenersViaLsof(port) {
  const { output, missing } = commandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'])
  if (missing) {
    return null
  }

  return output
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((row) => {
      const [process, pid] = row.trim().split(/\s+/)
      return { pid: Number(pid), process }
    })
}

function listenersViaSs(port) {
  const { output } = commandOutput('ss', ['-ltnp'])
  return output
    .split(/\r?\n/)
    .filter((row) => new RegExp(`:${port}\\s`).test(row))
    .map((row) => ({
      pid: Number(row.match(/pid=(\d+)/)?.[1]) || null,
      process: row.match(/users:\(\("([^"]+)"/)?.[1] || 'unknown',
    }))
}

function listeners(port) {
  return listenersViaLsof(port) ?? listenersViaSs(port)
}

const conflicts = ports.flatMap((port) => listeners(port).map((listener) => ({ port, ...listener })))

await mkdir(path.dirname(artifactPath), { recursive: true })
await writeFile(artifactPath, JSON.stringify({ checkedAt: new Date().toISOString(), conflicts }, null, 2))

if (conflicts.length) {
  console.error(`Playwright contract server ports are already in use. See ${artifactPath}`)
  process.exit(1)
}
