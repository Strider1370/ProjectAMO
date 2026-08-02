// 운고 밴드 경계는 백엔드 CEILING_BANDS와 같은 값(450 m, 900 m)을 피트로 환산한 것이다.
// 미터 값을 피트와 그대로 비교하면 300 m(984 ft) 운고가 안전한 것으로 뒤집힌다 —
// 백엔드 Task 9에서 실제로 났던 오류다.
const M_TO_FT = 3.28084
export const LOW_FT = 450 * M_TO_FT      // 1476
export const MID_FT = 900 * M_TO_FT      // 2953
export const RING_MIN_DIFF_FT = 200

export function band(ceilFt) {
  if (!Number.isFinite(ceilFt) || ceilFt < 0) return 'missing'
  if (ceilFt < LOW_FT) return 'low'
  if (ceilFt <= MID_FT) return 'mid'
  return 'high'
}

const FILL_BY_BAND = { low: 'severe', mid: 'caution', high: 'good', missing: 'none' }
const BAND_ORDER = { low: 0, mid: 1, high: 2, missing: 3 }

/**
 * 지점 표식의 색과 테두리.
 *
 * 테두리는 "화면이 실제보다 안전해 보이는" 경우에만 붙인다. 모델이 더 보수적인
 * 방향은 안전 문제가 아니므로 붙이지 않는다.
 */
export function stationMarkerStyle(station) {
  const obs = station?.ceiling_ft
  // sky_clear는 CH_MIN 결측(-9)과 전운량 0이 겹친, 구름이 없다는 확인이다 — 'missing'이 아니라
  // 'high'와 같은 초록으로 다룬다. band()만으로는 null인 ceiling_ft를 'missing'으로 읽어버린다.
  const obsBand = station?.sky_clear ? 'high' : band(obs)
  const fill = FILL_BY_BAND[obsBand]

  // sky_clear 관측은 "구름이 없다"는 확인이지 모델보다 낮은 값이 아니다 — 차이 비교 자체가
  // 성립하지 않으므로 테두리를 붙이지 않는다(spec §2 "흰 테두리는 초록 점에는 붙지 않는다").
  if (station?.sky_clear) {
    return { fill, ring: false }
  }

  const modelBand = band(station?.model_ceiling_ft)

  // 모델이 "구름 없음"이면 차이를 계산할 수 없다. 관측이 운항에 걸리는 높이일 때만 붙인다.
  // 결측 판정을 band() 하나로만 하여 관측·모델이 같은 정의를 쓰게 한다.
  if (modelBand === 'missing') {
    return { fill, ring: obsBand === 'low' || obsBand === 'mid' }
  }

  const lowerByBand = BAND_ORDER[obsBand] < BAND_ORDER[modelBand]
  return { fill, ring: lowerByBand && station.model_ceiling_ft - obs > RING_MIN_DIFF_FT }
}

/**
 * 관측값도 없고 sky_clear도 아닌 지점은 뺀다 — 그리면 고장난 관측소가 "OK"로 읽힌다.
 * sky_clear 지점은 ceiling_ft가 null이어도 남긴다(구름 없음 확인, 결측이 아니다).
 */
export function toStationFeatures(stations) {
  return {
    type: 'FeatureCollection',
    features: (stations ?? [])
      .filter((s) => s?.sky_clear || band(s?.ceiling_ft) !== 'missing')
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id, name: s.name, source: s.source,
          ceiling_ft: s.ceiling_ft, model_ceiling_ft: s.model_ceiling_ft,
          sky_clear: s.sky_clear, visibility_m: s.visibility_m, obs_tm: s.obs_tm,
          ...stationMarkerStyle(s),
        },
      })),
  }
}
