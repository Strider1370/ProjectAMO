// 확대 영역에서 잘라 만든 한반도 회차와 한반도 단독 수집 회차를 문서 단위로 비교한다(읽기 전용).
//   node scripts/kim-crop-compare.mjs --a /opt/projectamo/shared/data --b ~/kim-ea-diag/data --tmfc 2026100906
// 격자 정보·변수 목록·인코딩·값이 모두 같아야 한다. fetched_at(받은 시각)은 비교하지 않는다.
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { a: { type: 'string' }, b: { type: 'string' }, tmfc: { type: 'string' } } })
if (!args.a || !args.b || !/^\d{10}$/.test(args.tmfc || '')) throw new Error('--a <DATA_PATH> --b <DATA_PATH> --tmfc YYYYMMDDHH')
const { KIM_NWP_LEVELS, KIM_NWP_MODEL } = await import('../backend/src/processors/kim-nwp-model.js')
const { readKimNwpGrid } = await import('../backend/src/processors/kim-nwp-store.js')
const config = (await import('../backend/src/config.js')).default

let documents = 0, values = 0, different = 0
const problems = []
for (const hf of config.kim_nwp.forecast_hours) {
  for (const level of KIM_NWP_LEVELS) {
    let a, b
    try {
      a = readKimNwpGrid({ root: args.a, model: KIM_NWP_MODEL, tmfc: args.tmfc, hf, levelId: level.id })
      b = readKimNwpGrid({ root: args.b, model: KIM_NWP_MODEL, tmfc: args.tmfc, hf, levelId: level.id })
    } catch (error) { problems.push(`${hf}/${level.id}: ${error.code || error.message}`); continue }
    documents++
    if (JSON.stringify(a.grid) !== JSON.stringify(b.grid)) problems.push(`${hf}/${level.id}: grid`)
    if (Object.keys(a.variables).join() !== Object.keys(b.variables).join()) problems.push(`${hf}/${level.id}: variables ${Object.keys(a.variables)} vs ${Object.keys(b.variables)}`)
    for (const [name, variable] of Object.entries(a.variables)) {
      const other = b.variables[name]
      if (!other) continue
      for (const key of ['unit', 'encoding', 'scale', 'offset']) if (variable[key] !== other[key]) problems.push(`${hf}/${level.id}/${name}: ${key}`)
      for (let i = 0; i < variable.values.length; i++) { values++; if (variable.values[i] !== other.values[i]) different++ }
    }
  }
}
console.log(JSON.stringify({ tmfc: args.tmfc, documents, values, different, problems: problems.slice(0, 20), problemCount: problems.length }))
