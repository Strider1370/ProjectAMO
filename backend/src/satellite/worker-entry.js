import { fileURLToPath } from 'node:url'

import { assertSatelliteJob, failureMessage, successMessage } from './worker-protocol.js'

export async function runWorkerEntry({ job, runJob, send, disconnect }) {
  try {
    const safeJob = assertSatelliteJob(job)
    const work = await runJob(safeJob)
    await send(successMessage(work))
    disconnect()
    return 0
  } catch (error) {
    await send(failureMessage(error))
    disconnect()
    return 1
  }
}

function runProcessWorker() {
  process.once('message', async (job) => {
    const exitCode = await runWorkerEntry({
      job,
      runJob: async (safeJob) => (await import('./worker-jobs.js')).runSatelliteJob(safeJob),
      send: (message) => new Promise((resolve, reject) => {
        if (typeof process.send !== 'function') return reject(new Error('worker IPC unavailable'))
        process.send(message, (error) => (error ? reject(error) : resolve()))
      }),
      disconnect: () => process.disconnect?.(),
    })
    process.exit(exitCode)
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runProcessWorker()
