// 확대 영역 회차를 도는 동안 서버 메모리를 기록하고, 남은 메모리가 계속 모자라면 새 예보시각 수집을 멈추게 한다.
//
// 운영 첫 적용(2026-10-09)에 진단 실행 대신 넣었다. 기록은 회차 폴더 monitor.jsonl(10초마다 한 줄)과
// events.jsonl의 expanded_monitor(최댓값)로 남고, scripts/kim-expanded-report.mjs가 읽는다.
// /proc가 없으면(Linux가 아닌 환경) 메모리 값이 비고 멈춤 판단은 하지 않는다.
import fs from 'node:fs'
import path from 'node:path'

import { readMemAvailableBytes } from '../lib/memory-reserve.js'

const MIB = 1048576
export const EXPANDED_MONITOR_INTERVAL_MS = 10_000
// 남은 메모리가 이 값 아래로 연속 LOW_SAMPLES번이면 새 시각을 받지 않는다(받아 둔 시각은 계산·게시한다).
export const EXPANDED_MEMORY_FLOOR_BYTES = 250 * MIB
const LOW_SAMPLES = 3

function readStatus(pid) {
  try { return fs.readFileSync(`/proc/${pid}/status`, 'utf8') } catch { return '' }
}

function rssBytes(pid) {
  const match = readStatus(pid).match(/^VmRSS:\s+(\d+)\s+kB/m)
  return match ? Number(match[1]) * 1024 : 0
}

// pid의 모든 자손(Node 계산 작업, Python).
function descendants(pid) {
  let names
  try { names = fs.readdirSync('/proc') } catch { return [] }
  const parentOf = new Map()
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue
    const ppid = readStatus(name).match(/^PPid:\s+(\d+)/m)?.[1]
    if (ppid) parentOf.set(Number(name), Number(ppid))
  }
  const out = []
  const walk = (parent) => { for (const [child, ppid] of parentOf) if (ppid === parent) { out.push(child); walk(child) } }
  walk(pid)
  return out
}

function swapUsedBytes() {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8')
    const total = Number(text.match(/^SwapTotal:\s+(\d+)/m)?.[1] || 0)
    const free = Number(text.match(/^SwapFree:\s+(\d+)/m)?.[1] || 0)
    return (total - free) * 1024
  } catch { return 0 }
}

export function startExpandedMonitor({
  runDir,
  intervalMs = EXPANDED_MONITOR_INTERVAL_MS,
  floorBytes = EXPANDED_MEMORY_FLOOR_BYTES,
  readAvailable = readMemAvailableBytes,
  sample = () => ({ selfRss: rssBytes(process.pid), childrenRss: descendants(process.pid).reduce((sum, pid) => sum + rssBytes(pid), 0), swapUsed: swapUsedBytes() }),
  now = Date.now,
} = {}) {
  const file = path.join(runDir, 'monitor.jsonl')
  const peak = { minAvailableMiB: null, maxSelfRssMiB: 0, maxChildrenRssMiB: 0, maxSwapUsedMiB: 0, samples: 0, lowSamples: 0 }
  let low = 0
  const tick = () => {
    const available = readAvailable()
    const { selfRss, childrenRss, swapUsed } = sample()
    const row = { at: new Date(now()).toISOString(),
      availableMiB: Number.isFinite(available) ? Math.round(available / MIB) : null,
      selfRssMiB: Math.round(selfRss / MIB), childrenRssMiB: Math.round(childrenRss / MIB), swapUsedMiB: Math.round(swapUsed / MIB) }
    peak.samples++
    if (row.availableMiB !== null) peak.minAvailableMiB = Math.min(peak.minAvailableMiB ?? Infinity, row.availableMiB)
    peak.maxSelfRssMiB = Math.max(peak.maxSelfRssMiB, row.selfRssMiB)
    peak.maxChildrenRssMiB = Math.max(peak.maxChildrenRssMiB, row.childrenRssMiB)
    peak.maxSwapUsedMiB = Math.max(peak.maxSwapUsedMiB, row.swapUsedMiB)
    if (available < floorBytes) { low++; peak.lowSamples++ } else low = 0
    try {
      fs.mkdirSync(runDir, { recursive: true })
      fs.appendFileSync(file, `${JSON.stringify(row)}\n`)
    } catch {}
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return {
    // 새 시각을 받기 전에 묻는다. 멈춰야 하면 이유 문자열.
    stopReason: () => (low >= LOW_SAMPLES ? 'memory_reserve' : null),
    tick,
    stop() { clearInterval(timer); return { ...peak } },
  }
}
