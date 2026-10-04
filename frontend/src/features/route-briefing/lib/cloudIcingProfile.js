import { gktgBand } from '../../../../../shared/gktg.js'
import { pressureToFallbackFt } from './crossSectionGrid.js'
import { cloudSpreadColor } from '../../../shared/weather/cloudIcingPresentation.js'
import { cellRegionRings } from '../../../shared/weather/gridContours.js'

export function buildProfileCloudIcing(levels, xFor, yFor, altFor) {
  const cloud = [], icing = [], outlines = []
  if (levels.length < 2) return { cloud, icing, outlines }
  const nx = (levels[0]?.values?.length ?? 0) - 1, ny = levels.length - 1
  if (nx < 1) return { cloud, icing, outlines }
  const grades = []
  for (let y = 0; y < ny; y++) {
    const level = levels[y], next = levels[y + 1]
    const yA = yFor(altFor(level)), yB = yFor(altFor(next))
    for (let x = 0; x < nx; x++) {
      const v = level.values?.[x], after = level.values?.[x + 1]
      const grade = Number.isFinite(v?.icing) && v.icing >= 1 && v.icing <= 3 ? Math.round(v.icing) : 0
      grades[y * nx + x] = 0
      if (!v || !after || ![v.distanceNm, after.distanceNm, yA, yB].every(Number.isFinite)) continue
      grades[y * nx + x] = grade
      const cell = { key: `${y}-${x}`, x: xFor(v.distanceNm), y: Math.min(yA, yB), w: xFor(after.distanceNm) - xFor(v.distanceNm), h: Math.abs(yB - yA) }
      const color = cloudSpreadColor(v.spread, level.pressure === 500 ? 6 : 4)
      if (color !== 'rgba(0,0,0,0)') cloud.push({ ...cell, fill: color })
      if (grade) icing.push({ ...cell, grade })
    }
  }
  const { outerRings } = cellRegionRings(nx, ny, (x, y) => grades[y * nx + x] > 0)
  for (const ring of outerRings) {
    const points = ring.map(([x, y]) => ({ x: xFor(levels[0].values[x].distanceNm), y: yFor(altFor(levels[y])) }))
    outlines.push(points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z')
  }
  return { cloud, icing, outlines }
}

// The chart and overlap notice use the same native altitude cells and thresholds.
export function buildProfileTurbulenceCells(turbulence) {
  if (!turbulence?.available || !turbulence.levels?.length) return []
  const cells = []
  for (const [li, level] of turbulence.levels.entries()) {
    for (let vi = 0; vi < (level.values?.length ?? 0) - 1; vi++) {
      const sample = level.values[vi], after = level.values[vi + 1]
      const upper = turbulence.levels[li + 1]?.values?.[vi]
      const native = turbulence.product === 'GKTG'
      const band = Number.isFinite(sample.gktg) && Number.isFinite(upper?.gktg)
        ? gktgBand(Math.max(sample.gktg, upper.gktg)) : null
      const fill = native ? (band?.min ? band.color : null)
        : !Number.isFinite(sample.ktg) || sample.ktg < .3 ? null
          : sample.ktg < .475 ? 'rgba(100,210,100,0.40)'
            : sample.ktg < .75 ? 'rgba(255,195,0,0.55)' : 'rgba(255,55,55,0.65)'
      const altitude = sample.altFt ?? level.altFt
      const topFt = native ? Math.max(altitude, upper?.altFt) : altitude + 500
      const bottomFt = native ? Math.min(altitude, upper?.altFt) : Math.max(0, altitude - 500)
      if (!fill || ![sample.distanceNm, after.distanceNm, topFt, bottomFt].every(Number.isFinite)) continue
      if (after.distanceNm <= sample.distanceNm || topFt <= bottomFt) continue
      cells.push({ key: `turb-${li}-${vi}`, fromNm: sample.distanceNm, toNm: after.distanceNm, topFt, bottomFt, fill })
    }
  }
  return cells
}

export function profileIcingHidesTurbulence(crossSection) {
  const altFor = level => Number.isFinite(level.altFt) ? level.altFt : pressureToFallbackFt(level.pressure)
  const { icing } = buildProfileCloudIcing(crossSection?.levels ?? [], n => n, n => n, altFor)
  const turbulence = buildProfileTurbulenceCells(crossSection?.turbulence)
  return icing.some(cell => cell.w > 0 && cell.h > 0 && turbulence.some(t =>
    cell.x < t.toNm && cell.x + cell.w > t.fromNm && cell.y < t.topFt && cell.y + cell.h > t.bottomFt))
}
