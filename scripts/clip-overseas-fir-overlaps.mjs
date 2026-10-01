// 해외 FIR 겹침 제거(오프라인 데이터 가공). turf는 devDependency — 런타임 미포함.
// 규칙: 아래 OWNERSHIP에서 '주인' FIR 영역을, 침범한 이웃들에서 잘라낸다(polygon difference).
//   → 이웃 경계선이 주인 FIR 내부를 가로지르던 선이 사라지고, 주인 FIR이 한 덩어리로 남는다.
// 재실행: node scripts/clip-overseas-fir-overlaps.mjs
// 순서: generate_overseas_fir.mjs(VATSIM 원본) → 이 스크립트(원본의 겹침 정리) → airspace-kmz-to-geojson.py(KMZ 경계에
//       맞춰 지도 파일 fir-overseas.geojson 생성). 지도 파일을 직접 고치지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { difference, featureCollection } from '@turf/turf'

const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data/fir-overseas-vatsim.geojson')

// 주인 FIR → 이 영역을 잘라낼 이웃들. (nearest-centroid로 확인한 소유권과 사용자 지정 반영)
const OWNERSHIP = [
  { owner: 'ZHWH', clipFrom: ['ZGZU', 'ZBPE'] }, // 우한 영역을 광저우·베이징에서 제거 → 우한 가로지르는 선 삭제
  { owner: 'ZSHA', clipFrom: ['ZBPE'] },          // 상하이 영역(ZSQD 서쪽 박스 등)을 베이징에서 제거
  { owner: 'ZGZU', clipFrom: ['ZJSA'] },          // 광저우 남부(ZJSA와 사이 빈공간)를 싼야에서 제거 → 반원 arc 선 삭제
  { owner: 'VDPF', clipFrom: ['VVHM'] },          // 프놈펜 영역(푸꾸옥 위 타이만)을 호치민에서 제거 → VVPQ 위 대각선 삭제
  { owner: 'VVHN', clipFrom: ['VVHM'] },          // 하노이 영역(중부 베트남)을 호치민에서 제거 → 호치민↔하노이 겹침선 삭제
]

const fc = JSON.parse(fs.readFileSync(P, 'utf8'))
const byId = (id) => fc.features.find((f) => f.properties?.role === 'overseas-fir' && f.properties.id === id)

for (const { owner, clipFrom } of OWNERSHIP) {
  const o = byId(owner)
  if (!o) { console.warn('주인 없음:', owner); continue }
  for (const nid of clipFrom) {
    const n = byId(nid)
    if (!n) { console.warn('이웃 없음:', nid); continue }
    const clipped = difference(featureCollection([n, o]))
    if (!clipped) { console.warn(`${nid} - ${owner} = 빈결과(스킵)`); continue }
    const before = JSON.stringify(n.geometry).length
    n.geometry = clipped.geometry
    console.log(`${nid} 에서 ${owner} 제거: geom ${before} -> ${JSON.stringify(n.geometry).length}`)
  }
}

fs.writeFileSync(P, `${JSON.stringify(fc)}\n`, 'utf8')
console.log('완료:', path.relative(process.cwd(), P))
