// 비행범주 판정. #6 통일: 국제표준 4단계(MVFR)가 아니라 **패널식 3단계(VFR/IFR/LIFR) + 공항 기본 미니마**.
// ⚠️ frontend/src/shared/weather/helpers.js 의 classifyVisibilityCategory/classifyCeilingCategory +
//    DEFAULT_AIRPORT_MINIMA_RULES 를 그대로 미러링한 것(런타임 경계로 import 불가). 임계값·미니마 변경 시 양쪽 동기화.
//    동기화 회귀는 flight-category.test.js 가 지킨다.

// helpers.js DEFAULT_AIRPORT_MINIMA_RULES 미러. 백엔드는 사용자 커스텀 미니마를 모르므로 기본값만 적용.
const DEFAULT_AIRPORT_MINIMA_RULES = {
  RKSI: { visibilityM: 175, ceilingFt: null },
  RKSS: { visibilityM: 175, ceilingFt: null },
  RKPC: { visibilityM: 300, ceilingFt: 100 },
  RKPK: { visibilityM: 300, ceilingFt: 100 },
  RKTU: { visibilityM: 550, ceilingFt: 200 },
  RKTN: { visibilityM: 550, ceilingFt: 200 },
  RKTH: { visibilityM: 550, ceilingFt: 200 },
  RKJB: { visibilityM: 550, ceilingFt: 200 },
  RKJJ: { visibilityM: 550, ceilingFt: 200 },
  RKJK: { visibilityM: 550, ceilingFt: 200 },
  RKJY: { visibilityM: 550, ceilingFt: 200 },
  RKNW: { visibilityM: 550, ceilingFt: 200 },
  RKPS: { visibilityM: 550, ceilingFt: 200 },
  RKPU: { visibilityM: 550, ceilingFt: 200 },
  RKNY: { visibilityM: 550, ceilingFt: 200 },
}

function minimaFor(icao) {
  return DEFAULT_AIRPORT_MINIMA_RULES[String(icao || '').toUpperCase()] || null
}

// 공항 접근최저치. 알림이 실효 미니마(= max(내 미니마, 이 값))를 계산하는 데 쓴다.
// 표를 복사해 쓰지 말 것 — 한쪽만 고쳐지면 판정이 조용히 갈린다.
export function airportMinima(icao) {
  return minimaFor(icao)
}

const RANK = { LIFR: 0, IFR: 1, VFR: 2 }

// 시정 단독 3단계(helpers.js classifyVisibilityCategory 미러): 미니마 미만→LIFR, <5000m→IFR, else VFR.
function tierByVisibility(visibilityM, minima) {
  const vis = Number.isFinite(visibilityM) ? visibilityM : Infinity
  if (minima && Number.isFinite(minima.visibilityM) && vis < minima.visibilityM) return 'LIFR'
  if (vis < 5000) return 'IFR'
  return 'VFR'
}

// 운고 단독 3단계(helpers.js classifyCeilingCategory 미러): 미니마 미만→LIFR, <1500ft→IFR, else VFR.
function tierByCeiling(ceilingFt, minima) {
  const ceil = Number.isFinite(ceilingFt) ? ceilingFt : Infinity
  if (minima && Number.isFinite(minima.ceilingFt) && ceil < minima.ceilingFt) return 'LIFR'
  if (ceil < 1500) return 'IFR'
  return 'VFR'
}

function resolve({ visibilityM, ceilingFt, icao = null }) {
  const minima = minimaFor(icao)
  const byVis = tierByVisibility(visibilityM, minima)
  const byCeil = tierByCeiling(ceilingFt, minima)
  const category = RANK[byVis] <= RANK[byCeil] ? byVis : byCeil
  const driver = byVis === byCeil ? 'both' : RANK[byVis] < RANK[byCeil] ? 'visibility' : 'ceiling'
  return { category, driver }
}

// 표준 항공 비행범주(3단계) — 시정 m, 운고 ft(최저 BKN/OVC), icao로 기본 미니마 적용.
export function categoryFor({ visibilityM, ceilingFt, icao = null }) {
  return resolve({ visibilityM, ceilingFt, icao }).category
}

// categoryFor와 같되 한계요인(운고/시정/both)까지 — 배너 "IFR인 이유" 명시용.
export function categoryDetail({ visibilityM, ceilingFt, icao = null }) {
  return resolve({ visibilityM, ceilingFt, icao })
}

// 이미 3단계라 사실상 항등. 과거 4단계(MVFR) 데이터 호환 위해 폴드는 유지.
export function to3Level(category) {
  return category === 'MVFR' ? 'VFR' : category
}

// 색 = 심각도: VFR=green(양호), IFR=amber(주의), LIFR=red(경고).
export function levelForCategory(category) {
  if (category === 'VFR' || category === 'MVFR') return 'green'
  if (category === 'IFR') return 'amber'
  return 'red' // LIFR
}

export default { categoryFor, categoryDetail, to3Level, levelForCategory, airportMinima }
