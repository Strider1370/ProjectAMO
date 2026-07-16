export const HORIZONTAL_EXPOSURE = Object.freeze({
  INTERSECTS: 'intersects',
  NEARBY: 'nearby',
  CLEAR: 'clear',
  UNKNOWN: 'unknown',
  UNAVAILABLE: 'unavailable',
})

export const ALTITUDE_EXPOSURE = Object.freeze({
  INTERSECTS: 'intersects',
  CLEAR: 'clear',
  UNKNOWN: 'unknown',
  UNAVAILABLE: 'unavailable',
})

export const TIME_STATUS = Object.freeze({
  MATCHED: 'matched',
  NOT_PROVIDED: 'not_provided',
  UNAVAILABLE: 'unavailable',
})

export const CONFIDENCE = Object.freeze({
  AVAILABLE: 'available',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
})

export const VALIDATION_STATUS = Object.freeze({
  VALIDATED: 'validated',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
})

export const BRIEFING_EXCLUDED_FIELDS = Object.freeze([
  'tasKt',
  'groundSpeedKt',
  'headingDeg',
  'eta',
  'fuel',
  'recommended',
])

export const BRIEFING_STATUS_COPY = Object.freeze({
  intersects: '경로와 영역이 겹칩니다',
  nearby: '경로 인근입니다',
  clear: '경로 겹침이 확인되지 않았습니다',
  unknown: '경로 겹침을 판단하지 못했습니다',
  unavailable: '판단에 필요한 자료가 없습니다',
  matched: '계획 시간창과 자료 유효시간이 겹칩니다',
  not_provided: 'ETD/ETA가 없어 시간 판단을 하지 못했습니다',
  available: '자료가 준비되었습니다',
  partial: '일부 자료만 준비되었습니다',
  validated: '검증을 마쳤습니다',
})

export function isUnresolvedBriefingStatus(status) {
  return status === HORIZONTAL_EXPOSURE.UNKNOWN
    || status === HORIZONTAL_EXPOSURE.UNAVAILABLE
    || status === ALTITUDE_EXPOSURE.UNKNOWN
    || status === ALTITUDE_EXPOSURE.UNAVAILABLE
    || status === TIME_STATUS.NOT_PROVIDED
    || status === TIME_STATUS.UNAVAILABLE
}
