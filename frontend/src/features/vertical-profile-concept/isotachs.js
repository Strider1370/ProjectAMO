import { isothermSegments, chainContourSegments } from '../../shared/weather/gridContours.js'
import { TOTAL_NM, windSpeed } from './scenario.js'

// Fixed physical grid: resizing/zooming never changes the underlying synthetic field.
export function buildIsotachs(hour) {
  const xs = Array.from({ length: TOTAL_NM / 2 + 1 }, (_, i) => i * 2)
  const ys = Array.from({ length: 85 }, (_, i) => i * 500)
  const values = ys.flatMap(ft => xs.map(nm => windSpeed(nm, ft, hour)))
  const grid = { nx: xs.length, ny: ys.length, xs, ys, values }
  const max = Math.max(...values.filter(Number.isFinite))
  const result = []
  for (let kt = 80; kt <= max; kt += 20) {
    result.push({ kt, chains: chainContourSegments(isothermSegments(grid, kt)) })
  }
  return result
}
