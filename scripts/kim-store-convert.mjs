// 이미 JSON으로 저장된 KIM 회차의 문서를 NC로 옮긴다(kim-doc-store.js 형식).
//
//   node scripts/kim-store-convert.mjs --data <DATA_PATH> [--run 2026100700] [--remove-json] [--gzip-raw]
//
// 문서마다 NC를 쓰고 다시 읽어 JSON과 같은지 확인한다. 하나라도 다르면 그 문서는 JSON을 남기고 실패로 센다.
// --remove-json: 같다고 확인된 문서의 JSON을 지운다(KIM_STORE_FORMAT=nc로 전환한 뒤에 쓴다).
// --gzip-raw: raw/ 텍스트 캐시를 .gz로 바꾼다.
// --run을 생략하면 모든 회차를 옮긴다. 결과를 회차 진행 기록에 남긴다.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { isDeepStrictEqual, parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: {
  data: { type: 'string' }, run: { type: 'string' }, 'remove-json': { type: 'boolean' }, 'gzip-raw': { type: 'boolean' },
} })
if (!args.data) throw new Error('--data <DATA_PATH>가 필요합니다')
const root = path.resolve(args.data)
const { kimNcPath, readKimNcDocument, writeKimDocument } = await import('../backend/src/processors/kim-doc-store.js')
const { appendKimRunEvent } = await import('../backend/src/processors/kim-run-events.js')

const runsDir = path.join(root, 'kim_nwp', 'runs')
const runs = fs.readdirSync(runsDir).filter(name => !args.run || name.endsWith(`_${args.run}`)).sort()
if (!runs.length) throw new Error(`회차가 없습니다: ${args.run || '(전체)'}`)

const isDocument = file => /[/\\]normalized[/\\]hf\d{3}[/\\][^/\\]+[/\\](?:grid|gktg[/\\][a-f0-9]{20,64})\.json$/.test(file)
  || /[/\\]derived[/\\]tropopause[/\\]hf\d{3}[/\\][a-f0-9]{20,64}(?:\.upper)?\.json$/.test(file)

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file, visit)
    else visit(file)
  }
}

const totals = []
for (const runId of runs) {
  const runDir = path.join(runsDir, runId)
  const started = Date.now()
  const result = { runId, documents: 0, converted: 0, failed: [], jsonBytes: 0, ncBytes: 0, rawBefore: 0, rawAfter: 0, removedJson: 0 }
  const documents = []
  const raws = []
  walk(runDir, (file) => {
    if (isDocument(file)) documents.push(file)
    else if (file.includes(`${path.sep}raw${path.sep}`) && file.endsWith('.txt')) raws.push(file)
  })
  for (const file of documents) {
    result.documents += 1
    const expected = JSON.parse(fs.readFileSync(file, 'utf8'))
    result.jsonBytes += fs.statSync(file).size
    try {
      writeKimDocument(file, expected, { format: 'nc' })
      const ncFile = kimNcPath(file)
      if (!isDeepStrictEqual(readKimNcDocument(ncFile), expected)) throw new Error('value_mismatch')
      result.ncBytes += fs.statSync(ncFile).size
      result.converted += 1
      if (args['remove-json']) { fs.rmSync(file); result.removedJson += 1 }
    } catch (error) {
      fs.rmSync(kimNcPath(file), { force: true })
      result.failed.push({ file: path.relative(root, file), reason: error.message })
    }
  }
  if (args['gzip-raw']) {
    for (const file of raws) {
      const text = fs.readFileSync(file)
      result.rawBefore += text.length
      const gz = zlib.gzipSync(text, { level: 6 })
      fs.writeFileSync(`${file}.gz.tmp`, gz)
      fs.renameSync(`${file}.gz.tmp`, `${file}.gz`)
      if (zlib.gunzipSync(fs.readFileSync(`${file}.gz`)).equals(text)) { fs.rmSync(file); result.rawAfter += gz.length }
      else { fs.rmSync(`${file}.gz`); result.failed.push({ file: path.relative(root, file), reason: 'raw_gzip_mismatch' }) }
    }
  }
  result.ms = Date.now() - started
  appendKimRunEvent(runDir, { type: 'store_converted', documents: result.documents, converted: result.converted, failed: result.failed.length,
    jsonBytes: result.jsonBytes, ncBytes: result.ncBytes, removedJson: result.removedJson, ms: result.ms })
  totals.push(result)
}
console.log(JSON.stringify(totals.map(r => ({ ...r, failed: r.failed.length ? r.failed : 0,
  jsonMB: +(r.jsonBytes / 1e6).toFixed(1), ncMB: +(r.ncBytes / 1e6).toFixed(1), rawBeforeMB: +(r.rawBefore / 1e6).toFixed(1), rawAfterMB: +(r.rawAfter / 1e6).toFixed(1) })), null, 2))
if (totals.some(r => r.failed.length)) process.exitCode = 1
