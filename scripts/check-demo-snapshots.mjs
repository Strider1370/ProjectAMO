// 시연 스냅샷 점검(읽기 전용). 배포 때마다 돌려, 업데이트로 스냅샷이 깨졌으면 발표 당일이 아니라 배포한 날 알게 한다.
//   운영 서버: cd /opt/projectamo/current && node scripts/check-demo-snapshots.mjs [--data /opt/projectamo/shared/data]
// 준비가 안 된 스냅샷이 있으면 종료 코드 1(배포는 경고만 하고 계속한다).
import path from 'node:path'
import { parseArgs } from 'node:util'

import config from '../backend/src/config.js'
import { inspectSnapshot, listSnapshots } from '../backend/src/dev/snapshot-store.js'

const { values: args } = parseArgs({ options: { data: { type: 'string' } } })
const root = path.resolve(args.data || config.storage.base_path)
const kst = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '-')

const snapshots = listSnapshots(root)
if (!snapshots.length) console.log('[demo] 저장된 시연 스냅샷 없음')
let failed = 0
for (const snapshot of snapshots) {
  const report = inspectSnapshot(root, snapshot.name)
  const hours = report.summaries.kim_nwp_ea?.hours
  const kim = hours?.length ? `KIM 확대 +${hours[0]}~+${hours.at(-1)}h` : 'KIM 한반도만'
  const size = Number.isFinite(snapshot.bytes) ? `${(snapshot.bytes / 1e9).toFixed(2)} GB` : '크기 모름'
  console.log(`[demo] ${snapshot.name}: ${report.ready ? '준비됨' : '준비 안 됨'} · 기준 ${kst(report.referenceTime)} KST · ${size} · ${kim}`)
  for (const blocker of report.blockers) console.log(`[demo]   막힘: ${blocker}`)
  for (const warning of report.warnings) console.log(`[demo]   주의: ${warning}`)
  if (!report.ready) failed += 1
}
process.exitCode = failed ? 1 : 0
