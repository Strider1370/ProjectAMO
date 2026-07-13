// 지도 도구 계산 헬퍼 — turf(대권 거리/면적/원/방위) + WMM 자편각.
// 모든 좌표는 [lng, lat] (GeoJSON 순서). 거리는 해리(nm), 면적은 km², 방위는 도(0~360).
import distance from '@turf/distance'
import area from '@turf/area'
import circle from '@turf/circle'
import bearing from '@turf/bearing'
import { point, polygon } from '@turf/helpers'
import geomagnetism from 'geomagnetism'

export const KM_PER_NM = 1.852

/** 두 점 [lng,lat] 사이 대권 거리(nm). */
export function distanceNm(a, b) {
  return distance(point(a), point(b), { units: 'kilometers' }) / KM_PER_NM
}

/** 폴리라인 [[lng,lat],...] 총 길이(nm). 2점 미만이면 0. */
export function pathLengthNm(coords) {
  let total = 0
  for (let i = 1; i < coords.length; i += 1) total += distanceNm(coords[i - 1], coords[i])
  return total
}

/** 폴리곤 외곽링 [[lng,lat],...] 면적(km²). 자동 폐합. 3점 미만이면 0. */
export function areaKm2(ring) {
  if (!ring || ring.length < 3) return 0
  const closed = [...ring, ring[0]]
  return area(polygon([closed])) / 1e6
}

/** a→b 초기 대권 방위, 진북 기준 0~360. */
export function trueBearing(a, b) {
  return (bearing(point(a), point(b)) + 360) % 360
}

/** 지점 [lng,lat]의 자편각(도, 동편차 +). 한국은 음수(서편차). */
export function declinationAt([lng, lat], date = new Date()) {
  return geomagnetism.model(date).point([lat, lng]).decl
}

/**
 * a→b 자북 방위(0~360). 자북 = 진북 − 자편각(동편차 +).
 * 한국은 자편각 약 −9°(서편차)라 자북 = 진북 + 9° 근처. 시작점 a 기준.
 */
export function magneticBearing(a, b, date = new Date()) {
  const tn = trueBearing(a, b)
  const decl = declinationAt(a, date)
  return ((tn - decl) % 360 + 360) % 360
}

/** 중심 [lng,lat] + 반경(nm) → 원 폴리곤 GeoJSON Feature. */
export function ringPolygon(center, radiusNm, props = {}) {
  const f = circle(point(center), radiusNm * KM_PER_NM, { units: 'kilometers', steps: 128 })
  f.properties = { ...props }
  return f
}
