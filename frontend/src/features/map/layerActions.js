// 공유 레이어 액션 레지스트리 — 검색이 첫 소비자, 나중에 브리핑/경로 토글도 동일 재사용.
// 표시 라벨(한글)+별칭은 여기가 단일 출처. id는 레이어 정의와 일치해야 하며,
// layerActions.test.js 커버리지 테스트가 정의 ↔ 레지스트리 동기화를 강제한다.
// (레이어 추가/삭제/ id 변경 시 등록을 깜빡하면 테스트가 깨져 알려줌.)
import { MET_LAYERS } from '../weather-overlays/lib/weatherOverlayLayers.js'
import { AVIATION_WFS_LAYERS } from '../aviation-layers/aviationWfsLayers.js'
import { BASEMAP_OPTIONS } from './mapConfig.js'

// A. 패널/창 열기 (폴백 — 정확한 레이어가 기억 안 날 때)
export const PANEL_ACTIONS = [
  { id: 'aviation', type: 'panel', label: '항공정보 패널', aliases: ['항공', 'aviation'], panelId: 'aviation' },
  { id: 'met', type: 'panel', label: '기상정보 패널', aliases: ['기상', '날씨', 'met'], panelId: 'met' },
  { id: 'route-check', type: 'panel', label: '비행 전 브리핑', aliases: ['브리핑', '경로', 'route'], panelId: 'route-check' },
  { id: 'monitoring', type: 'panel', label: '상황판', aliases: ['모니터링', 'monitoring'], href: '/monitoring' },
  { id: 'settings', type: 'panel', label: '설정', aliases: ['환경설정', 'settings'], panelId: 'settings' },
  { id: 'custom-area', type: 'panel', label: '임의 구역 설정', aliases: ['구역설정', '폴리곤', 'custom area'], panelId: 'custom-area' },
]

// B. 기상 레이어 — 패널('met') 열고 해당 레이어 ON
const MET_META = {
  radar: { label: '레이더', aliases: ['radar', '강수', '에코'] },
  satellite: { label: '위성영상', aliases: ['위성영상', 'satellite', '적외', 'ir'] },
  lightning: { label: '낙뢰', aliases: ['번개', 'lightning'] },
  wind: { label: '바람', aliases: ['wind', '풍속'] },
  temp: { label: '기온', aliases: ['온도', 'temp'] },
  cloud: { label: '습기', aliases: ['수분', 'moisture', '구름'] },
  icing: { label: '착빙', aliases: ['icing'] },
  turbulence: { label: '난류', aliases: ['turbulence'] },
  sigmet: { label: 'SIGMET(국내)', aliases: ['시그멧', '국내시그멧'] },
  sigmet_intl: { label: 'SIGMET(해외)', aliases: ['해외시그멧', '국제시그멧', 'overseas sigmet'] },
  airmet: { label: 'AIRMET', aliases: ['에어멧'] },
  sigwx: { label: 'SIGWX', aliases: ['시그윅스', '악기상'] },
  adsb: { label: 'ADS-B', aliases: ['항공기', '실시간항공기', 'adsb'] },
  flightCategory: { label: '비행기상구역', aliases: ['비행구역', '카테고리'] },
}
export const MET_ACTIONS = MET_LAYERS.map((l) => ({
  id: l.id, type: 'met', panelId: 'met',
  label: MET_META[l.id]?.label ?? l.label,
  aliases: MET_META[l.id]?.aliases ?? [],
}))

