// 상시 유효 공역(제한/금지/위험구역) → NOTAM 아이템 shape로 변환, matchRouteNotams() 재사용.
// NOTAM과 달리 유효기간이 없는(항상 활성) 구역이라 PERMANENT_FROM~TO로 시간창 체크를 항상 통과시킴.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
// 고도 라벨 파싱은 프론트(MOA 활성화 매칭)와 공유 — FL 환산 규칙이 두 곳에서 갈리면 안 된다.
import { parseCeilingFt, parseFloorFt, zoneAltitude } from '../../../shared/airspace-altitude.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../../../frontend/public/data')

const PERMANENT_FROM = '2000-01-01T00:00:00Z'
const PERMANENT_TO = '2100-01-01T00:00:00Z'

export { parseCeilingFt, parseFloorFt, zoneAltitude }

// category는 NOTAM_CATEGORIES(frontend)와 동일 id를 써서 기존 한글 라벨·UI를 그대로 재사용.
const ZONE_CONFIGS = [
  { file: 'restricted.geojson', category: 'restricted', codeField: 'res_lbl_1', ceilingField: 'res_lbl_2', floorField: 'res_lbl_3', koLabel: () => '제한구역' },
  { file: 'danger.geojson', category: 'danger', codeField: 'dng_lbl_1', ceilingField: 'dng_lbl_2', floorField: 'dng_lbl_3', koLabel: () => '위험구역' },
  { file: 'prohibited.geojson', category: 'prohibited', codeField: 'prh_lbl_1', ceilingField: 'prh_lbl_2', floorField: 'prh_lbl_3', koLabel: (p) => p.prh_lbl_4 || '비행금지구역' },
  // MOA는 진입 금지가 아니라 "군 훈련 중이니 주의" 구역이라 RESTRICTION_CATEGORIES(notam-briefing.js)에
  // 넣지 않는다 — 경로에 걸리면 사실로 나열되지만 저촉 경보로는 올리지 않는다.
  { file: 'moa.geojson', category: 'moa', codeField: 'moa_lbl_1', ceilingField: 'moa_lbl_2', floorField: 'moa_lbl_3', koLabel: () => '군작전구역' },
]

// 고도(상한·하한) 둘 다 원본에 없는 구역(예: 제한구역 R14) — 실제 NOTAM의 "미상 밴드"와 달리
// 우리 쪽 정적 차트 추출 데이터 자체가 불완전한 것이라, 안전 규칙(미상=저촉 간주)을 적용하면
// 매번 근거 없이 저촉 경보만 뜬다. 판정할 근거가 없으니 브리핑 매칭에서 아예 제외한다.
function hasAltitudeData(p, cfg) {
  return p[cfg.ceilingField] != null || p[cfg.floorField] != null
}

function zoneItemsFromGeoJson(geojson, cfg) {
  const features = (geojson?.features ?? [])
    .filter((f) => f.geometry)
    .filter((f) => hasAltitudeData(f.properties ?? {}, cfg))
  // 코드가 카테고리 내에서 유일하지 않은 경우가 있다 — MOA는 같은 이름이 고도층별로 두 번 나온다
  // (MOA 5 = 저층 9 000 AMSL/3 000 AGL + 고층 FL 400/12 000 AMSL). id는 브리핑 배너의 React key이자
  // 화면 라벨이라 중복되면 안 되므로, 겹치는 코드에만 밴드를 덧붙여 구분한다.
  const codeCount = new Map()
  for (const f of features) {
    const code = (f.properties ?? {})[cfg.codeField]
    if (code) codeCount.set(code, (codeCount.get(code) ?? 0) + 1)
  }
  return features
    .map((f, i) => {
      const p = f.properties ?? {}
      // 코드(R14, D14, P73 등)는 브리핑 배너에 원문 그대로 뜨므로
      // "zone-restricted-R14-54" 같은 내부 id 말고 코드 자체를 노출한다(실제 NOTAM 일련번호처럼).
      const code = p[cfg.codeField] || `${cfg.category}-${i}`
      const tiered = codeCount.get(code) > 1
      return {
        id: tiered ? `${code} (${p[cfg.ceilingField]}/${p[cfg.floorField]})` : code,
        category: cfg.category,
        summary: `${cfg.koLabel(p)} ${code}`,
        altitude: zoneAltitude(p[cfg.ceilingField], p[cfg.floorField]),
        valid_from: PERMANENT_FROM,
        valid_to: PERMANENT_TO,
        location: null,
        geometry: f.geometry,
      }
    })
}

let cache = null
export function loadAirspaceZoneItems() {
  if (cache) return cache
  cache = ZONE_CONFIGS.flatMap((cfg) => {
    const filePath = path.join(DATA_DIR, cfg.file)
    if (!fs.existsSync(filePath)) return []
    return zoneItemsFromGeoJson(JSON.parse(fs.readFileSync(filePath, 'utf8')), cfg)
  })
  return cache
}

export default { parseCeilingFt, parseFloorFt, zoneAltitude, loadAirspaceZoneItems }
