// KIM 지도 레이어의 이웃 장 미리 받기. 지금 보는 장이 다 뜨면 다음·이전 시각과 위·아래 고도의 이진 파일을
// 하나씩 받아 브라우저 HTTP 캐시에 넣어 둔다(풀지 않는다 — 확대 영역 한 장을 풀면 수 MB라 메모리 캐시에서
// 지금 장이 밀려난다). 넘겼을 때는 캐시에서 바로 읽혀 푸는 시간만 든다. 기상청 날씨누리 지도가 다음 시각 조각을
// 미리 받는 방식과 같다(2026-10-09 확인).
//
// 이진 파일(/data/.../map-bin/...)만 미리 받는다. 레이어마다 가장 최근 요청한 이웃만 남기고(넘기면 이전 목록은 버림),
// 한 번에 하나씩 낮은 우선순위로 받는다. 데이터 절약 모드에서는 받지 않는다.
import { kimMapBinaryName, kimMapBinarySupported, kimMapBinaryUrl } from '../../../api/kimMapBinary.js'

const DONE_LIMIT = 400
const done = new Set()
let queue = []
let running = false

function remember(url) {
  done.add(url)
  if (done.size > DONE_LIMIT) done.delete(done.values().next().value)
}

function saveData() {
  return typeof navigator !== 'undefined' && navigator.connection?.saveData === true
}

// 지금 장의 이웃(다음·이전 시각, 위·아래 고도). canRequest(index, selection)로 있는 장만 고른다.
export function kimNeighborSelections({ index, selection, canRequest }) {
  if (!index || !selection) return []
  const hours = [...new Set((index.times || []).map((time) => Number(time.hf)).filter(Number.isFinite))].sort((a, b) => a - b)
  const levels = (index.levels || []).map((level) => level.id)
  const hourAt = hours.indexOf(Number(selection.hf))
  const levelAt = levels.indexOf(selection.level)
  const candidates = [
    hourAt >= 0 && hourAt + 1 < hours.length ? { ...selection, hf: hours[hourAt + 1] } : null,
    hourAt > 0 ? { ...selection, hf: hours[hourAt - 1] } : null,
    levelAt >= 0 && levelAt + 1 < levels.length ? { ...selection, level: levels[levelAt + 1] } : null,
    levelAt > 0 ? { ...selection, level: levels[levelAt - 1] } : null,
  ]
  return candidates.filter((candidate) => candidate && canRequest(index, candidate))
}

async function pump(fetchImpl) {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const { url } = queue.shift()
      if (done.has(url)) continue
      remember(url)
      try {
        const response = await fetchImpl(url, { priority: 'low' })
        if (response.ok) await response.arrayBuffer()
        else done.delete(url)
      } catch {
        done.delete(url)
      }
    }
  } finally {
    running = false
  }
}

// type: wind·temp·cloud·icing·gktg. revisionFor(selection)은 GKTG 판(이진 파일 이름에 들어감).
export function prefetchKimNeighbors({ type, index, selection, canRequest, revisionFor = null, fetchImpl = globalThis.fetch }) {
  if (!selection || selection.revision && type !== 'gktg') return []
  if (!kimMapBinarySupported() || saveData() || typeof fetchImpl !== 'function') return []
  // 지금 장은 레이어 훅이 이미 받았다. 다음 장으로 넘긴 뒤 "이전" 이웃으로 다시 받지 않게 기록한다.
  const currentRevision = type === 'gktg' ? revisionFor?.(selection) : null
  if (type !== 'gktg' || currentRevision) remember(kimMapBinaryUrl({ ...selection, name: kimMapBinaryName(type, currentRevision) }))
  const urls = []
  for (const neighbor of kimNeighborSelections({ index, selection, canRequest })) {
    const revision = type === 'gktg' ? revisionFor?.(neighbor) : null
    if (type === 'gktg' && !(revision && /^[a-z0-9]+$/i.test(revision))) continue
    const url = kimMapBinaryUrl({ ...neighbor, name: kimMapBinaryName(type, revision) })
    if (!done.has(url)) urls.push(url)
  }
  queue = [...queue.filter((item) => item.type !== type), ...urls.map((url) => ({ type, url }))]
  pump(fetchImpl)
  return urls
}

export function resetKimNeighborPrefetch() {
  done.clear()
  queue = []
}
