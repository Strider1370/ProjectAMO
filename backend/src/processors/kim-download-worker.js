// 확대 영역 다운로드 자식 프로세스. 층 하나 받기(collectKimNwpTask)의 무거운 부분 — 받은 원문 파싱, 격자 만들기,
// 층 문서 압축 저장, 목록용 지문 — 을 백엔드 밖에서 한다. 백엔드는 사이트 요청을 받는 하나뿐인 창구라,
// 이 일을 거기서 하면 회차 동안 가벼운 API도 1~4초씩 밀렸다(2026-10-11 운영 측정).
// 기상청 요청은 부모(백엔드)에 맡긴다(대용량 키·사용량 장부·재시도·취소는 부모 한 곳에서만 다룬다).
import path from 'node:path'
import { collectKimNwpTask, setKimGridFetcher } from './kim-surface-wind-processor.js'
import { buildKimNwpIndexEntry, KIM_NWP_MODEL } from './kim-nwp-model.js'
import { readKimNwpGridSafe, readKimNwpGridVariableNames, resolveKimNwpGridPath, writeKimNwpGrid } from './kim-nwp-store.js'
import { errorPayload, restoreError } from './kim-derived-worker-entry.js'

const send = (message) => { try { process.send(message) } catch {} }

let nextFetch = 0
const fetches = new Map()

setKimGridFetcher(({ signal: _signal, ...params }) => new Promise((resolve, reject) => {
  const id = ++nextFetch
  fetches.set(id, { resolve, reject })
  send({ type: 'fetch', id, params })
}))

// 부모가 죽거나 연결을 끊으면 따라 끝난다(남은 자식이 메모리를 붙잡지 않게).
process.on('disconnect', () => process.exit(0))

process.on('message', async (message) => {
  if (message?.type === 'fetch_result') {
    const pending = fetches.get(message.id)
    fetches.delete(message.id)
    if (!pending) return
    if (message.error) pending.reject(restoreError(message.error))
    else pending.resolve(message.text)
    return
  }
  if (message?.type !== 'task') return
  const { id, task, root } = message
  try {
    const { grid, lastError, reused } = await collectKimNwpTask({
      task,
      readExistingGrid: ({ level, tmfc, hf, domain }) => readKimNwpGridSafe({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id, domain }),
      readExistingVariables: ({ level, tmfc, hf, domain }) => readKimNwpGridVariableNames({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: level.id, domain }),
      writeGrid: (built) => writeKimNwpGrid({ root, grid: built, domain: task.domain }),
    })
    const file = resolveKimNwpGridPath({ root, model: grid.model, tmfc: task.tmfc, hf: task.hf, levelId: grid.level.id, domain: task.domain })
    const entry = buildKimNwpIndexEntry(grid, path.relative(root, file).replace(/\\/g, '/'))
    send({ type: 'task_result', id, entry, reused: Boolean(reused), lastError: lastError ? errorPayload(lastError) : null })
  } catch (error) {
    send({ type: 'task_result', id, error: errorPayload(error) })
  }
})
