// 18 dBZ Echo Top 재산출 — 순수 계산만. 파일 I/O·네트워크 없음.
// 표준 4/3 지구반경 빔 기하를 쓰며, 유효한 상부 bracket이 없으면 절대 외삽하지 않는다.
import { ECHO_TOP_GRID, echoTopIndexForLatLon } from '../lib/echo-top-grid.js'

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

const M_PER_DEG_LAT = 111320

// 레이더 중심 기준 (방위, 거리) → 위경도. 지표 투영이라 소규모 거리에서 평면 근사로 충분하다.
// ponytail: 평면 근사, 250 km 반경에서 격자 한 칸(2 km) 미만 오차. 정밀도가 문제되면 측지 직접해로 교체.
function offsetLatLon(lat, lon, azimuthDeg, groundRangeM) {
  const azimuth = azimuthDeg * DEG2RAD
  const north = groundRangeM * Math.cos(azimuth)
  const east = groundRangeM * Math.sin(azimuth)
  return {
    lat: lat + north / M_PER_DEG_LAT,
    lon: lon + east / (M_PER_DEG_LAT * Math.cos(lat * DEG2RAD)),
  }
}

export function computeSiteEchoTop(volume, { thresholdDbz = 18, grid = ECHO_TOP_GRID } = {}) {
  const size = grid.nx * grid.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(ECHO_TOP_QUALITY.INVALID)
  if (!volume?.sweeps?.length || !volume.rangeM?.length) return { heightM, quality }

  const sweeps = [...volume.sweeps].sort((a, b) => a.elevationDeg - b.elevationDeg)
  const gateCount = volume.rangeM.length
  // 방위 인덱스는 sweep마다 ray 수가 다를 수 있으므로 1도 단위로 정규화해 column을 맞춘다.
  const azimuthBins = 360

  // 빔 높이와 지면 거리는 bin과 무관하므로 미리 계산한다.
  // beamHeightMsl[gate][sweep] = beamHeightMsl(rangeM[gate], sweep.elevationDeg, radarAltitudeM)
  // groundRangeM[gate] = rangeM[gate] * cos(sweeps[0].elevationDeg)
  const beamHeightCache = new Float32Array(gateCount * sweeps.length)
  const groundRangeCache = new Float32Array(gateCount)
  for (let gate = 0; gate < gateCount; gate += 1) {
    const r = volume.rangeM[gate]
    if (Number.isFinite(r) && r > 0) {
      groundRangeCache[gate] = r * Math.cos(sweeps[0].elevationDeg * DEG2RAD)
      for (let s = 0; s < sweeps.length; s += 1) {
        beamHeightCache[gate * sweeps.length + s] = beamHeightMsl(r, sweeps[s].elevationDeg, volume.altitudeM)
      }
    }
  }

  for (let bin = 0; bin < azimuthBins; bin += 1) {
    // ray 인덱스는 gate와 무관하다 — bin마다 한 번만 찾는다.
    const rayIndexBySweep = new Int16Array(sweeps.length).fill(-1)
    for (let s = 0; s < sweeps.length; s += 1) {
      const sweep = sweeps[s]
      const rayCount = sweep.azimuthDeg.length
      if (!rayCount) continue
      for (let ray = 0; ray < rayCount; ray += 1) {
        if (Math.round(sweep.azimuthDeg[ray]) % 360 === bin) { rayIndexBySweep[s] = ray; break }
      }
    }

    for (let gate = 0; gate < gateCount; gate += 1) {
      const r = volume.rangeM[gate]
      if (!Number.isFinite(r) || r <= 0) continue

      const samples = []
      for (let s = 0; s < sweeps.length; s += 1) {
        const rayIndex = rayIndexBySweep[s]
        if (rayIndex === -1) continue
        const sweep = sweeps[s]
        const raw = sweep.dbz[rayIndex * gateCount + gate]
        if (raw === undefined || raw === sweep.fillValue) continue
        const dbz = raw * (sweep.scaleFactor ?? 1)
        if (!Number.isFinite(dbz)) continue
        const heightMsl = beamHeightCache[gate * sweeps.length + s]
        samples.push({ heightM: heightMsl, dbz })
      }
      if (!samples.length) continue

      const solved = echoTopFromColumn(samples, { thresholdDbz })
      if (!solved) continue

      const groundRange = groundRangeCache[gate]
      const { lat, lon } = offsetLatLon(volume.latitude, volume.longitude, bin, groundRange)
      const index = echoTopIndexForLatLon(lat, lon, grid)
      if (index === null) continue
      if (quality[index] === ECHO_TOP_QUALITY.INVALID || solved.heightM > heightM[index]) {
        heightM[index] = solved.heightM
        quality[index] = solved.quality
      }
    }
  }
  return { heightM, quality }
}

export function mergeSiteEchoTops(siteResults, { grid = ECHO_TOP_GRID } = {}) {
  const size = grid.nx * grid.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(ECHO_TOP_QUALITY.INVALID)
  const siteIndex = new Uint8Array(size).fill(255)

  for (let s = 0; s < siteResults.length; s += 1) {
    const site = siteResults[s]
    if (!site?.quality) continue
    for (let i = 0; i < size; i += 1) {
      if (site.quality[i] === ECHO_TOP_QUALITY.INVALID) continue
      if (quality[i] === ECHO_TOP_QUALITY.INVALID || site.heightM[i] > heightM[i]) {
        heightM[i] = site.heightM[i]
        quality[i] = site.quality[i]
        siteIndex[i] = s
      }
    }
  }
  return { heightM, quality, siteIndex }
}
