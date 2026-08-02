import { band, stationMarkerStyle } from './flightCategoryStations.js'

const NO_DATA = '자료 없음'
const VIS_BAND_KO = { severe: '기준 크게 미달', below: '기준 미달', marginal: '여유 적음', clear: '기준 충족', missing: NO_DATA }

/** 모델 층 간격이 200~250 m다. 100 ft 단위로 낮춰 없는 정밀도를 주장하지 않는다. */
function ceilingText(ft) {
  // "결측"의 정의를 band()와 공유한다 — 음수 센티널을 여기서 따로 판정하면
  // 지도와 말풍선이 서로 다른 값을 결측으로 본다.
  if (band(ft) === 'missing') return NO_DATA
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
  if (stn && band(stn.ceiling_ft) !== 'missing') {
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

/** ring 지점의 모델값·차이. modelBand가 missing이면 stationMarkerStyle과 같은 뜻으로
 * "모델이 구름 없음으로 봤다"이지 결측이 아니다 — 그 경우 차이를 셀 수 없다. */
function ringNote(station) {
  if (band(station?.model_ceiling_ft) === 'missing') return '모델 구름 없음'
  const diff = station.model_ceiling_ft - station.ceiling_ft
  return `${ceilingText(station.model_ceiling_ft)} · 차이 ${Math.round(diff).toLocaleString('en-US')} ft`
}

/** tm은 이미 KST 벽시계 시각이다(YYYYMMDDHHmm) — UTC로 파싱한 뒤 되돌리면 오히려
 * 틀린다. 자릿수만 그대로 읽는다. */
function obsTimeKst(tm) {
  if (typeof tm !== 'string' || tm.length < 12) return NO_DATA
  const hh = tm.slice(8, 10)
  const mm = tm.slice(10, 12)
  if (!/^\d\d$/.test(hh) || !/^\d\d$/.test(mm)) return NO_DATA
  return `${hh}:${mm}`
}

export function formatStationLines(station) {
  return [
    { label: '', value: `${station?.name ?? ''} (${station?.source ?? ''})`, note: null, alert: false },
    {
      label: '운고',
      // sky_clear는 ceiling_ft가 null이어도 "구름 없음" 확인이다 — band()로 재는 대신
      // 지도 표식과 같은 sky_clear 판정을 그대로 쓴다.
      value: station?.sky_clear ? '구름 없음' : ceilingText(station?.ceiling_ft),
      note: station?.ring ? ringNote(station) : null,
      alert: !!station?.ring,
    },
    {
      label: '시정',
      // 격자값이 아니라 이 관측소가 실측한 값이다(spec §3.1).
      value: Number.isFinite(station?.visibility_m) ? `${station.visibility_m.toLocaleString('en-US')} m` : NO_DATA,
      note: null,
      alert: false,
    },
    { label: '관측', value: obsTimeKst(station?.obs_tm), note: null, alert: false },
  ]
}
