import fs from 'node:fs'
import path from 'node:path'

// 관리자 콘솔: 재시작 횟수·가동시간. PM2 데몬에 붙지 않고(별도 패키지·소켓 권한 불필요) 우리가 직접
// 센다 — 서버 프로세스가 뜰 때마다 1 증가시켜 shared/data에 남긴다. pm2가 아니어도(로컬 node 실행 등)
// 똑같이 동작한다. "왜 재시작됐는지"는 모르지만 "얼마나 자주 재시작되는지"는 이걸로 충분히 잡힌다.
const FILE_NAME = 'process-health.json'

// recentBoots: 최근 부팅 시각 몇 개. 누적 횟수만으로는 "한 시간에 5번" 같은 판단을 못 한다.
const MAX_RECENT_BOOTS = 20
let state = { bootCount: 0, firstBootAt: null, lastBootAt: null, recentBoots: [] }

// 프로세스 시작 시 한 번만 부를 것(server.js). 호출할 때마다 카운트가 올라간다.
export function recordBoot(basePath) {
  const filePath = path.join(basePath, FILE_NAME)
  let prev = {}
  try { prev = JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { /* 최초 실행 */ }
  const now = new Date().toISOString()
  state = {
    bootCount: (prev.bootCount || 0) + 1,
    firstBootAt: prev.firstBootAt || now,
    lastBootAt: now,
    recentBoots: [now, ...(Array.isArray(prev.recentBoots) ? prev.recentBoots : [])].slice(0, MAX_RECENT_BOOTS),
  }
  try { fs.writeFileSync(filePath, JSON.stringify(state, null, 2)) } catch { /* 디스크 문제여도 메모리 값은 유효 */ }
  return state
}

export function processHealth() {
  const mem = process.memoryUsage()
  return {
    bootCount: state.bootCount,
    firstBootAt: state.firstBootAt,
    lastBootAt: state.lastBootAt,
    recentBoots: state.recentBoots,
    uptimeSec: Math.round(process.uptime()),
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
  }
}

export default { recordBoot, processHealth }
