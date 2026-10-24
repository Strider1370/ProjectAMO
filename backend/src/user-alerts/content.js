import { phenomenonTitle } from './phenomenon.js'

// 휴대폰 푸시 문구. 잠금화면에는 제목과 본문 앞부분만 보이므로 제목 첫머리에 공항(경로)과 "무엇이 일어났나"를,
// 본문에는 값과 기준을 중요한 순서로 둔다. 시각은 KST로 쓴다(푸시에는 사용자가 고른 시간대가 없다).
const kst = (iso) => {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return '시각 미상'
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
}
const flText = (ft) => `FL${String(Math.round(ft / 100)).padStart(3, '0')}`
const metricText = (m) => (m.direction === 'event' ? `${m.label} 관측`
  : `${m.label} ${m.value}${m.unit} (기준 ${m.threshold}${m.unit} ${m.direction === 'below' ? '미만' : '이상'})`)

// 프론트 alertModel.metarHeadline과 같은 규칙: 미만 기준만이면 "미달", 이상 기준만이면 "초과", 섞이면 "도달".
export function metarHeadline(metrics = []) {
  const thresholds = metrics.filter((m) => m.direction !== 'event')
  const events = metrics.filter((m) => m.direction === 'event')
  if (!thresholds.length && events.length) return `${events.map((m) => m.label).join('·')} 보고`
  const below = thresholds.every((m) => m.direction === 'below')
  const above = thresholds.every((m) => m.direction !== 'below')
  return `${thresholds.map((m) => m.label).join('·')} 기준 ${below ? '미달' : above ? '초과' : '도달'}${events.length ? ` · ${events.map((m) => m.label).join('·')}` : ''}`
}

export function airportAlertBody(event) {
  const p = event.payload
  if (event.kind === 'metar') return [...p.metrics.map(metricText), p.observedAt ? `${kst(p.observedAt)} KST 관측` : null].filter(Boolean).join(' · ')
  if (event.kind === 'taf') return p.text ?? ''
  if (event.kind === 'airport_warning') return `${p.warning?.wrng_type_name ?? '공항경보'}${p.validTo ? ` · ~${kst(p.validTo)} KST` : ''}`
  return `반경 ${p.radiusKm}km · 최근 ${p.windowMinutes}분 · ${p.count}건`
}

export function airportAlertTitle(event, icao) {
  const p = event.payload
  const where = icao ?? ''
  if (event.kind === 'metar') return `${where} ${metarHeadline(p.metrics)}`.trim()
  if (event.kind === 'taf') return `${where} ${p.reportType === 'AMD' ? 'TAF AMD 발표' : 'TAF 발표'}`.trim()
  if (event.kind === 'airport_warning') return `${where} 공항경보 발효`.trim()
  return `${where} 주변 낙뢰`.trim()
}

export function routeSigmetTitle(payload) {
  return `SIGMET ${phenomenonTitle(payload.phenomenonCode, payload.phenomenon)} · ${payload.routeName ?? '경로'}`
}

export function routeSigmetBody(payload) {
  const band = payload.altitudeBandFt
  const bandText = band && Number.isFinite(band.lowFt) && Number.isFinite(band.highFt)
    ? `${band.lowFt <= 0 ? 'SFC' : flText(band.lowFt)}–${flText(band.highFt)} ${payload.altitudeStatus === 'matched' ? '내 고도 포함' : ''}`.trim() : '고도 미상'
  const segment = Number.isFinite(payload.intersectFromNm) && Number.isFinite(payload.intersectToNm)
    ? `${Math.round(payload.intersectFromNm)}–${Math.round(payload.intersectToNm)}NM 구간` : null
  return [bandText, segment, `유효 ${kst(payload.validFrom)}–${kst(payload.validTo)} KST`].filter(Boolean).join(' · ')
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
