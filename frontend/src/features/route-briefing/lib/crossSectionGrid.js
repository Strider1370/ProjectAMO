export const MS_TO_KT = 1.943844

export function msToKt(ms) {
  return Number.isFinite(ms) ? ms * MS_TO_KT : NaN
}

export function windDirectionFromUV(u, v) {
  const dir = (Math.atan2(-u, -v) * 180) / Math.PI
  return (dir + 360) % 360
}

export function windBarbFeathers(kt) {
  let k = Math.max(0, Math.round((Number(kt) || 0) / 5) * 5)
  const pennants = Math.floor(k / 50); k -= pennants * 50
  const full = Math.floor(k / 10); k -= full * 10
  const half = Math.floor(k / 5)
  return { pennants, full, half }
}

export function pressureToFallbackFt(pressure) {
  const table = [[1000, 364], [975, 820], [950, 1640], [925, 2500], [900, 3300], [875, 4100], [850, 5000], [800, 6900], [750, 8200], [700, 10000], [650, 11800], [600, 13800], [550, 15700], [500, 18300], [450, 20200], [400, 23600], [350, 26200], [300, 30000], [250, 34000], [200, 38600], [150, 44600]]
  for (let i = 1; i < table.length; i += 1) {
    if (pressure >= table[i][0]) {
      const [p0, a0] = table[i - 1]; const [p1, a1] = table[i]
      const r = (pressure - p0) / (p1 - p0)
      return a0 + r * (a1 - a0)
    }
  }
  return table[table.length - 1][1]
}

export { isothermSegments } from '../../../shared/weather/gridContours.js'
