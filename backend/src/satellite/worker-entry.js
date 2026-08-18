import { fileURLToPath } from 'node:url'

import { assertSatelliteJob, failureMessage, successMessage } from './worker-protocol.js'

export async function runWorkerEntry({ job, runJob, send, disconnect }) {
  try {
    const safeJob = assertSatelliteJob(job)
    const work = await runJob(safeJob)
    await send(successMessage(work))
  } catch (error) {
    try {
      await send(failureMessage(error))
    } catch {
      // The parent already closed IPC; process shutdown still releases worker memory.
    }
    disconnect()
    return 1
  }
  disconnect()
  return 0
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
