import { metricThresholdText, metricValueText } from './alertModel.js'

export function tafAlertSegments(payload = {}) {
  const text = payload.text ?? ''
  const segments = payload.tacSegments
  // 이전 알림과 판정 정보가 없는 본문은 원문 그대로 보여 준다.
  if (!Array.isArray(segments) || segments.map((segment) => segment?.text).join('') !== text) return [{ text }]
  return segments
}

export function tafHighlightDescription(metrics = []) {
  return metrics.map((metric) => metric.direction === 'event' ? `${metric.label} 예보`
    : `${metric.label} ${metric.qualifier === 'lessThan' ? '<' : ''}${metricValueText(metric)} · ${metricThresholdText(metric)}`).join(' / ')
}
