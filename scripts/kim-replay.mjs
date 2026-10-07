// 저장된 KIM 회차로 GKTG·권계면을 네트워크 없이 다시 계산한다. 운영에서만 나는 문제를 로컬에서 재현할 때 쓴다.
//
// 1) 운영 회차 가져오기(읽기 전용, 기상청 호출 없음):
//    D=artifacts/kim-replay/data; mkdir -p $D/kim_nwp/runs
//    rsync -az ec2-user@<host>:/opt/projectamo/shared/data/kim_nwp/runs/KIMG_NE57_<tmfc> $D/kim_nwp/runs/
//    rsync -az ec2-user@<host>:/opt/projectamo/shared/data/kim_nwp/{latest.json,index.json} $D/kim_nwp/
// 2) 재계산:
//    KIM_STORE_FORMAT=nc node scripts/kim-replay.mjs --data $D --run <tmfc> --product all --force
//
// --force: 이 데이터 폴더의 파생 게시 포인터를 지워 "변경 없음" 건너뛰기를 막는다(계산 결과가 이미 있으면 재사용).
// --recompute: 기존 파생 결과 파일까지 지워 Python 계산부터 다시 한다.
// 추가 입력(raw)이 없어 API가 필요해지면 호출하지 않고 실패로 남긴다. 운영 데이터 폴더에는 실행하지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: {
  data: { type: 'string' }, run: { type: 'string' }, product: { type: 'string', default: 'all' },
  hours: { type: 'string' }, force: { type: 'boolean' }, recompute: { type: 'boolean' },
} })
if (!args.data) throw new Error('--data <복사한 DATA_PATH>가 필요합니다')
const root = path.resolve(args.data)
if (root.startsWith('/opt/projectamo')) throw new Error('운영 데이터 폴더에는 재처리를 실행하지 않습니다. 복사본을 쓰세요.')
const products = args.product === 'all' ? ['gktg', 'tropopause'] : [args.product]
if (!products.every(product => ['gktg', 'tropopause'].includes(product))) throw new Error('--product는 gktg, tropopause, all 중 하나입니다')

process.env.DATA_PATH = root
const kimRoot = path.join(root, 'kim_nwp')
const latest = JSON.parse(fs.readFileSync(path.join(kimRoot, 'latest.json'), 'utf8'))
const tmfc = args.run || latest.latestRun
const runDir = path.join(kimRoot, 'runs', `KIMG_NE57_${tmfc}`)
if (!fs.existsSync(runDir)) throw new Error(`회차가 없습니다: ${runDir}`)

const offline = async (request) => {
  const error = new Error(`offline replay: missing cached input ${request.name}@${request.level} hf${request.hf}`)
  error.code = 'kim_replay_offline'
  throw error
}

const { appendKimRunEvent } = await import('../backend/src/processors/kim-run-events.js')
const results = {}
for (const product of products) {
  if (args.force || args.recompute) fs.rmSync(path.join(kimRoot, 'derived', product, 'latest.json'), { force: true })
  if (args.recompute) {
    const pattern = product === 'gktg' ? /[/\\]gktg[/\\][a-f0-9]{20,64}\.(?:json|nc)$/ : /[/\\]derived[/\\]tropopause[/\\]hf\d{3}[/\\]/
    const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (pattern.test(file)) fs.rmSync(file)
    } }
    walk(runDir)
  }
  const module = await import(`../backend/src/processors/kim-${product}-processor.js`)
  const started = Date.now()
  const result = await module.process({ root, tmfc, fetchGrid: offline,
    ...(args.hours ? { forecastHours: args.hours.split(',').map(Number) } : {}) })
  appendKimRunEvent(runDir, { type: 'replay', product, ms: Date.now() - started, saved: result.saved, failures: result.failures?.length ?? null })
  results[product] = { ms: Date.now() - started, saved: result.saved, fields: result.fields, revision: result.revision, failures: result.failures }
}
console.log(JSON.stringify({ root, tmfc, storeFormat: process.env.KIM_STORE_FORMAT || 'json', results }, null, 2))
if (Object.values(results).some(result => !result.saved)) process.exitCode = 1
