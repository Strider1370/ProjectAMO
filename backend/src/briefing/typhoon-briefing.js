// 태풍을 브리핑 hazard 항목으로 바꾸는 어댑터.
// 경로 판정 자체는 기존 hazard-exposure를 그대로 쓴다 — 새 판정 로직을 만들지 않는다.
// 고도는 판정하지 않는다: 기상청 반경은 지상풍 기준이라 순항고도에 적용하면 틀린다(스펙 §3).
import * as turf from '@turf/turf'
import { judgementPolygon } from './typhoon-geometry.js'
import { isSameRow } from '../parsers/typhoon-parser.js'
import { evaluateHorizontalExposure, evaluateTimeStatus } from './hazard-exposure.js'
import { HORIZONTAL_EXPOSURE, TIME_STATUS, CONFIDENCE } from '../../../shared/briefing-status.js'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_STEP_HOURS = 6

// 예보 간격은 태풍마다 다르다 — 힌남노 6시간, 2026년 12호 노을 12시간(스펙 §2).
// 상수로 박으면 12시간 간격 태풍에서 시점 사이에 구멍이 생겨 그 시간대 항공기가 안 걸린다.
export function stepHoursOf(rows = []) {
  const leads = [...new Set(rows.filter((r) => r.forecast).map((r) => r.leadHours))].sort((a, b) => a - b)
  let step = Infinity
  for (let i = 1; i < leads.length; i++) step = Math.min(step, leads[i] - leads[i - 1])
  return Number.isFinite(step) && step > 0 ? step : DEFAULT_STEP_HOURS
}

function windowOf(validAt, stepHours) {
  const ms = Date.parse(validAt)
  if (!Number.isFinite(ms)) return null
  const half = (stepHours / 2) * HOUR_MS
  return { from: new Date(ms - half).toISOString(), to: new Date(ms + half).toISOString() }
}

// 좌표가 없는 공항은 "안 걸림"이 아니라 "모름"이다. shared/airports.js는 국내 15개뿐이라
// 해외 도착지(VHHH 등)는 좌표가 없다. 조용히 clear로 바꾸는 것은 스펙 §11 금지사항이다.
function airportsInside(geometry, airports) {
  const hit = []
  const unknown = []
  for (const airport of airports ?? []) {
    if (!Number.isFinite(airport?.lat) || !Number.isFinite(airport?.lon)) {
      unknown.push(airport?.icao)
      continue
    }
    if (turf.booleanPointInPolygon(turf.point([airport.lon, airport.lat]), geometry)) hit.push(airport.icao)
  }
  return { hit, unknown }
}

export function matchTyphoonHazards({ typhoons = [], axis, etd, eta, enRouteRange = null, airports = [] }) {
  const hazards = []
  for (const typhoon of typhoons) {
    let startNm = Infinity
    let endNm = -Infinity
    let from = null
    let to = null
    let timeStatus = null
    let horizontalExposure = null
    let missingGeometry = false
    const airportHits = new Set()
    const unknownAirports = new Set()
    const stepHours = stepHoursOf(typhoon.rows)

    for (const row of typhoon.rows ?? []) {
      // 스펙 §10은 "예보 시점마다"다. 지나온 분석 행까지 돌면 이미 지나간 위치를 보고하게 되고,
      // 힌남노 기준 태풍당 39번 회랑 스캔이 돈다. 현재 위치와 예보만 본다.
      if (!row.forecast && !isSameRow(row, typhoon.current)) continue
      const geometry = judgementPolygon(row)
      if (!geometry) { missingGeometry = true; continue }
      const window = windowOf(row.validAt, stepHours)
      if (!window) continue

      const exposure = evaluateHorizontalExposure({ axis, geometry, enRouteRange })
      const { hit: hitAirports, unknown } = airportsInside(geometry, airports)
      unknown.forEach((icao) => { if (icao) unknownAirports.add(icao) })
      const routeHit = exposure.status === HORIZONTAL_EXPOSURE.INTERSECTS
      if (!routeHit && hitAirports.length === 0) continue

      // 시간이 확실히 어긋나면(null) 그 시점은 채택하지 않는다.
      const status = evaluateTimeStatus({ etd, eta, validFrom: window.from, validTo: window.to })
      if (status === null) continue

      if (routeHit) {
        horizontalExposure = exposure
        startNm = Math.min(startNm, exposure.intervals[0].startNm)
        endNm = Math.max(endNm, exposure.intervals[0].endNm)
      }
      hitAirports.forEach((icao) => airportHits.add(icao))
      from = from === null || window.from < from ? window.from : from
      to = to === null || window.to > to ? window.to : to
      timeStatus = status === TIME_STATUS.MATCHED ? TIME_STATUS.MATCHED : (timeStatus ?? status)
    }

    // 반경 자료가 전부 결측이라 판정 자체를 못 한 태풍은 조용히 사라지면 안 된다(스펙 §11).
    if (from === null) {
      if (missingGeometry) {
        hazards.push({
          source: 'TYPHOON', sourceId: `${typhoon.year}-${typhoon.number}-${typhoon.seq}`, code: 'TC',
          label: typhoon.name ? `${typhoon.number}호 태풍 ${typhoon.name}` : `${typhoon.number}호 태풍`,
          typhoonNumber: typhoon.number, seq: typhoon.seq, analyzedAt: typhoon.analyzedAt,
          validFrom: null, validTo: null, onRoute: false, encounter: 'nearby',
          verticalKnown: false, bandFt: null, routeIntervalNm: null,
          airports: [], airportsUnknown: [...unknownAirports],
          horizontalExposure: { status: HORIZONTAL_EXPOSURE.UNAVAILABLE, intervals: [] },
          timeStatus: TIME_STATUS.UNAVAILABLE,
          confidence: CONFIDENCE.UNAVAILABLE,
        })
      }
      continue
    }

    const onRoute = Number.isFinite(startNm) && Number.isFinite(endNm) && endNm >= startNm
    hazards.push({
      source: 'TYPHOON',
      sourceId: `${typhoon.year}-${typhoon.number}-${typhoon.seq}`,
      code: 'TC',
      // 이름은 typ_lst에서 온다. 못 받았으면 번호만으로 표시한다.
      label: typhoon.name ? `${typhoon.number}호 태풍 ${typhoon.name}` : `${typhoon.number}호 태풍`,
      typhoonNumber: typhoon.number,
      seq: typhoon.seq,
      analyzedAt: typhoon.analyzedAt,
      validFrom: from,
      validTo: to,
      onRoute,
      encounter: onRoute ? 'on' : 'nearby',
      // 지상풍 기준 반경이므로 고도 비교를 하지 않는다. 임의 밴드를 부여하지 않는다.
      verticalKnown: false,
      bandFt: null,
      routeIntervalNm: onRoute ? { startNm, endNm } : null,
      airports: [...airportHits],
      // 좌표를 못 찾아 판정하지 못한 공항. 빈 배열이 아니면 화면이 "확인 불가"로 표시한다.
      airportsUnknown: [...unknownAirports],
      horizontalExposure: horizontalExposure ?? { status: HORIZONTAL_EXPOSURE.CLEAR, intervals: [] },
      timeStatus,
      // 고도를 모르므로 확신도는 항상 부분 확인이다.
      confidence: CONFIDENCE.PARTIAL,
    })
  }
  return hazards
}

export default { matchTyphoonHazards }
