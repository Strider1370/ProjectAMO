// 관리자 콘솔 계약용 계정 준비.
//
// 계약은 로그인한 뒤에야 화면을 볼 수 있는데 검증용 DB에는 계정이 없다. 이 스크립트를 한 번
// 돌려 관리자와 "승인 대기" 사용자를 하나씩 만든다 — 대기자가 있어야 계정 관리 화면의
// 배지와 승인 버튼이 실제로 그려지는지 볼 수 있다.
//
// 백엔드 모듈을 직접 부른다(CLI를 자식 프로세스로 돌리지 않고) — 실패했을 때 원인이
// 그대로 보이고, 이미 있는 계정을 건너뛰는 판단도 여기서 한다.
//
// 사용: node verification/admin-fixture.mjs   (frontend/ 에서)
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MODEL_FIXTURE = {
  nwp_ecmwf: { status: 'ok', modelRunAt: null, airportRuns: [{ airportIcao: 'RKSI', modelRunAt: '2026-09-06T00:00:00.000Z' }, { airportIcao: 'RKPU', modelRunAt: '2026-09-06T06:00:00.000Z' }], availableAt: '2026-09-06T07:09:00.000Z', collectedAt: '2026-09-06T07:20:00.000Z', successAirports: 7, failedAirports: 1, nextCheckAt: '2026-09-06T08:30:00.000Z', lastFailure: { airportIcao: 'RKSS', code: 'provider_failed', message: 'provider request failed' } },
  nwp_gfs: { status: 'late', modelRunAt: '2026-09-06T00:00:00.000Z', airportRuns: [{ airportIcao: 'RKSI', modelRunAt: '2026-09-06T00:00:00.000Z' }], availableAt: '2026-09-06T05:36:00.000Z', collectedAt: '2026-09-06T05:48:00.000Z', successAirports: 8, failedAirports: 0, nextCheckAt: '2026-09-06T08:40:00.000Z', lastFailure: null },
  nwp_icon: { status: 'disabled', modelRunAt: null, airportRuns: [], availableAt: null, collectedAt: null, successAirports: 0, failedAirports: 0, nextCheckAt: null, lastFailure: null },
  kim_nwp: { status: 'ok', modelRunAt: '2026-09-06T00:00:00.000Z', airportRuns: [{ airportIcao: 'RKSI', modelRunAt: '2026-09-06T00:00:00.000Z' }], availableAt: '2026-09-06T05:20:00.000Z', collectedAt: '2026-09-06T05:24:00.000Z', successAirports: 8, failedAirports: 0, nextCheckAt: '2026-09-06T08:50:00.000Z', lastFailure: null },
}

export async function installAdminDataHealthFixture(page) {
  await page.route('**/api/admin/data-health', async (route) => {
    const response = await route.fetch()
    const health = await response.json()
    health.rows = health.rows.map((row) => MODEL_FIXTURE[row.key] ? { ...row, ...MODEL_FIXTURE[row.key] } : row)
    await route.fulfill({ response, json: health })
  })
  await page.route('**/api/admin/metrics?*', async (route) => {
    // Fetch first so the real endpoint still proves the session has admin authority. A fresh
    // contract server has only one sampler row, so supply a stable two-point series for charts.
    const response = await route.fetch()
    const now = Date.now()
    await route.fulfill({ response, json: {
      range: new URL(route.request().url()).searchParams.get('range') || '24h',
      current: { cpuPct: 24, memUsed: 4 * 1024 ** 3, memTotal: 16 * 1024 ** 3, diskUsed: 30 * 1024 ** 3, diskTotal: 100 * 1024 ** 3 },
      peakCpu: { ts: new Date(now - 60_000).toISOString(), cpu_pct: 24 },
      series: [
        { ts: new Date(now - 120_000).toISOString(), cpu_pct: 18, mem_used: 3 * 1024 ** 3, mem_total: 16 * 1024 ** 3, disk_used: 29 * 1024 ** 3, disk_total: 100 * 1024 ** 3 },
        { ts: new Date(now - 60_000).toISOString(), cpu_pct: 24, mem_used: 4 * 1024 ** 3, mem_total: 16 * 1024 ** 3, disk_used: 30 * 1024 ** 3, disk_total: 100 * 1024 ** 3 },
      ],
    } })
  })
}

const backendDir = path.resolve(import.meta.dirname, '..', '..', 'backend')
const { getDb } = await import(pathToFileURL(path.join(backendDir, 'src/db/index.js')).href)
const { createUser } = await import(pathToFileURL(path.join(backendDir, 'src/db/users.js')).href)

const ACCOUNTS = [
  { username: process.env.CONTRACT_ADMIN_USER || 'contract_admin', password: process.env.CONTRACT_ADMIN_PASS || 'contract-pass-1', role: 'admin', status: 'active' },
  { username: 'contract_pending', password: 'contract-pass-1', role: 'pilot', status: 'pending' },
]

const db = getDb()
for (const account of ACCOUNTS) {
  try {
    const user = createUser(db, account)
    console.log(`만듦: ${user.role} '${user.username}' (id ${user.id}, ${account.status})`)
  } catch (error) {
    // 여러 번 돌려도 같은 상태가 되어야 한다.
    if (error.message === 'username_taken') console.log(`이미 있음: ${account.username}`)
    else throw error
  }
}
console.log('계약용 계정 준비 완료.')