// C. 항공 레이어 — 패널('aviation') 열고 해당 레이어 ON
const AVIATION_META = {
  fir: { label: '비행정보구역(FIR)', aliases: ['fir'] },
  sector: { label: '관제섹터', aliases: ['섹터', 'sector'] },
  ctr: { label: '관제권(CTR)', aliases: ['ctr'] },
  tma: { label: '접근관제구역(TMA)', aliases: ['tma'] },
  restricted: { label: '제한구역', aliases: ['restricted'] },
  prohibited: { label: '금지구역', aliases: ['prohibited'] },
  danger: { label: '위험구역', aliases: ['danger'] },
  waypoint: { label: '웨이포인트', aliases: ['픽스', 'fix', 'waypoint'] },
  navaid: { label: '항행안전시설', aliases: ['navaid', 'vor'] },
  airport: { label: '공항', aliases: ['airport'] },
  'ats-route': { label: 'ATS 항공로', aliases: ['ats', '항로'] },
  'rnav-route': { label: 'RNAV 항공로', aliases: ['rnav'] },
  'overseas-route': { label: '국제 항공로', aliases: ['해외항로', '국제항로', 'overseas'] },
  'overseas-waypoint': { label: '해외 웨이포인트', aliases: ['해외웨이포인트', 'overseas waypoint', '해외픽스'] },
  'overseas-navaid': { label: '해외 항행안전시설', aliases: ['해외항행안전시설', 'overseas navaid', '해외항행', '국제항행'] },
  'overseas-airport': { label: '해외 공항', aliases: ['해외공항', 'overseas airport', '국제공항'] },
  'overseas-fir': { label: '해외 FIR', aliases: ['해외fir', '국제fir', 'overseas fir', '비행정보구역'] },
}
export const AVIATION_ACTIONS = AVIATION_WFS_LAYERS.map((l) => ({
  id: l.id, type: 'aviation', panelId: 'aviation',
  label: AVIATION_META[l.id]?.label ?? l.id,
  aliases: AVIATION_META[l.id]?.aliases ?? [],
}))

// D. 베이스맵 변경 — 위성은 '위성영상'(기상)과 구분해 '위성 지도'로 표시
const BASEMAP_META = {
  standard: { label: '기본 (지도)', aliases: ['standard', '표준'] },
  dark: { label: '단색 (지도)', aliases: ['회색', 'monochrome', 'dark'] },
  satellite: { label: '위성 지도', aliases: ['위성지도', '위성배경', 'satellite'] },
}
export const BASEMAP_ACTIONS = BASEMAP_OPTIONS.map((o) => ({
  id: o.id, type: 'basemap',
  label: BASEMAP_META[o.id]?.label ?? o.label,
  aliases: BASEMAP_META[o.id]?.aliases ?? [],
}))

export const ALL_ACTIONS = [...PANEL_ACTIONS, ...MET_ACTIONS, ...AVIATION_ACTIONS, ...BASEMAP_ACTIONS]

// id → 한글 라벨 (토글칩 등 공유 UI용). 라벨 단일 출처.
export const metLabel = (id) => MET_ACTIONS.find((a) => a.id === id)?.label ?? id
export const aviationLabel = (id) => AVIATION_ACTIONS.find((a) => a.id === id)?.label ?? id

// 공항 + 전체 action 카탈로그. airports = weatherData.airports.
export function buildSearchCatalog(airports = []) {
  const airportEntries = airports
    .filter((a) => a?.icao)
    .map((a) => {
      const ko = a.nameKo || a.name || ''
      return {
        id: a.icao, type: 'airport',
        label: ko ? `${a.icao} ${ko}` : a.icao,
        aliases: [a.icao, a.nameKo, a.name].filter(Boolean),
        data: a,
      }
    })
  return [...airportEntries, ...ALL_ACTIONS]
}

// 부분일치 검색. label/aliases에 query가 들어가면 매치. 접두 일치를 위로 정렬.
export function matchSearch(catalog, query, limit = 12) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const scored = []
  for (const entry of catalog) {
    const fields = [entry.label, ...(entry.aliases || [])].map((s) => String(s).toLowerCase())
    let best = Infinity
    for (const f of fields) {
      const idx = f.indexOf(q)
      if (idx === -1) continue
      // 점수: 라벨 정확일치 0, 접두 1, 그 외 위치+2
      const score = f === q ? 0 : idx === 0 ? 1 : idx + 2
      if (score < best) best = score
    }
    if (best !== Infinity) scored.push({ entry, score: best })
  }
  scored.sort((a, b) => a.score - b.score)
  return scored.slice(0, limit).map((s) => s.entry)
}
