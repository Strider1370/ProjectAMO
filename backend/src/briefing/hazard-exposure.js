import {
  ALTITUDE_EXPOSURE,
  CONFIDENCE,
  HORIZONTAL_EXPOSURE,
  TIME_STATUS,
} from '../../../shared/briefing-status.js'
import { routeCorridorInGeometry, timeWindowsOverlap } from './geo-time-match.js'
import { bandToFt } from './planned-altitude.js'

// AIRMET Sierra 계열(지상 시정 저하·산악 흐림·IFR·저고도 윈드시어)은 정의상 지표 부근 현상이라
// 원문 IWXXM에 고도(FL) 자체가 없다(ICAO Annex 3 Appendix 6). 고도 정보가 없다고 모든 순항고도에서
// "판정 불가"로 남기면 FL310 노선 표에도 지표시정이 매 구간 붙는다. 착빙/난류/뇌우 등은 원문에
// 고도가 항상 있으므로 이 가정을 적용하지 않는다.
const SURFACE_PHENOMENON_CODES = new Set(['SFC_VIS', 'MT_OBSC', 'IFR', 'LLWS'])
const SURFACE_BAND_FT = { lowFt: 0, highFt: 10000 }

// 위험기상 원문 item → 고도 밴드(ft). 위험기상을 고도로 거르는 모든 경로가 이 함수 하나를 쓴다.
export function hazardBandFt(item) {
  return bandToFt(item?.altitude) ?? (SURFACE_PHENOMENON_CODES.has(item?.phenomenon_code) ? SURFACE_BAND_FT : null)
}

// 항로 브리핑에 포함되는 위험기상 범위 — 항로 양쪽 30NM. 실제 EFB(ForeFlight)가 항로
// 브리핑 커버리지로 쓰는 값과 같다(FAA 표준 flight plan briefing corridor).
const HAZARD_CORRIDOR_NM = 30

function alignedRange(range, totalDistanceNm) {
  if (range?.status !== 'aligned') return null
  const startNm = Number(range.startNm)
  const endNm = Number(range.endNm)
  if (!Number.isFinite(startNm) || !Number.isFinite(endNm) || !(totalDistanceNm > 0)) return null
  return { startNm: Math.max(0, startNm), endNm: Math.min(totalDistanceNm, endNm) }
}

export function evaluateHorizontalExposure({ axis, geometry, enRouteRange = null } = {}) {
  if (!geometry || !Array.isArray(axis?.samples) || axis.samples.length === 0) {
    return { status: HORIZONTAL_EXPOSURE.UNAVAILABLE, intervals: [] }
  }
  const interval = routeCorridorInGeometry(axis, geometry, HAZARD_CORRIDOR_NM)
  if (!interval.entered) return { status: HORIZONTAL_EXPOSURE.CLEAR, intervals: [] }

  const range = alignedRange(enRouteRange, axis.totalDistanceNm)
  const startNm = range ? Math.max(interval.startNm, range.startNm) : interval.startNm
  const endNm = range ? Math.min(interval.endNm, range.endNm) : interval.endNm
  if (endNm < startNm) return { status: HORIZONTAL_EXPOSURE.CLEAR, intervals: [] }
  return { status: HORIZONTAL_EXPOSURE.INTERSECTS, intervals: [{ startNm, endNm }] }
}

export function evaluateAltitudeExposure({ horizontalExposure, bandFt, plannedCruiseAltitudeFt } = {}) {
  if (horizontalExposure?.status !== HORIZONTAL_EXPOSURE.INTERSECTS || !bandFt) {
    return { status: ALTITUDE_EXPOSURE.UNKNOWN }
  }
  const altitudeFt = Number(plannedCruiseAltitudeFt)
  if (!(altitudeFt > 0)) return { status: ALTITUDE_EXPOSURE.UNKNOWN }
  return {
    status: altitudeFt >= bandFt.lowFt && altitudeFt <= bandFt.highFt
      ? ALTITUDE_EXPOSURE.INTERSECTS
      : ALTITUDE_EXPOSURE.CLEAR,
  }
}

// null means a complete, known time comparison found no overlap; the caller omits that hazard.
export function evaluateTimeStatus({ etd, eta, validFrom, validTo } = {}) {
  if (!Number.isFinite(Date.parse(etd)) || !Number.isFinite(Date.parse(eta))) return TIME_STATUS.NOT_PROVIDED
  if (!Number.isFinite(Date.parse(validFrom)) || !Number.isFinite(Date.parse(validTo))) return TIME_STATUS.UNAVAILABLE
  return timeWindowsOverlap(etd, eta, validFrom, validTo) ? TIME_STATUS.MATCHED : null
}

export function exposureConfidence({ horizontalExposure, altitudeExposure, timeStatus } = {}) {
  if (horizontalExposure?.status === HORIZONTAL_EXPOSURE.UNAVAILABLE) return CONFIDENCE.UNAVAILABLE
  return altitudeExposure?.status === ALTITUDE_EXPOSURE.UNKNOWN || timeStatus !== TIME_STATUS.MATCHED
    ? CONFIDENCE.PARTIAL
    : CONFIDENCE.AVAILABLE
}
