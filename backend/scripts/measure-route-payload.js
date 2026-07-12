// Phase 0.1 payload 실측 — 저장된 경로의 payload 크기와, enrouteGeometry 추가 시 예상 크기를 잰다.
// 목적: routes.js MAX_PAYLOAD(20000) 대비 여유 확인 → "둘 다 저장" vs "스켈레톤만" 결정.
// 실행: node backend/scripts/measure-route-payload.js
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB || path.join(__dirname, '..', 'data', 'projectamo.db')
const db = new Database(dbPath, { readonly: true })

const rows = db.prepare('SELECT id, name, payload FROM routes').all()
if (rows.length === 0) {
  console.log('저장된 경로 0개 — 실측용 데이터 없음. (아래 합성 worst-case만 참고)')
}

const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8')
let maxCur = 0
let maxProj = 0
for (const r of rows) {
  let p = {}
  try { p = JSON.parse(r.payload || '{}') } catch { /* skip */ }
  const cur = bytes(p)
  // enrouteGeometry는 절차 증강 전 스켈레톤(≤ routeGeometry). 상한 추정으로 routeGeometry와 동일 크기를 더한다.
  const geomBytes = p.routeGeometry ? bytes(p.routeGeometry) : 0
  const proj = cur + geomBytes // "둘 다 저장" 시 예상 크기(보수적: 스켈레톤=최종선 크기 가정)
  const rule = p.routeForm?.flightRule ?? '?'
  const coords = p.routeGeometry?.coordinates?.length ?? 0
  const wps = p.vfrWaypoints?.length ?? 0
  console.log(`#${r.id} [${rule}] cur=${cur}B  +enroute≈${geomBytes}B → proj=${proj}B  (coords=${coords}, vfrWps=${wps})  ${r.name}`)
  maxCur = Math.max(maxCur, cur)
  maxProj = Math.max(maxProj, proj)
}

console.log('\n=== 요약 ===')
console.log(`경로 수: ${rows.length}`)
console.log(`현재 payload 최대: ${maxCur}B`)
console.log(`둘 다 저장 시 예상 최대: ${maxProj}B  (상한 ${20000}B)`)
console.log(`판정: ${maxProj <= 15000 ? '둘 다 저장 (≤15KB 여유)' : maxProj < 20000 ? '경계(15~20KB) → 스켈레톤만 저장 권장' : '초과 → 스켈레톤만 저장 필수'}`)
db.close()
