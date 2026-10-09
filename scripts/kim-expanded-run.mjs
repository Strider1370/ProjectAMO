// 확대 영역 회차를 정해진 시각을 기다리지 않고 지금 한 번 돌린다(운영 서버, 운영 데이터). 정기 수집과 같은 함수를 쓴다.
//   cd /opt/projectamo/current && nohup node scripts/kim-expanded-run.mjs --cycle 00 [--stop-kst 20:10] > ~/kim-expanded-run.log 2>&1 &
// 이 프로세스가 도는 동안 같은 회차의 정기 수집은 건너뛴다(kim_nwp_ea/run-<회차>.lock). --stop-kst는 새 시각 요청을 멈추는 KST 시각.
// 한반도 06 UTC 잘라내기 뒤의 한반도 GKTG·권계면 계산은 백엔드 정기 수집에서만 한다.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { cycle: { type: 'string' }, 'stop-kst': { type: 'string' } } })
if (!['00', '06'].includes(args.cycle)) throw new Error('--cycle 00|06')
if (args['stop-kst']) process.env.KIM_EXPANDED_STOP_KST = args['stop-kst']
// 백엔드와 같은 실행 환경(DATA_PATH, 저장 형식, Python 경로): PM2 설정의 env를 빌려 온다. 이미 정한 값은 두고, .env는 config가 읽는다.
const ecosystem = new URL('../ecosystem.config.cjs', import.meta.url)
if (fs.existsSync(ecosystem)) {
  const env = createRequire(import.meta.url)(ecosystem.pathname).apps?.find(app => app.name === 'projectamo-backend')?.env || {}
  for (const [key, value] of Object.entries(env)) if (!['NODE_OPTIONS', 'BACKEND_PORT', 'BACKEND_HOST'].includes(key)) process.env[key] ??= String(value)
}
const { processExpandedCycle } = await import('../backend/src/processors/kim-expanded-processor.js')
const result = await processExpandedCycle({ cycle: args.cycle })
console.log(JSON.stringify({ ...result, failures: result.failures?.slice(0, 10) }))
