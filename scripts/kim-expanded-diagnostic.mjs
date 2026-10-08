// KIM 확대 영역 한 회차 진단 실행(4단계 실측). 운영 백엔드와 운영 데이터 폴더를 쓰지 않는다.
//
//   운영 서버: 브랜치 코드를 별도 폴더에 두고, 별도 DATA_PATH로 실행한다. 대용량 키는 환경변수로만 받는다(파일에 쓰지 않는다).
//   DATA_PATH=~/kim-ea-diag/data KIM_STORE_FORMAT=nc KIM_GKTG_PYTHON=/opt/projectamo/shared/venvs/kim-gktg/bin/python \
//     NUMBA_CACHE_DIR=~/kim-ea-diag/numba KMA_BULK_AUTH_KEY=... node scripts/kim-expanded-diagnostic.mjs --tmfc 2026100906 [--hours 0-12] [--no-publish]
//
// 5초마다 서버 남은 메모리(MemAvailable), 이 프로세스·자식(Node·Python) 메모리, 운영 사이트 health, 디스크를 기록하고
// 남은 메모리가 300 MiB 아래로 3번 연속, health가 2번 연속 실패, 디스크 여유가 3 GiB 아래면 새 시각 수집을 멈춘다.
// 기록: <DATA_PATH>/../diagnostic/{samples.jsonl,progress.jsonl,summary.json}
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { tmfc: { type: 'string' }, hours: { type: 'string' }, 'no-publish': { type: 'boolean' }, health: { type: 'string' }, crop: { type: 'boolean' } } })
const dataPath = path.resolve(process.env.DATA_PATH || '')
if (!process.env.DATA_PATH || dataPath.startsWith('/opt/projectamo')) throw new Error('진단은 운영 데이터 폴더 밖의 DATA_PATH로만 실행한다')
if (!/^\d{8}(00|06)$/.test(args.tmfc || '')) throw new Error('--tmfc YYYYMMDD00|06')
if (!process.env.KMA_BULK_AUTH_KEY) throw new Error('KMA_BULK_AUTH_KEY 환경변수가 필요하다')

const outDir = path.join(path.dirname(dataPath), 'diagnostic')
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(dataPath, { recursive: true })
const write = (name, value) => fs.appendFileSync(path.join(outDir, name), `${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`)

const config = (await import('../backend/src/config.js')).default
const { collectExpandedRun, expandedCycle } = await import('../backend/src/processors/kim-expanded-collector.js')
const { publishKoreaFromExpanded } = await import('../backend/src/processors/kim-korea-crop.js')
const { hours: cycleHours } = expandedCycle(args.tmfc)
const hours = args.hours
  ? cycleHours.filter(hf => { const [a, b] = args.hours.split('-').map(Number); return hf >= a && hf <= (b ?? a) })
  : cycleHours

const healthUrl = args.health || 'http://127.0.0.1:3001/api/health'
const mib = bytes => Math.round(bytes / 1048576)
const memAvailable = () => Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/)[1]) * 1024
const descendants = (pid) => {
  const children = []
  for (const name of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try { if (fs.readFileSync(`/proc/${name}/stat`, 'utf8').split(') ')[1].split(' ')[1] === String(pid)) children.push(Number(name)) } catch {}
  }
  return children.flatMap(child => [child, ...descendants(child)])
}
const rss = pid => { try { return Number(fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) * 1024 } catch { return 0 } }
const du = (dir) => {
  let total = 0
  const walk = d => { for (const entry of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, entry.name); if (entry.isDirectory()) walk(p); else try { total += fs.statSync(p).size } catch {} } }
  try { walk(dir) } catch {}
  return total
}

const controller = new AbortController()
const peak = { childrenRssMiB: 0, selfRssMiB: 0, minAvailableMiB: Infinity, maxHealthSeconds: 0, maxDiskMiB: 0 }
let lowMemory = 0
let healthFails = 0
let stopped = null
const stop = (reason) => { if (stopped) return; stopped = reason; write('progress.jsonl', { type: 'guard_stop', reason }); controller.abort(new Error(reason)) }

const sampler = setInterval(async () => {
  const available = memAvailable()
  const self = rss(process.pid)
  const kids = descendants(process.pid).reduce((sum, pid) => sum + rss(pid), 0)
  const started = Date.now()
  let health = 0
  try { health = (await fetch(healthUrl, { signal: AbortSignal.timeout(5000) })).status } catch {}
  const healthSeconds = (Date.now() - started) / 1000
  const statfs = fs.statfsSync(dataPath)
  const freeMiB = mib(statfs.bavail * statfs.bsize)
  const diskMiB = mib(du(path.join(dataPath, 'kim_nwp_ea')))
  Object.assign(peak, { childrenRssMiB: Math.max(peak.childrenRssMiB, mib(kids)), selfRssMiB: Math.max(peak.selfRssMiB, mib(self)),
    minAvailableMiB: Math.min(peak.minAvailableMiB, mib(available)), maxHealthSeconds: Math.max(peak.maxHealthSeconds, healthSeconds), maxDiskMiB: Math.max(peak.maxDiskMiB, diskMiB) })
  write('samples.jsonl', { availableMiB: mib(available), selfRssMiB: mib(self), childrenRssMiB: mib(kids), health, healthSeconds, diskMiB, freeMiB })
  lowMemory = available < 300 * 1048576 ? lowMemory + 1 : 0
  healthFails = health === 200 ? 0 : healthFails + 1
  if (lowMemory >= 3) stop('memory_reserve')
  else if (healthFails >= 2) stop('site_health')
  else if (freeMiB < 3 * 1024) stop('disk_reserve')
}, 5000)

const startedAt = Date.now()
let cropped = null
write('progress.jsonl', { type: 'start', tmfc: args.tmfc, hours, publish: !args['no-publish'], concurrency: config.kim_expanded.concurrency })
let result
try {
  result = await collectExpandedRun({ tmfc: args.tmfc, hours, signal: controller.signal, publish: !args['no-publish'],
    onProgress: event => { write('progress.jsonl', event); console.log(JSON.stringify(event)) },
    // --crop: 06 UTC +0~12h가 모이면 한반도 회차를 잘라 이 DATA_PATH의 kim_nwp/에 게시한다(운영 한반도 06 UTC와 비교용).
    onHourDownloaded: async ({ downloaded }) => {
      if (!args.crop || cropped || !config.kim_nwp.forecast_hours.every(hf => downloaded.includes(hf))) return
      const at = Date.now()
      cropped = publishKoreaFromExpanded({ tmfc: args.tmfc, hours: config.kim_nwp.forecast_hours })
      write('progress.jsonl', { type: 'korea_cropped', ms: Date.now() - at, ...cropped })
    } })
} catch (error) {
  result = { error: String(error.code || error.message).slice(0, 300) }
} finally {
  clearInterval(sampler)
}
const summary = { tmfc: args.tmfc, ...result, korea: cropped, guardStop: stopped, seconds: Math.round((Date.now() - startedAt) / 1000), peak, diskMiB: mib(du(path.join(dataPath, 'kim_nwp_ea'))) }
fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify(summary))
