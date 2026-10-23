export function airportAlertBody(event) {
  const p = event.payload
  if (event.kind === 'metar') return p.metrics.map((metric) => metric.direction === 'event'
    ? `${metric.label} 관측` : `${metric.label} ${metric.value}${metric.unit} · 기준 ${metric.threshold}${metric.unit} ${metric.direction === 'below' ? '미만' : '이상'}`).join(' · ')
  if (event.kind === 'taf') return `${p.reportType === 'AMD' ? 'TAF AMD' : '새 TAF'} · ${p.issuedAt ?? '발표시각 미상'}\n${p.text ?? ''}`
  if (event.kind === 'airport_warning') return `${p.warning?.wrng_type_name ?? '공항경보'} · ${p.validTo ? `유효 ${p.validTo}` : '상세 보기'}`
  return `최근 ${p.windowMinutes}분 · ${p.radiusKm}km 이내 ${p.count}건`
}

export function pushBodyWithinLimit(body, maxBytes = 2400) {
  if (Buffer.byteLength(body, 'utf8') <= maxBytes) return body
  const suffix = '\n전문 전체는 알림을 눌러 확인하세요.'
  let result = ''
  for (const character of body) {
    if (Buffer.byteLength(result + character + suffix, 'utf8') > maxBytes) break
    result += character
  }
  return result + suffix
}
