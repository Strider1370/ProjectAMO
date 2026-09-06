import { MODEL_ORDER, methodLabel } from './modelComparisonViewModel.js'

const number = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '자료 없음'
const temporal = value => ({ native_hourly: '원 1시간 자료', interpolated_hourly: '보간 1시간 자료' })[value] || '시간 처리 자료 없음'

export function forecastSummary(point, unit) {
  const d = point.detail
  return [point.text || (Number.isFinite(point.value) ? `${number(point.value, 1)} ${unit}` : '자료 없음'),
    point.conditionText,
    d?.run_at && `Run ${d.run_at}`,
    d?.forecast_hour != null && `F${String(d.forecast_hour).padStart(3, '0')}`,
    (d?.model || d?.temporal_method) && temporal(d.temporal_method),
    d?.ceiling_method && methodLabel(d.ceiling_method),
  ].filter(Boolean).join(' · ')
}

export function comparisonDetails(series, at, unit) {
  return series.filter(s => MODEL_ORDER.includes(s.id) || s.points.some(p => p.at === at)).map(s => {
    const point = s.points.find(p => p.at === at)
    const d = point?.detail
    return { id: s.id, label: s.label, color: s.color,
      summary: point ? forecastSummary(point, unit) : '예보 범위 밖',
      value: point ? point.text || `${number(point.value, 1)} ${unit}` : '예보 범위 밖',
      metadata: [d?.run_at && `Run ${d.run_at.slice(5, 16).replace('T', ' ')} UTC`, d?.forecast_hour != null && `F${String(d.forecast_hour).padStart(3, '0')}`, d?.temporal_method && temporal(d.temporal_method)].filter(Boolean).join(' · '),
      conditionText: point?.conditionText,
    }
  })
}
