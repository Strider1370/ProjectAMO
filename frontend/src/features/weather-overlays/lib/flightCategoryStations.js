// 운고 밴드 경계는 백엔드 CEILING_BANDS와 같은 값(450 m, 900 m)을 피트로 환산한 것이다.
// 미터 값을 피트와 그대로 비교하면 300 m(984 ft) 운고가 안전한 것으로 뒤집힌다 —
// 백엔드 Task 9에서 실제로 났던 오류다.
const M_TO_FT = 3.28084
const LOW_FT = 450 * M_TO_FT      // 1476
const MID_FT = 900 * M_TO_FT      // 2953
const RING_MIN_DIFF_FT = 200

function band(ceilFt) {
  if (!Number.isFinite(ceilFt) || ceilFt < 0) return 'missing'
  if (ceilFt < LOW_FT) return 'low'
  if (ceilFt < MID_FT) return 'mid'
  return 'high'
}

const FILL_BY_BAND = { low: 'severe', mid: 'caution', high: 'none', missing: 'none' }
const BAND_ORDER = { low: 0, mid: 1, high: 2, missing: 3 }

/**
 * 지점 표식의 색과 테두리.
 *
 * 테두리는 "화면이 실제보다 안전해 보이는" 경우에만 붙인다. 모델이 더 보수적인
 * 방향은 안전 문제가 아니므로 붙이지 않는다.
 */
export function stationMarkerStyle(station) {
  const obs = station?.ceiling_ft
  const obsBand = band(obs)
  const fill = FILL_BY_BAND[obsBand]
  const modelBand = band(station?.model_ceiling_ft)

  // 모델이 "구름 없음"이면 차이를 계산할 수 없다. 관측이 운항에 걸리는 높이일 때만 붙인다.
  // 결측 판정을 band() 하나로만 하여 관측·모델이 같은 정의를 쓰게 한다.
  if (modelBand === 'missing') {
    return { fill, ring: obsBand === 'low' || obsBand === 'mid' }
  }

  const lowerByBand = BAND_ORDER[obsBand] < BAND_ORDER[modelBand]
  return { fill, ring: lowerByBand && station.model_ceiling_ft - obs > RING_MIN_DIFF_FT }
}

/** 관측값이 없는 지점은 뺀다 — 그리면 "구름 높음"과 구분되지 않는다. */
export function toStationFeatures(stations) {
  return {
    type: 'FeatureCollection',
    features: (stations ?? [])
      .filter((s) => band(s?.ceiling_ft) !== 'missing')
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id, name: s.name, source: s.source,
          ceiling_ft: s.ceiling_ft, model_ceiling_ft: s.model_ceiling_ft,
          ...stationMarkerStyle(s),
        },
      })),
  }
}
