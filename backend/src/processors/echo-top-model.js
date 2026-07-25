// 18 dBZ Echo Top 재산출 — 순수 계산만. 파일 I/O·네트워크 없음.
// 표준 4/3 지구반경 빔 기하를 쓰며, 유효한 상부 bracket이 없으면 절대 외삽하지 않는다.
const DEG2RAD = Math.PI / 180

export const EARTH_RADIUS_4_3_M = (4 / 3) * 6371008.8

export const ECHO_TOP_QUALITY = Object.freeze({
  INTERPOLATED: 0,       // 위쪽 유효 관측과의 18 dBZ 교차 고도를 선형 보간한 값.
  BEAM_CENTER_FLOOR: 1,  // 상부 bracket이 없어 최고 18 dBZ 빔 중심을 보수적 하한으로 쓴 값.
  INVALID: 255,
})

export function beamHeightMsl(rangeM, elevationDeg, radarAltitudeM = 0) {
  const r = Number(rangeM)
  const re = EARTH_RADIUS_4_3_M
  const sinEl = Math.sin(Number(elevationDeg) * DEG2RAD)
  return Math.sqrt(r * r + re * re + 2 * r * re * sinEl) - re + Number(radarAltitudeM || 0)
}

// samples: 같은 방위·거리 column의 유효 관측, 고도 오름차순. { heightM, dbz }
export function echoTopFromColumn(samples, { thresholdDbz = 18 } = {}) {
  if (!Array.isArray(samples) || samples.length === 0) return null

  let topIndex = -1
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    if (samples[i].dbz >= thresholdDbz) { topIndex = i; break }
  }
  if (topIndex === -1) return null

  const top = samples[topIndex]
  const above = samples[topIndex + 1]
  // 위쪽 유효 관측이 임계 미만이어야만 교차 고도를 보간할 수 있다.
  if (above && above.dbz < thresholdDbz && above.heightM > top.heightM) {
    const fraction = (top.dbz - thresholdDbz) / (top.dbz - above.dbz)
    return {
      heightM: top.heightM + fraction * (above.heightM - top.heightM),
      quality: ECHO_TOP_QUALITY.INTERPOLATED,
    }
  }
  return { heightM: top.heightM, quality: ECHO_TOP_QUALITY.BEAM_CENTER_FLOOR }
}
