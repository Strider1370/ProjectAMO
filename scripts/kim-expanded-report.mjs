// KIM 확대 영역 회차 보고(읽기 전용). 회차 진행 기록(events.jsonl)과 메모리 기록(monitor.jsonl)을 요약한다.
//   운영 서버: cd /opt/projectamo/current && node scripts/kim-expanded-report.mjs --data /opt/projectamo/shared/data [--tmfc 2026100906] [--memory]
// --tmfc가 없으면 확대 영역에 남아 있는 회차를 모두 보고한다. --memory는 메모리 기록을 10분 간격으로 줄여 함께 보인다.
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { data: { type: 'string' }, tmfc: { type: 'string' }, memory: { type: 'boolean' } } })
const root = path.resolve(args.data || process.env.DATA_PATH || '')
const eaRoot = path.join(root, 'kim_nwp_ea')
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
const readLines = (file) => { try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) } catch { return [] } }
const kst = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') : '-')
const sizeOf = (dir) => {
  let total = 0
  const walk = d => { for (const entry of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, entry.name); if (entry.isDirectory()) walk(p); else try { total += fs.statSync(p).size } catch {} } }
  try { walk(dir) } catch {}
  return total
}

const latest = readJson(path.join(eaRoot, 'latest.json'))
const disabled = readJson(path.join(eaRoot, 'disabled.json'))
const kr = readJson(path.join(root, 'kim_nwp', 'latest.json'))
const stat = fs.statfsSync(root)
console.log(`확대 영역 게시: ${latest ? `${latest.latestRun} (${latest.hours?.length ?? '?'}시각, ${kst(latest.updated_at)} KST)` : '없음'}`)
console.log(`한반도 게시: ${kr ? `${kr.latestRun}${kr.source ? ` [${kr.source}]` : ''} (${kst(kr.updated_at)} KST)` : '없음'}`)
if (disabled) console.log(`자동 중지: ${disabled.dateKst} ${disabled.reason}`)
console.log(`디스크 여유 ${(stat.bavail * stat.bsize / 1e9).toFixed(1)} GB, 확대 영역 ${(sizeOf(eaRoot) / 1e9).toFixed(2)} GB, 한반도 ${(sizeOf(path.join(root, 'kim_nwp')) / 1e9).toFixed(2)} GB`)

let runs = []
try { runs = fs.readdirSync(path.join(eaRoot, 'runs')).filter(name => /^KIMG_NE57_\d{10}$/.test(name)).sort() } catch {}
if (args.tmfc) runs = runs.filter(name => name.endsWith(args.tmfc))
if (!runs.length) console.log('\n회차 기록 없음')

for (const run of runs) {
  const runDir = path.join(eaRoot, 'runs', run)
  const events = readLines(path.join(runDir, 'events.jsonl'))
  const starts = events.filter(e => e.type === 'expanded_started')
  const collected = events.filter(e => e.type === 'expanded_hour_collected')
  const computed = events.filter(e => e.type === 'expanded_hour_computed')
  const ends = events.filter(e => e.type === 'expanded_published' || e.type === 'expanded_not_published' || (e.type === 'kim_expanded' && 'planned' in e))
  const crops = events.filter(e => e.type === 'expanded_korea_crop')
  const monitors = events.filter(e => e.type === 'expanded_monitor')
  console.log(`\n== ${run.slice(-10)} (${(sizeOf(runDir) / 1e9).toFixed(2)} GB)`)
  for (const [i, start] of starts.entries()) {
    const end = ends.find(e => e.at >= start.at && (!starts[i + 1] || e.at < starts[i + 1].at))
    const memory = monitors.find(e => e.at >= start.at && (!starts[i + 1] || e.at < starts[i + 1].at))
    console.log(`실행 ${i + 1}: 시작 ${kst(start.at)}, 끝 ${kst(end?.at)} KST — ${end ? `${end.published ? `게시 ${end.publishedHours}시각` : '게시 안 함'}, 받기 ${end.downloaded}/${end.planned}, 계산 ${end.computed}, 마지막 +${end.lastHour ?? '-'}h(기준 +${end.minHour}h)${end.stopReason ? `, 중단 ${end.stopReason}` : ''}` : '진행 중이거나 끊김(재시작 등)'}`)
    if (memory) console.log(`  메모리: 남은 최소 ${memory.minAvailableMiB ?? '-'} MiB, 백엔드 최대 ${memory.maxSelfRssMiB} MiB, 계산 자식 최대 ${memory.maxChildrenRssMiB} MiB, 스왑 최대 ${memory.maxSwapUsedMiB} MiB, 부족 표본 ${memory.lowSamples}/${memory.samples}`)
    for (const failure of (end?.failures || []).slice(0, 5)) console.log(`  실패: ${JSON.stringify(failure).slice(0, 200)}`)
  }
  for (const crop of crops) console.log(`한반도 잘라내기: ${kst(crop.at)} KST ${crop.saved ? `게시(${crop.grids}개)` : `안 함(${crop.reason})`}`)
  const ms = (list) => list.map(e => e.ms).filter(Number.isFinite)
  const avg = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length / 1000) : '-')
  const max = (list) => (list.length ? Math.round(Math.max(...list) / 1000) : '-')
  console.log(`시각별: 받기 ${collected.length}건(평균 ${avg(ms(collected))}초, 최대 ${max(ms(collected))}초, 실패 ${collected.filter(e => !e.ok).length}), 계산 ${computed.length}건(평균 ${avg(ms(computed))}초, 최대 ${max(ms(computed))}초, 실패 ${computed.filter(e => e.kim_gktg !== 'ok' || e.kim_tropopause !== 'ok').length})`)
  for (const event of [...collected.filter(e => !e.ok), ...computed.filter(e => e.kim_gktg !== 'ok' || e.kim_tropopause !== 'ok')].slice(0, 5)) {
    console.log(`  +${event.hf}h: ${JSON.stringify(event).slice(0, 200)}`)
  }
  if (args.memory) {
    let last = 0
    for (const row of readLines(path.join(runDir, 'monitor.jsonl'))) {
      const at = Date.parse(row.at)
      if (at - last < 600_000) continue
      last = at
      console.log(`  ${kst(row.at)} 남은 ${row.availableMiB} MiB, 백엔드 ${row.selfRssMiB}, 자식 ${row.childrenRssMiB}, 스왑 ${row.swapUsedMiB}`)
    }
  }
}
