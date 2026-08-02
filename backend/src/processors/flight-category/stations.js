import config from '../../config.js'
import { maskCeilingWithCtps, sampleCeilingAt } from './ceiling-kim.js'

/**
 * Parse ASOS timestamp to get age in milliseconds.
 * tm format: YYYYMMDDHHmm (KST).
 */
function getAsosTmAgeMs(tmStr) {
  if (!tmStr || tmStr.length < 12) return Infinity
  const y = parseInt(tmStr.slice(0, 4))
  const m = parseInt(tmStr.slice(4, 6)) - 1
  const d = parseInt(tmStr.slice(6, 8))
  const h = parseInt(tmStr.slice(8, 10))
  const min = parseInt(tmStr.slice(10, 12))
  const kstDate = new Date(Date.UTC(y, m, d, h, min, 0))
  // Convert KST to UTC by subtracting 9 hours
  const utcDate = new Date(kstDate.getTime() - 9 * 3600 * 1000)
  return Date.now() - utcDate.getTime()
}

/**
 * Sample the KIM ceiling grid at a lat/lon point. Returns metres, or -1.
 *
 * 보간하지 않고 그 지점이 속한 칸 하나를 그대로 읽는다. 면을 그리는
 * `buildCeilingGeoJson`도 칸 단위로 밴드를 나누므로, 보간하면 지점이 면과
 * 다른 값을 말하게 된다. 이 지점 표시의 목적 자체가 면과 관측을 견주는
 * 것이라 둘의 기준이 어긋나면 쓸모가 없다.
 *
 * 운고 격자에는 -1(운고 없음)이 섞여 있어 보간은 애초에 성립하지 않는다.
 * -1과 300을 섞으면 아무 뜻도 없는 숫자가 나온다.
 */
function sampleKimCeiling(kimCeiling, lat, lon) {
  if (!kimCeiling?.grid || !kimCeiling.ceilingM) return -1
  return sampleCeilingAt(kimCeiling.ceilingM, kimCeiling.grid, lat, lon)
}

/**
 * Merge ASOS and AMOS ceiling observations with KIM model ceiling.
 * Returns array of { id, name, source, lat, lon, ceiling_ft, model_ceiling_ft, diff_ft }.
 */
export function buildStations({ asos, amos, kimCeiling, ctpsMask }) {
  const stations = []
  // 좌표가 정확히 같은 경우는 없으므로 근접 판정을 쓴다. 공항과 그 도시의
  // ASOS 관측소는 몇 km 떨어져 있어 좌표 문자열로는 절대 겹치지 않는다.
  const NEAR_KM = 2
  const isNear = (lat, lon) => stations.some((s) =>
    Math.hypot((s.lat - lat) * 111, (s.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180)) < NEAR_KM)

  // Apply satellite mask to KIM ceiling
  const maskedCeilingM = kimCeiling ? maskCeilingWithCtps(kimCeiling.ceilingM, kimCeiling.grid, ctpsMask) : null

  // AMOS를 먼저 넣는다 — 겹치면 공항 관측을 남기라는 것이 스펙 §5.4다.
  // ASOS를 먼저 넣으면 정반대가 된다.
  addAmos()
  addAsos()
  return stations

  function addAsos() {
  if (asos && asos.stations && Array.isArray(asos.stations)) {
    // Check if ASOS data is not too old (older than 2 hours)
    const ageMs = getAsosTmAgeMs(asos.tm)
    const twoHoursMs = 2 * 60 * 60 * 1000
    if (ageMs < twoHoursMs) {
      for (const sta of asos.stations) {
        if (isNear(sta.lat, sta.lon)) continue // 같은 자리에 AMOS가 이미 있다

        // Sample model ceiling (from masked grid)
        let modelCeilingFt = null
        if (maskedCeilingM && kimCeiling) {
          const modelM = sampleKimCeiling({ ...kimCeiling, ceilingM: maskedCeilingM }, sta.lat, sta.lon)
          if (modelM >= 0) {
            modelCeilingFt = Math.round(modelM * 3.28084)
          }
        }

        // sta.ceiling_ft가 null(구름 없음)이면 잴 운고가 없다 — diff도 없다.
        // null - modelCeilingFt는 JS에서 0으로 강제 변환돼 -modelCeilingFt라는
        // 지어낸 값이 나가 버린다.
        const diffFt = modelCeilingFt !== null && sta.ceiling_ft !== null ? sta.ceiling_ft - modelCeilingFt : null

        stations.push({
          id: `asos_${sta.stn}`,
          name: sta.name,
          source: 'ASOS',
          lat: sta.lat,
          lon: sta.lon,
          ceiling_ft: sta.ceiling_ft,
          model_ceiling_ft: modelCeilingFt,
          diff_ft: diffFt,
          sky_clear: sta.sky_clear ?? false,
          visibility_m: sta.visibility_m ?? null,
          obs_tm: asos.tm,
        })
      }
    }
  }
  }

  function addAmos() {
  if (amos && amos.airports && typeof amos.airports === 'object') {
    for (const [icao, airport] of Object.entries(amos.airports)) {
      const cloudMinM = airport?.observation?.cloud_min_m
      if (typeof cloudMinM !== 'number' || cloudMinM === -9) {
        continue // 결측 — 관측소가 값을 못 내고 있다, 그리지 않는다
      }
      // NSC(>=25000 ft 환산)는 ASOS와 같은 기준으로 구름 없음(초록)으로 남긴다.
      const skyClear = Math.round(cloudMinM * 3.28084) >= 25000

      // config.airports는 ICAO를 키로 갖는 객체가 아니라 배열이다.
      // `config.airports[icao]`로 찾으면 전부 undefined가 되어 AMOS가 통째로 빠진다.
      const airportInfo = config.airports.find((a) => a.icao === icao)
      if (!airportInfo?.lat || !airportInfo?.lon) {
        console.warn(`flight-cat: ICAO ${icao} not in config.airports`)
        continue
      }

      const lat = airportInfo.lat
      const lon = airportInfo.lon
      const name = airportInfo.nameKo || airportInfo.name || icao

      if (isNear(lat, lon)) continue

      // Convert AMOS ceiling from metres to feet. NSC는 잴 운고가 없다 — ASOS와
      // 같이 ceiling_ft를 null로 둔다(sky_clear로 표시).
      const ceilingFt = skyClear ? null : Math.round(cloudMinM * 3.28084)

      // Sample model ceiling (from masked grid)
      let modelCeilingFt = null
      if (maskedCeilingM && kimCeiling) {
        const modelM = sampleKimCeiling({ ...kimCeiling, ceilingM: maskedCeilingM }, lat, lon)
        if (modelM >= 0) {
          modelCeilingFt = Math.round(modelM * 3.28084)
        }
      }

      const diffFt = modelCeilingFt !== null && ceilingFt !== null ? ceilingFt - modelCeilingFt : null

      stations.push({
        id: `amos_${icao}`,
        name,
        source: 'AMOS',
        lat,
        lon,
        ceiling_ft: ceilingFt,
        model_ceiling_ft: modelCeilingFt,
        diff_ft: diffFt,
        sky_clear: skyClear,
        // 활주로 좌/우 시정 중 어느 쪽을 대표값으로 쓸지는 이번 범위 밖이다
        // (스펙 §5). 값을 지어내지 않고 null로 둔다.
        visibility_m: null,
        obs_tm: airport?.observation?.observed_tm_kst ?? null,
      })
    }
  }
  }
}
