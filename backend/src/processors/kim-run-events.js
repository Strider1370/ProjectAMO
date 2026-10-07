// KIM 회차 진행 기록: runs/<runId>/events.jsonl에 한 줄씩 남긴다.
//
// 수집·저장 검증·계산·게시·정리에서 "왜 이렇게 됐는가"를 나중에 확인하기 위한 기록이다. 회차 폴더와 함께
// 지워진다. 인증키·응답 본문은 넣지 않는다. 파일이 상한을 넘으면 더 쓰지 않고 한 번만 표시한다.
import fs from 'node:fs'
import path from 'node:path'

export const KIM_RUN_EVENTS_FILE = 'events.jsonl'
export const KIM_RUN_EVENTS_MAX_BYTES = 2 * 1024 * 1024

export function appendKimRunEvent(runDir, event, { now = new Date(), maxBytes = KIM_RUN_EVENTS_MAX_BYTES } = {}) {
  if (!runDir) return
  try {
    const file = path.join(runDir, KIM_RUN_EVENTS_FILE)
    let size = 0
    try { size = fs.statSync(file).size } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (size >= maxBytes) return
    const line = JSON.stringify({ at: now.toISOString(), ...event })
    const text = size + line.length + 1 > maxBytes
      ? `${JSON.stringify({ at: now.toISOString(), type: 'events_truncated', maxBytes })}\n`
      : `${line}\n`
    fs.mkdirSync(runDir, { recursive: true })
    fs.appendFileSync(file, text, 'utf8')
  } catch {
    // 기록 실패가 수집·계산을 멈추게 하지 않는다.
  }
}

// kim_nwp/runs/<runId>/... 안의 파일 경로에서 회차 폴더를 찾아 기록한다. 회차 밖 경로는 무시한다.
export function kimRunDirForPath(filePath) {
  const parts = path.resolve(filePath).split(path.sep)
  const index = parts.lastIndexOf('runs')
  if (index < 1 || parts[index - 1] !== 'kim_nwp' || !parts[index + 1]) return null
  return parts.slice(0, index + 2).join(path.sep) || null
}

export function appendKimRunEventForPath(filePath, event, options) {
  appendKimRunEvent(kimRunDirForPath(filePath), event, options)
}

export function readKimRunEvents(runDir) {
  try {
    return fs.readFileSync(path.join(runDir, KIM_RUN_EVENTS_FILE), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}
