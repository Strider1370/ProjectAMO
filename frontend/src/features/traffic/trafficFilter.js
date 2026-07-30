// ADS-B 항적 필터의 판정·집계 — 순수 함수만. 지도(MapLibre)에는 판정 결과인 icao24 목록만 넘긴다.
// 표현식으로 같은 판정을 한 번 더 쓰지 않는 이유: 두 곳이 어긋나면 "숨겼는데 로고만 남는" 종류의
// 버그가 조용히 생긴다. 판정은 여기 한 번뿐이다.
import { AIRLINE_NAMES, airlineCode } from '../aviation-layers/airlines.js'
import { OPERATOR_NAMES, operatorCode } from '../aviation-layers/operators.js'

export const FEET_PER_METER = 3.28084
export const ALTITUDE_MIN_FT = 0
export const ALTITUDE_MAX_FT = 45000
export const ALTITUDE_STEP_FT = 500

export const OPERATOR_GROUPS = ['airline', 'agency', 'unclassified']
export const GROUP_LABELS = { airline: '항공사', agency: '기관·훈련기', unclassified: '미분류' }
export const CLASS_LABELS = {
  heavy: '대형기', jet: '제트', regional: '리저널', turboprop: '터보프롭',
  piston: '피스톤', helicopter: '헬기', unknown: '미분류',
}

export const DEFAULT_FILTERS = {
  groups: [],
  codes: [],
  altitudeFt: [ALTITUDE_MIN_FT, ALTITUDE_MAX_FT],
  classes: [],
  search: '',
}

// 소속은 지도 속성 operator를 쓰지 않는다 — 그 값은 "로고 파일이 있는 코드"라서 로고 없는
// 항공사(하이에어 등)가 빈 문자열로 온다. 편명·등록기호에서 다시 판정한다.
export function operatorInfo(props = {}) {
  const agency = operatorCode(props.registration)
  if (agency && OPERATOR_NAMES[agency]) return { group: 'agency', code: agency, name: OPERATOR_NAMES[agency] }
  const airline = airlineCode(props.callsign)
  if (airline && AIRLINE_NAMES[airline]) return { group: 'airline', code: airline, name: AIRLINE_NAMES[airline] }
  return { group: 'unclassified', code: airline || '', name: '' }
}

function isFullAltitudeRange([lo, hi] = []) {
  return lo <= ALTITUDE_MIN_FT && hi >= ALTITUDE_MAX_FT
}

export function hasActiveFilters(filters = DEFAULT_FILTERS) {
  if (filters.search?.trim()) return true
  if (filters.groups?.length || filters.codes?.length || filters.classes?.length) return true
  return !isFullAltitudeRange(filters.altitudeFt || [])
}

function matchesSearch(props, term) {
  const needle = term.trim().toLowerCase()
  return [props.callsign, props.registration]
    .some((v) => String(v || '').toLowerCase().includes(needle))
}

export function matchesFilters(props = {}, filters = DEFAULT_FILTERS) {
  // 검색은 "찾기"다 — 다른 조건 때문에 못 찾는 상황을 만들지 않는다.
  if (filters.search?.trim()) return matchesSearch(props, filters.search)

  const { group, code } = operatorInfo(props)
  const wantsOperator = (filters.groups?.length || 0) + (filters.codes?.length || 0) > 0
  if (wantsOperator && !(filters.groups?.includes(group) || (code && filters.codes?.includes(code)))) return false

  if (filters.classes?.length && !filters.classes.includes(props.aircraft_class || 'unknown')) return false

  const [lo, hi] = filters.altitudeFt || DEFAULT_FILTERS.altitudeFt
  if (!isFullAltitudeRange([lo, hi])) {
    // 고도를 안 보내는 기체는 구간 안인지 판정할 수 없다 → 구간이 좁혀져 있으면 숨긴다.
    if (!Number.isFinite(props.baro_altitude)) return false
    const ft = props.baro_altitude * FEET_PER_METER
    if (ft < lo || ft > hi) return false
  }
  return true
}

export function visibleIds(features = [], filters = DEFAULT_FILTERS) {
  const out = []
  for (const f of features) {
    const props = f?.properties || {}
    if (!props.icao24) continue // 식별할 수 없는 기체는 규칙에 넣을 수 없다
    if (matchesFilters(props, filters)) out.push(props.icao24)
  }
  return out
}

export function adsbIdFilter(ids = []) {
  return ['in', ['get', 'icao24'], ['literal', ids]]
}

export function countAircraft(features = []) {
  const groups = { airline: 0, agency: 0, unclassified: 0 }
  const byCode = new Map()
  for (const f of features) {
    const { group, code, name } = operatorInfo(f?.properties || {})
    groups[group] += 1
    if (group === 'unclassified') continue // 미분류는 개별로 펼치지 않는다
    const prev = byCode.get(code)
    if (prev) prev.count += 1
    else byCode.set(code, { code, name, group, count: 1 })
  }
  const items = [...byCode.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { total: features.length, groups, items }
}
