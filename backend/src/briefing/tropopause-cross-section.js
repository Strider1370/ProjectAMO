import { gridIndexFor } from './cross-section-sampler.js'
import { readKimTropopauseIndex, readKimTropopauseField, readKimTropopauseUpper } from '../processors/kim-nwp-store.js'

// ISA 기압고도(ft). FL은 기압고도이므로 지오퍼텐셜고도가 아니라 기압에서 바로 환산한다.
// 단면 차트는 지오퍼텐셜 고도 축이므로 *Hpa 값으로 같은 층 고도에 보간해 그린다.
export function pressureAltitudeFt(hPa) {
  if (!Number.isFinite(hPa) || hPa <= 0) return null
  const meters = hPa >= 226.32 ? 44330.8 * (1 - (hPa / 1013.25) ** 0.190263) : 11000 + 6341.6 * Math.log(226.32 / hPa)
  return meters / 0.3048
}

// 항로 표본점의 권계면·연직 최대풍. 같은 유효시각 결과만 읽고 다른 시각으로 채우지 않는다.
export function loadTropopauseCrossSection({ root, axis, validTime, timeRules = null, domain }) {
  const index = readKimTropopauseIndex(root, domain)
  if (!index) return { available: false, product: 'TROP_JET' }
  const time = index.times.find(t => t.validTime === validTime)
  if (!time && !timeRules) return { available: false, product: 'TROP_JET', reason: 'tropopause_time_unavailable' }
  const cache = new Map()
  const fieldFor = target => {
    if (!cache.has(target.hf)) {
      try { cache.set(target.hf, readKimTropopauseField({ root, tmfc: index.latestRun, hf: target.hf, revision: target.revision, domain })) } catch { cache.set(target.hf, null) }
    }
    return cache.get(target.hf)
  }
  const samples = (axis?.samples ?? []).map(sample => {
    let target = time
    if (timeRules) {
      const segment = timeRules.segments.findLast(s => sample.distanceNm >= s.startDistanceNm)
      target = index.times.find(t => t.validTime === segment?.kim?.validTime)
    }
    const missing = { distanceNm: sample.distanceNm, tropopauseHpa: null, tropopauseFt: null, tropopauseAboveTop: false, maxWindKt: null, maxWindHpa: null, maxWindFt: null, sourceHf: target?.hf ?? null }
    if (!target) return missing
    const field = fieldFor(target)
    if (!field || sample.lon < field.grid.lonMin || sample.lon > field.grid.lonMax || sample.lat < field.grid.latMin || sample.lat > field.grid.latMax) return missing
    const i = gridIndexFor(field.grid, sample.lon, sample.lat)
    if (i == null) return missing
    return {
      ...missing,
      tropopauseHpa: Number.isFinite(field.trop[i]) ? field.trop[i] : null,
      tropopauseFt: pressureAltitudeFt(field.trop[i]),
      tropopauseAboveTop: field.tropAboveTop[i] === 1,
      maxWindKt: Number.isFinite(field.vmax[i]) ? field.vmax[i] : null,
      maxWindHpa: Number.isFinite(field.pmax[i]) ? field.pmax[i] : null,
      maxWindFt: pressureAltitudeFt(field.pmax[i]),
    }
  })
  // 상층(100·70 hPa) 바람·기온: 단면의 상층 등풍속선용. 기존 21층 단면에는 섞지 않는다.
  const upperCache = new Map()
  const upperFor = target => {
    if (!upperCache.has(target.hf)) {
      try { upperCache.set(target.hf, readKimTropopauseUpper({ root, tmfc: index.latestRun, hf: target.hf, revision: target.revision, domain })) } catch { upperCache.set(target.hf, null) }
    }
    return upperCache.get(target.hf)
  }
  const upperLevels = [100, 70].map(pressure => {
    const values = (axis?.samples ?? []).map(sample => {
      let target = time
      if (timeRules) {
        const segment = timeRules.segments.findLast(s => sample.distanceNm >= s.startDistanceNm)
        target = index.times.find(t => t.validTime === segment?.kim?.validTime)
      }
      const empty = { distanceNm: sample.distanceNm, altFt: null, t: null, u: null, v: null }
      const upper = target && upperFor(target)
      const level = upper?.levels?.find(l => l.pressure === pressure)
      if (!level || sample.lon < upper.grid.lonMin || sample.lon > upper.grid.lonMax || sample.lat < upper.grid.latMin || sample.lat > upper.grid.latMax) return empty
      const i = gridIndexFor(upper.grid, sample.lon, sample.lat)
      if (i == null) return empty
      return { ...empty, altFt: level.hgt[i] * 3.28084, t: level.T[i] - 273.15, u: level.u[i], v: level.v[i] }
    })
    const heights = values.map(v => v.altFt).filter(Number.isFinite)
    return { pressure, altFt: heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : null, values }
  }).filter(level => level.values.some(v => Number.isFinite(v.u)))
  return {
    upperLevels,
    available: samples.some(s => Number.isFinite(s.tropopauseFt) || s.tropopauseAboveTop),
    product: 'TROP_JET', algorithm: index.algorithm, samples,
    run: { tmfc: index.latestRun, hf: time?.hf ?? null, validTime: time?.validTime ?? validTime, revision: index.revision, product: 'TROP_JET' },
  }
}
