import { gridIndexFor } from './cross-section-sampler.js'
import { KIM_NWP_LEVELS, decodeComponent } from '../processors/kim-nwp-model.js'
import { readKimGktgIndex, readKimGktgField } from '../processors/kim-nwp-store.js'

// Keep native pressure layers and sample the height from the identical calculation input.
// The ktg member remains a transport compatibility alias; product identifies its thresholds.
export function loadGktgCrossSection({ root, axis, validTime, timeRules = null, domain }) {
  const index = readKimGktgIndex(root, domain)
  if (!index) return { available: false, product: 'GKTG' }
  const time = index.times.find(t => t.validTime === validTime)
  if (!time && !timeRules) return { available: false, product: 'GKTG', reason: 'gktg_time_unavailable' }
  const levels = []
  for (const level of KIM_NWP_LEVELS.filter(l => l.kind === 'pressure')) {
    const cache = new Map()
    const values = axis.samples.map(sample => {
      let target = time
      if (timeRules) {
        const segment = timeRules.segments.findLast(s => sample.distanceNm >= s.startDistanceNm)
        target = index.times.find(t => t.validTime === segment?.kim?.validTime)
      }
      const missing = { distanceNm: sample.distanceNm, altFt: null, gktg: null, ktg: null, sourceHf: target?.hf ?? null }
      if (!target) return missing
      const entry = index.availability?.[level.id]?.[String(target.hf)]
      if (!entry?.hashes?.gktg) return missing
      if (!cache.has(target.hf)) {
        try { cache.set(target.hf, readKimGktgField({ root, tmfc: index.latestRun, hf: target.hf, levelId: level.id, revision: entry.hashes.gktg, domain })) } catch { cache.set(target.hf, null) }
      }
      const field = cache.get(target.hf)
      if (!field || sample.lon < field.grid.lonMin || sample.lon > field.grid.lonMax || sample.lat < field.grid.latMin || sample.lat > field.grid.latMax) return missing
      const i = gridIndexFor(field.grid, sample.lon, sample.lat)
      if (i == null || !Number.isFinite(field.gktg[i])) return missing
      const meters = decodeComponent([field.geopotentialHeight[i]], field.geopotentialHeightEncoding)[0]
      if (!Number.isFinite(meters)) return missing
      return { ...missing, altFt: meters * 3.28084, gktg: field.gktg[i], ktg: field.gktg[i] }
    })
    const validHeights = values.filter(v => Number.isFinite(v.altFt)).map(v => v.altFt)
    levels.push({ pressure: level.value, levelId: level.id, altFt: validHeights.length ? validHeights.reduce((a, b) => a + b, 0) / validHeights.length : null, values })
  }
  if (timeRules) timeRules.segments.forEach(segment => { segment.ktg = index.times.find(t => t.validTime === segment.kim?.validTime) || null; segment.gktg = segment.ktg })
  return { available: levels.some(l => l.values.some(v => Number.isFinite(v.gktg))), product: 'GKTG', levels, algorithm: index.algorithm,
    run: { tmfc: index.latestRun, hf: time?.hf ?? null, validTime: time?.validTime ?? validTime, revision: index.revision, product: 'GKTG' } }
}
