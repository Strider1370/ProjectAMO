import { parentPort, workerData } from 'node:worker_threads'
import { createLocalRuntime } from './local-runtime.js'

const runtime = createLocalRuntime(workerData)
await runtime.initializePlanning().catch(() => {})
parentPort.on('message', async ({ id, operation = 'call', name, input, owner, clear }) => {
  if (clear) { runtime.clearOwner(owner); return }
  try {
    const result = operation === 'registerContext' ? runtime.registerContext(input, owner)
      : operation === 'getResult' ? runtime.getResult(input, owner)
        : await runtime.call(name, input, owner)
    parentPort.postMessage({ id, result })
  } catch {
    parentPort.postMessage({ id, error: 'TOOL_FAILED' })
  }
})
parentPort.postMessage({ ready: true })
