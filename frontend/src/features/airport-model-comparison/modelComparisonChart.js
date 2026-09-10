import { pathSegments } from './modelComparisonViewModel.js'

// 저운고 해상도를 지키려고 단계형 축을 쓴다. 5,000 ft 축에서 400 ft 운고가 읽히는 게
// 25,000 ft 축에 모두 밀어넣는 것보다 운항 판단에 쓸모 있다.
export const CEILING_CHART_TIERS = Object.freeze([5_000, 10_000, 25_000])
export const CEILING_CHART_MAX_FT = 25_000

export function chartDomain(values, unit) {
  if (unit === 'ft') {
    const max = CEILING_CHART_TIERS.find(tier => !values.some(value => Number.isFinite(value) && value > tier)) ?? CEILING_CHART_MAX_FT
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

export function plotChartValue(value, unit, max = CEILING_CHART_MAX_FT) {
  if (!Number.isFinite(value)) return value
  return unit === 'ft' ? Math.min(value, max) : value
}

export function formatAxisTick(value, unit, domainMax) {
  const minimumFractionDigits = unit === 'mm' && Math.abs(domainMax) < 1 ? 2 : 0
  const maximumFractionDigits = Math.max(minimumFractionDigits, unit === 'mm' || unit === '°C' ? 1 : 0)
  return `${value.toLocaleString('ko-KR', { minimumFractionDigits, maximumFractionDigits })} ${unit}`
}
