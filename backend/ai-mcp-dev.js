import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpHttpApp } from './src/ai/mcp.js'
import { createWorkerExecutor } from './src/ai/worker-executor.js'

const backendRoot = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.AMO_AI_MCP_PORT ?? 3101)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid AMO_AI_MCP_PORT')
const dataRoot = path.resolve(process.env.AMO_AI_DATA_ROOT ?? path.join(backendRoot, 'data'))
const fixture = process.argv.includes('--fixture')
  ? JSON.parse(fs.readFileSync(path.join(backendRoot, 'fixtures/ai/gimpo-jeju.json'), 'utf8'))
  : null
const executor = createWorkerExecutor({ dataRoot, fixture })
const mcp = createMcpHttpApp({ executor, fixture,
  audit: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
})
const server = http.createServer(mcp.app)
server.requestTimeout = 30_000
server.headersTimeout = 10_000
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`ProjectAMO MCP http://127.0.0.1:${server.address().port}/mcp (${fixture ? `fixture ${fixture.id}` : 'live saved snapshots'}; read-only)\n`)
})
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await mcp.close()
  server.closeAllConnections()
  server.close()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
