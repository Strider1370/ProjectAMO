import { fileURLToPath } from 'node:url'

import { assertSatelliteJob, failureMessage, successMessage } from './worker-protocol.js'
import { createUsageMeter } from './usage-meter.js'

// meter를 주면 워커가 쓴 API 허브 바이트를 재서 결과에 실어 보낸다. 기록은 부모가 한다 —
// 사용량 장부는 파일을 통째로 덮어쓰는 구조라 두 프로세스가 같이 쓰면 서로를 지운다.
// ponytail: 워커가 도중에 죽으면 그 판의 사용량은 못 싣는다. 흔치 않고 다음 판에 다시 세므로
// 지금은 감수한다. 크래시 중 사용량까지 세려면 중간 보고 메시지가 따로 필요하다.
export async function runWorkerEntry({ job, runJob, send, disconnect, meter = null }) {
  try {
    const safeJob = assertSatelliteJob(job)
    const work = await runJob(safeJob)
    const apiHubUsage = meter ? meter.take() : []
    await send(successMessage(apiHubUsage.length ? { ...work, apiHubUsage } : work))
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
  // 이 프로세스의 모든 apihub 호출을 재도록 전역 fetch를 감싼다. 부모의 가드
  // (installApiHubFetchGuard)는 부모 프로세스에만 걸려 있어 여기까지 오지 않는다 —
  // 그래서 위성이 아무리 받아와도 어드민 API 사용량에 한 건도 안 잡혔다.
  const meter = createUsageMeter({ fetchImpl: globalThis.fetch })
  globalThis.fetch = meter.fetch

  process.once('message', async (job) => {
    const exitCode = await runWorkerEntry({
      job,
      meter,
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
