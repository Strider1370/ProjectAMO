// 관측 기호의 실제 외곽(반지름 7 + 흰 테두리의 절반 2)에 상태 고리를 이어 붙인다.
export const AIRPORT_STATION_RADIUS = 7
export const AIRPORT_STATION_HALO_WIDTH = 4
export const AIRPORT_STATE_RING_WIDTH = 1.5
export const AIRPORT_WARNING_RING_WIDTH = 2.5
export const AIRPORT_STATE_RING_GAP = 0.75
const SIZES = [[5, 0.78], [8, 0.92], [12, 1]]
export const AIRPORT_STATION_ICON_SIZE = ['interpolate', ['linear'], ['zoom'], ...SIZES.flat()]

export function airportStateRingRadius(outsideSelection = false) {
  return ['interpolate', ['linear'], ['zoom'], ...SIZES.flatMap(([zoom, scale]) => {
    const radius = (AIRPORT_STATION_RADIUS + AIRPORT_STATION_HALO_WIDTH / 2) * scale
    return [zoom, outsideSelection
      ? ['+', radius, ['case', ['boolean', ['get', 'selected'], false], AIRPORT_STATE_RING_WIDTH + AIRPORT_STATE_RING_GAP, 0]]
      : radius]
  })]
}

// 확산 원은 선택/경보 고리의 전체 외곽에서 출발한다. 줌만 참조해 매 프레임 소스 재계산을 피한다.
export function airportWarningPulseRadius(progress = 0) {
  const spread = 16 * progress
  const outerRings = AIRPORT_STATE_RING_WIDTH + AIRPORT_STATE_RING_GAP + AIRPORT_WARNING_RING_WIDTH
  return ['interpolate', ['linear'], ['zoom'], ...SIZES.flatMap(([zoom, scale]) =>
    [zoom, (AIRPORT_STATION_RADIUS + AIRPORT_STATION_HALO_WIDTH / 2) * scale + outerRings + spread])]
}
