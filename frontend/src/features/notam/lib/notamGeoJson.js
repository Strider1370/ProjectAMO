import { deriveTimeState, formatAltitude, formatAltitudeBand, formatValidPeriod, NOTAM_CATEGORIES } from './notamViewModel.js'
import { obstacleType, parseObstacleHeight } from './notamObstacleIcons.js'

// 지도 라벨용 카테고리명: 구역 계열은 정식 명칭, 그 외는 짧은 라벨(notam-label은 구역만 렌더).
const AREA_LABEL = { prohibited: '비행금지구역', restricted: '제한구역', danger: '위험구역', firing: '사격훈련구역' }
const CAT_SHORT = Object.fromEntries(NOTAM_CATEGORIES.map((c) => [c.id, c.label]))
// 지도 구역 라벨 = 카테고리명 + 차트식 고도밴드(상한/수평선/하한). 일련번호·원문은 클릭 팝업으로.
function buildMapLabel(item) {
  const cat = AREA_LABEL[item.category] || CAT_SHORT[item.category] || '기타'
  const band = formatAltitudeBand(item.altitude)
  // 제목-밴드 사이엔 빈 줄( )로 간격, 밴드(상한/수평선/하한)는 좁은 line-height로 바짝 붙음.
  return band ? `${cat}\n \n${band}` : cat
}

// "DDMMSS[.s]N DDDMMSS[.s]E" (NOTAM E)본문 PSN) → [lon,lat]. 못 읽으면 null.
export function parsePsnPoint(text) {
  const m = String(text || '').match(/(\d{2})(\d{2})(\d{2}(?:\.\d+)?)\s*([NS])\D{0,4}(\d{3})(\d{2})(\d{2}(?:\.\d+)?)\s*([EW])/)
  if (!m) return null
  const lat = (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * (m[4] === 'S' ? -1 : 1)
  const lon = (Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600) * (m[8] === 'W' ? -1 : 1)
  return (Number.isFinite(lat) && Number.isFinite(lon)) ? [lon, lat] : null
}

// 지도 표시용 지오메트리: 장애물만 PSN 정확한 점으로. 그 외(시설·구역 계열)는 원래 지오메트리 유지
// (시설=활주로형 폴리곤 그대로 색칠, 구역=폴리곤). 목록·표·공항탭은 원본 안 씀 — 지도 렌더/줌만 해당.
export function displayGeometry(item) {
  const g = item?.geometry
  if (!g) return null
  if (item.category === 'obstacle') {
    const p = parsePsnPoint(item.summary) || parsePsnPoint(item.rawText)
    return p ? { type: 'Point', coordinates: p } : g
  }
  return g
}

// 백엔드 페이로드 → GeoJSON. 지오메트리 없는 항목만 제외.
// scope:'fir'(전국 폴리곤)도 포함하되, 레이어에서 fill 없이 외곽선만 그려 화면을 덮지 않게 함
// (notamLayers.js 의 scope 기반 filter 참조). LineString(회랑형)도 유지 — 브리핑 자동매칭만 Phase C에서 제외.
export function notamToFeatureCollection(payload, nowMs = Date.now()) {
  const items = Array.isArray(payload?.items) ? payload.items : []
  return {
    type: 'FeatureCollection',
    features: items
      // 시설(주파수·GPS·유도로/활주로 폐쇄 등)은 지도 미표시 — 공항 패널 NOTAM 탭·목록에서 확인.
      .filter((it) => it?.category !== 'facility')
      .map((it) => ({ it, geom: displayGeometry(it) }))
      .filter(({ geom }) => geom?.type && geom?.coordinates)
      .map(({ it, geom }) => ({
        type: 'Feature',
        id: it.id,
        properties: {
          id: it.id,
          category: it.category || 'other',
          scope: it.scope || 'airport',
          timeState: deriveTimeState(it.valid_from, it.valid_to, nowMs),
          summary: it.summary || it.id,
          validPeriod: formatValidPeriod(it.valid_from, it.valid_to),
          altitude: formatAltitude(it.altitude),
          mapLabel: buildMapLabel(it), // 구역 라벨: 카테고리명 + 차트식 고도밴드 (notam-label 레이어)
          location: it.location || '',
          rawText: it.rawText || it.summary || '', // 지도 팝업 '원문 보기'용
          // 장애물 심볼용(다른 카테고리엔 무해)
          obstacleType: it.category === 'obstacle' ? obstacleType(it.summary || it.rawText) : '',
          heightLabel: it.category === 'obstacle' ? parseObstacleHeight(it.rawText || it.summary) : '',
        },
        geometry: geom,
      })),
  }
}

export default { notamToFeatureCollection }
