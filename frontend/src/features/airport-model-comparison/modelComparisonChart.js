export const CEILING_CHART_MAX_FT = 10_000

export function plotChartValue(value, unit) {
  if (!Number.isFinite(value)) return value
  return unit === 'ft' ? Math.min(value, CEILING_CHART_MAX_FT) : value
}

export function formatAxisTick(value, unit, domainMax) {
  const fractionDigits = unit === 'mm' && Math.abs(domainMax) < 1 ? 2 : 0
  return `${value.toLocaleString('ko-KR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} ${unit}`
}
