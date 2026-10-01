// 해외 FIR 경계 생성 — VATSIM VAT-Spy Boundaries.geojson에서 아시아 대상 FIR만 필터.
// 출처: https://github.com/vatsimnetwork/vatspy-data-project (Boundaries.geojson)
// 라이선스: CC-BY-SA-4.0 — 상업 사용 가능, 단 출처 표기 필수(지도 attribution). 파생물 동일 라이선스.
// 출력: frontend/public/data/fir-overseas.geojson  (인천 FIR처럼 경계선+라벨로 표시)
// 재생성: node scripts/generate_overseas_fir.mjs
// ⚠️ 이 스크립트는 VATSIM 원본(scripts/data/fir-overseas-vatsim.geojson)만 만든다. 지도에 쓰는 파일은
//    국토부 공역 KMZ 경계에 맞춰 scripts/airspace-kmz-to-geojson.py가 만든다. 원본을 다시 만들면 그것도 돌릴 것.
// ⚠️ 재생성 시 수동 보정 유실 주의: ZSHA/ZYSH 공유 경계(N38~38.25, E120~124)는 VAT-Spy
//    원본이 부정확(대각선이 122.28E까지 과도하게 늘어짐)해서 AIP 실측 좌표
//    (124,38)→(123,38.25)→(120,38.25)로 수동 스냅해뒀음(2026-07-07). 재생성하면 이 보정이
//    사라지니 다시 적용할 것.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { union } from '@turf/union'

const SRC = 'https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson'
// 원본만 쓴다. 지도 파일(frontend/public/data/fir-overseas.geojson)은 KMZ 경계에 맞춘 뒤
// scripts/airspace-kmz-to-geojson.py가 만든다.
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data/fir-overseas-vatsim.geojson')

// 대상 FIR(국내 RKRR 제외 — fir.geojson이 이미 인천 FIR을 그림). id → 표시명.
// ⚠️ 프놈펜 FIR 코드는 VDPF(공항코드 VDPP 아님).
// ⚠️ 일본: VAT-Spy가 후쿠오카를 오션(RJJJ)과 본토 ACC(RJDG/RJTG/RJBG…)로 쪼개 실어서
//    id 정확매칭이면 오션만 잡혀 본토가 통째로 빠진다 → division=VATJPN 폴리곤을 전부 dissolve해
//    내부선 없는 단일 후쿠오카 FIR(RJJJ)로 만든다(아래 JAPAN_DIVISION).
// ZKKP=평양(북한), UHHH=하바롭스크(러시아 극동, 블라디보스토크 지역 포함) — 한반도 북측 인접 FIR.
const JAPAN_DIVISION = 'VATJPN'  // 후쿠오카 FIR = 이 division 폴리곤들의 합집합(일본 전역 = 후쿠오카 하나)
const FIR_NAME = {
  RJJJ: 'FUKUOKA', RCAA: 'TAIPEI', VHHK: 'HONG KONG', ZMUB: 'ULAANBAATAR',
  ZBPE: 'BEIJING', ZSHA: 'SHANGHAI', ZGZU: 'GUANGZHOU', ZYSH: 'SHENYANG',
  ZHWH: 'WUHAN', ZJSA: 'SANYA', ZLHW: 'LANZHOU', VVHN: 'HANOI',
  VVHM: 'HO CHI MINH', VDPF: 'PHNOM PENH', VTBB: 'BANGKOK', WMFC: 'KUALA LUMPUR',
  WSJC: 'SINGAPORE', WIIF: 'JAKARTA', WAAF: 'UJUNG PANDANG', RPHI: 'MANILA',
  ZKKP: 'PYONGYANG', UHHH: 'KHABAROVSK',
  VLVT: 'VIENTIANE', WBFC: 'KOTA KINABALU', // 라오스, 코타키나발루(사바·브루나이)
  ZPKM: 'KUNMING', // 쿤밍(쓰촨·윈난·충칭 서남부) — 청두·쿤밍·충칭 취항지 커버
}

const res = await fetch(SRC)
if (!res.ok) throw new Error(`VAT-Spy fetch failed: ${res.status}`)
const src = await res.json()

// FIR별 대표 폴리곤(정확 매칭)만 경계선으로 그린다 — 하위 섹터 조각은 넣지 않음(본토 내부 선 방지).
// 라벨은 인천 FIR과 동일 방식: 지정 좌표(label_lon/lat)에 point 라벨을 놓고 addFirLabelLayer가
// code(크게)/이름(작게) 포맷으로 렌더한다(폴리곤 중심 라벨 X — 타일마다 반복돼 지저분해짐).
// ⚠️ 아래 3개는 도메스틱 fir.geojson이 이미 라벨하므로 여기선 point 라벨을 안 만든다(중복 방지):
//    RJJJ(후쿠오카; VAT-Spy 폴리곤이 태평양까지 뻗어 중심이 먼바다), ZKKP(평양), ZSHA(상하이).
const NO_LABEL = new Set(['RJJJ', 'ZKKP', 'ZSHA'])

const targets = new Set(Object.keys(FIR_NAME))
const isPoly = (g) => g?.type === 'Polygon' || g?.type === 'MultiPolygon'

// 일본(RJJJ)은 division=VATJPN 폴리곤 전부를 하나로 합쳐(내부 섹터선 제거) 단일 후쿠오카 FIR로.
const jpParts = src.features.filter((f) => f.properties?.division === JAPAN_DIVISION && isPoly(f.geometry))
const jpMerged = union({ type: 'FeatureCollection', features: jpParts })
if (!jpMerged) throw new Error(`Japan(${JAPAN_DIVISION}) 폴리곤 합집합 실패 — ${jpParts.length}개`)

const features = [
  { type: 'Feature', properties: { id: 'RJJJ', role: 'overseas-fir', fir_lbl_1: 'FUKUOKA FIR' }, geometry: jpMerged.geometry },
]
// 나머지 FIR: id 정확매칭(RJJJ은 위에서 합쳐 넣었으므로 제외).
for (const f of src.features) {
  const id = f.properties?.id
  if (!targets.has(id) || id === 'RJJJ') continue
  const name = FIR_NAME[id]
  features.push({
    type: 'Feature',
    properties: { id, role: 'overseas-fir', fir_lbl_1: `${name} FIR` },
    geometry: f.geometry,
  })
  if (!NO_LABEL.has(id)) {
    features.push({
      type: 'Feature',
      properties: { role: 'external-label', code: id, label: `${name} FIR` },
      geometry: { type: 'Point', coordinates: [Number(f.properties.label_lon), Number(f.properties.label_lat)] },
    })
  }
}

const found = new Set(features.map((f) => f.properties.id))
const missing = [...targets].filter((id) => !found.has(id))
if (missing.length) console.warn('⚠️ VAT-Spy에 없는 FIR:', missing.join(','))

const out = {
  type: 'FeatureCollection',
  // 출처 표기(파일 자체에도 남김 — CC-BY-SA-4.0).
  _attribution: 'FIR boundaries © VATSIM VAT-Spy (CC-BY-SA-4.0)',
  _source: SRC,
  features,
}
fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`, 'utf8')
console.log(`wrote ${features.length} FIR → ${path.relative(process.cwd(), OUT)}`)
