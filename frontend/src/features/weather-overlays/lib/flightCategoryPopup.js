import { stationMarkerStyle } from './flightCategoryStations.js'

const NO_DATA = '자료 없음'
const VIS_BAND_KO = { severe: '기준 크게 미달', below: '기준 미달', marginal: '여유 적음', clear: '기준 충족', missing: NO_DATA }

/** 모델 층 간격이 200~250 m다. 100 ft 단위로 낮춰 없는 정밀도를 주장하지 않는다. */
function ceilingText(ft) {
  if (!Number.isFinite(ft)) return NO_DATA
  return `약 ${(Math.round(ft / 100) * 100).toLocaleString('en-US')} ft`
}

export function formatPointLines(point) {
  const lines = [
    {
      label: '시정',
      value: Number.isFinite(point?.vis_m) ? `${point.vis_m.toLocaleString('en-US')} m` : NO_DATA,
      note: VIS_BAND_KO[point?.vis_band] ?? null,
      alert: false,
    },
    { label: '운고', value: ceilingText(point?.ceil_ft), note: '모델', alert: false },
  ]

  const stn = point?.nearest_station
  if (stn && Number.isFinite(stn.ceiling_ft)) {
    // 강조 여부를 지도 표식과 같은 함수로 정한다. 규칙을 두 벌 만들면
    // 점은 조용한데 말풍선만 빨개지는 어긋남이 생긴다.
    lines.push({
      label: '',
      value: `${stn.ceiling_ft.toLocaleString('en-US')} ft`,
      // 거리를 항상 적는다 — 멀면 그 값이 이 지점을 대표하지 못한다.
      note: `${stn.name} ${stn.distance_km} km`,
      alert: stationMarkerStyle(stn).ring,
    })
  }

  lines.push({
    label: '추세',
    value: Number.isFinite(point?.vis_trend)
      ? `지난 3시간 ${point.vis_trend > 0 ? '+' : '−'}${Math.abs(point.vis_trend).toLocaleString('en-US')} m`
      : NO_DATA,
    note: null,
    alert: false,
  })

  return lines
}
