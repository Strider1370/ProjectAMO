// 관리자 자료 상태: KIM 확대 영역 최근 회차의 진행률(받기·계산), 예상 끝 시각, 서버 메모리.
// 회차 기록(events.jsonl)·메모리 기록(monitor.jsonl)·실행 잠금(run-<회차>.lock)만 읽는다. 정기 수집과 수동 실행
// (scripts/kim-expanded-run.mjs)이 같은 파일에 쓰므로 둘 다 보인다.
import fs from 'node:fs'
import path from 'node:path'

const RUN_NAME = /^KIMG_NE57_(\d{10})$/
const END_TYPES = new Set(['expanded_published', 'expanded_not_published'])

const readLines = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)] } catch { return [] } })
  } catch { return [] }
}

function lockAlive(file) {
  let lock
  try { lock = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return false }
  if (!Number.isInteger(lock?.pid)) return false
  try { process.kill(lock.pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

const percent = (part, whole) => (whole > 0 ? Math.floor((part / whole) * 100) : 0)

export function readKimExpandedProgress(basePath, { now = Date.now() } = {}) {
  const eaRoot = path.join(basePath, 'kim_nwp_ea')
  let names = []
  try { names = fs.readdirSync(path.join(eaRoot, 'runs')).filter((name) => RUN_NAME.test(name)).sort() } catch {}
  const name = names.at(-1)
  if (!name) return null
  const tmfc = name.match(RUN_NAME)[1]
  const cycle = tmfc.slice(-2)
  const runDir = path.join(eaRoot, 'runs', name)
  const events = readLines(path.join(runDir, 'events.jsonl'))
  const startIndex = events.findLastIndex((event) => event.type === 'expanded_started')
  if (startIndex < 0) return null
  const start = events[startIndex]
  const since = events.slice(startIndex + 1)
  // 이어받기 실행이면 앞 실행에서 받은 시각도 회차 진행에 넣는다(시각별 최신 결과).
  const collected = new Set()
  const computed = new Set()
  for (const event of events) {
    if (event.type === 'expanded_hour_collected' && event.ok) collected.add(event.hf)
    if (event.type === 'expanded_hour_computed') {
      if (event.kim_gktg === 'ok' && event.kim_tropopause === 'ok') computed.add(event.hf)
      else computed.delete(event.hf)
    }
  }
  const end = since.find((event) => END_TYPES.has(event.type) || (event.type === 'kim_expanded' && 'planned' in event)) || null
  const korea = [...events].reverse().find((event) => event.type === 'expanded_korea_crop') || null
  const planned = end?.planned ?? start.hours ?? 0
  const running = !end && lockAlive(path.join(eaRoot, `run-${cycle}.lock`))
  const state = end ? (end.published ? 'published' : 'not_published') : running ? 'running' : 'interrupted'

  // 이번 실행에서 계산을 끝낸 시각 수로 남은 시간을 어림한다(받기와 계산이 겹쳐 계산이 진행 속도를 정한다).
  const startedMs = Date.parse(start.at)
  const doneThisRun = since.filter((event) => event.type === 'expanded_hour_computed').length
  const remaining = Math.max(0, planned - computed.size)
  const etaAt = running && doneThisRun > 0 && Number.isFinite(startedMs)
    ? new Date(now + ((now - startedMs) / doneThisRun) * remaining).toISOString()
    : null

  // 시각별 부가 작업: 지도 파일 미리 만들기(kim_map_responses), 강수 레이어 장(kim_surface_chart). 회차 전체 기준(이어받기 포함).
  const extraHours = (type) => new Set(events.filter((event) => event.type === type).map((event) => event.hf)).size
  const chartFailed = new Set(events.filter((event) => event.type === 'surface_chart_hour_failed').map((event) => event.hf))
  for (const event of events) if (event.type === 'surface_chart_hour') chartFailed.delete(event.hf)
  const chartPublished = [...events].reverse().find((event) => event.type === 'surface_chart_published' || event.type === 'surface_chart_publish_failed') || null
  const samples = readLines(path.join(runDir, 'monitor.jsonl')).filter((row) => row.at >= start.at)
  const last = samples.at(-1) || null
  const available = samples.map((row) => row.availableMiB).filter(Number.isFinite)
  return {
    tmfc,
    cycle,
    state,
    planned,
    collected: collected.size,
    computed: computed.size,
    collectedPct: percent(collected.size, planned),
    computedPct: percent(computed.size, planned),
    lastCollectedHour: collected.size ? Math.max(...collected) : null,
    startedAt: start.at,
    endedAt: end?.at ?? null,
    etaAt,
    stopReason: end?.stopReason ?? null,
    publishedHours: end?.publishedHours ?? null,
    mapFiles: extraHours('map_responses_hour'),
    precipFrames: extraHours('surface_chart_hour'),
    precipFailed: chartFailed.size,
    precipPublished: chartPublished ? (chartPublished.type === 'surface_chart_published' ? chartPublished.frames : 0) : null,
    korea: cycle === '06' ? (korea ? { at: korea.at, saved: Boolean(korea.saved), reason: korea.reason ?? null } : null) : undefined,
    memory: last ? {
      at: last.at,
      availableMiB: last.availableMiB,
      swapUsedMiB: last.swapUsedMiB,
      minAvailableMiB: available.length ? Math.min(...available) : null,
    } : null,
  }
}
