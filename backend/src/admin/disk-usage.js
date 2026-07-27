import fs from 'node:fs'
import path from 'node:path'

// 관리자 콘솔: shared/data 아래 최상위 폴더별 용량. 재귀로 파일 크기를 다 더하는 건 수만 개
// 타일 파일이 있는 폴더(레이더 등)에선 몇 초 걸릴 수 있어, 매 폴링(5초)마다 다시 재지 않고
// 캐시를 둔다 — 디스크 용량은 5분 안에 크게 안 변한다.
const CACHE_TTL_MS = 5 * 60 * 1000
let cache = { at: 0, entries: [] }

function dirSize(dir) {
  let total = 0
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return 0 }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSize(full)
    else { try { total += fs.statSync(full).size } catch { /* 경합 삭제 등 무해 */ } }
  }
  return total
}

export function readDiskUsage(basePath, { force = false } = {}) {
  if (!force && Date.now() - cache.at < CACHE_TTL_MS) return cache.entries

  let names
  try { names = fs.readdirSync(basePath, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) } catch { names = [] }
  const entries = names
    .map((name) => ({ name, bytes: dirSize(path.join(basePath, name)) }))
    .sort((a, b) => b.bytes - a.bytes)

  cache = { at: Date.now(), entries }
  return entries
}

export default { readDiskUsage }
