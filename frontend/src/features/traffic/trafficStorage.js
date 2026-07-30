// 필터 저장값 검증 — 저장소는 사용자가 손댈 수 있고 버전이 바뀔 수도 있으니, 모르는 값은
// 조용히 버리고 기본값으로 돌린다(필터가 깨져서 화면이 비는 것보다 전체 표시가 안전하다).
import { ALTITUDE_MAX_FT, ALTITUDE_MIN_FT, CLASS_LABELS, DEFAULT_FILTERS, OPERATOR_GROUPS } from './trafficFilter.js'

export const STORAGE_KEY = 'amo.traffic.filters.v1'

const CLASS_IDS = Object.keys(CLASS_LABELS)

function stringList(value, allowed) {
  if (!Array.isArray(value)) return []
  const out = value.filter((v) => typeof v === 'string' && (!allowed || allowed.includes(v)))
  return [...new Set(out)]
}

function altitudeRange(value) {
  if (!Array.isArray(value) || value.length !== 2) return [...DEFAULT_FILTERS.altitudeFt]
  const nums = value.map(Number)
  if (!nums.every(Number.isFinite)) return [...DEFAULT_FILTERS.altitudeFt]
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  return [
    Math.max(ALTITUDE_MIN_FT, Math.min(ALTITUDE_MAX_FT, lo)),
    Math.max(ALTITUDE_MIN_FT, Math.min(ALTITUDE_MAX_FT, hi)),
  ]
}

export function parseStoredFilters(raw) {
  let parsed = null
  try { parsed = JSON.parse(raw) } catch { parsed = null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_FILTERS }
  return {
    groups: stringList(parsed.groups, OPERATOR_GROUPS),
    codes: stringList(parsed.codes, null),
    classes: stringList(parsed.classes, CLASS_IDS),
    altitudeFt: altitudeRange(parsed.altitudeFt),
    search: '', // 검색어는 일회성 — 저장·복원하지 않는다
  }
}

export function serializeFilters(filters = DEFAULT_FILTERS) {
  const { search, ...rest } = filters
  return JSON.stringify(rest)
}
