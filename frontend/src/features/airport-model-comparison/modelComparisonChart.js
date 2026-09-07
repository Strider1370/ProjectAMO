import { pathSegments } from './modelComparisonViewModel.js'

export const CEILING_CHART_MAX_FT = 10_000

export function chartDomain(values, unit) {
  if (unit === 'ft') {
    const max = values.some(value => Number.isFinite(value) && value > 5000) ? CEILING_CHART_MAX_FT : 5000
    return { min: 0, max, step: max / 5 }
  }
  if (unit === '%') return { min: 0, max: 100, step: 20 }
  const finite = values.filter(Number.isFinite)
  const low = unit === '°C' && finite.length ? Math.min(...finite) : 0
  const high = finite.length ? Math.max(...finite) : 1
  const span = Math.max(high - low, unit === '°C' ? 2 : 0.1)
  const power = 10 ** Math.floor(Math.log10(span / 4))
  const step = [1, 2, 5, 10].find(value => value * power >= span / 4) * power
  const min = unit === '°C' ? Math.floor(low / step) * step : 0
  const max = Number((Math.max(min + step, Math.ceil(high / step) * step)).toPrecision(10))
  return { min, max, step }
}

export function chartPath(points, yAt, stepped = false) {
  return pathSegments(points).map(segment => segment.map((p, i) => i === 0 ? `M${p.x},${yAt(p.value)}` : stepped ? `H${p.x} V${yAt(p.value)}` : `L${p.x},${yAt(p.value)}`).join(' ')).join(' ')
}

export function humidityColor(value) {
  const t = Math.max(0, Math.min(100, value)) / 100
  return `rgb(${Math.round(239 - 199 * t)}, ${Math.round(243 - 163 * t)}, ${Math.round(245 - 138 * t)})`
}

export function plotChartValue(value, unit) {
  if (!Number.isFinite(value)) return value
  return unit === 'ft' ? Math.min(value, CEILING_CHART_MAX_FT) : value
}

export function formatAxisTick(value, unit, domainMax) {
  const minimumFractionDigits = unit === 'mm' && Math.abs(domainMax) < 1 ? 2 : 0
  const maximumFractionDigits = Math.max(minimumFractionDigits, unit === 'mm' || unit === '°C' ? 1 : 0)
  return `${value.toLocaleString('ko-KR', { minimumFractionDigits, maximumFractionDigits })} ${unit}`
}
