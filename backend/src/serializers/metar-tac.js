// 파싱된 METAR 구조 → 원문 TAC + 역할 토큰 재구성.
// 국내(KMA IWXXM)는 원문 TAC가 없어 파싱 결과(observation.display 등)로 재조립한다.
// 입력 = metar-parser.parse() 결과 객체(원본 XML 아님).

function ddhhmmZ(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z`
}

// RVR 토큰. operator/tendency 코드 대표값만 매핑.
// ponytail: KMA 국내 METAR엔 RVR이 거의 안 실림 — 실제로 나오면 코드 매핑 확장.
import { tacDisplayLine, tacPresentation, tacToken, weatherTokenRole } from './tac-presentation.js'

function rvrToken(r) {
  if (!r || !r.runway || r.mean == null) return null
  const op = r.operator === 'ABOVE' ? 'P' : r.operator === 'BELOW' ? 'M' : ''
  const tend = { UPWARD: 'U', DOWNWARD: 'D', NO_CHANGE: 'N' }[r.tendency] || ''
  return `R${r.runway}/${op}${String(r.mean).padStart(4, '0')}${tend}`
}

function windShearToken(ws) {
  if (!ws) return ''
  if (typeof ws === 'string') return ws
  if (ws.raw) return ws.raw
  if (ws.all) return 'WS ALL RWY'
  if (ws.runway) return `WS R${ws.runway}`
  return ''
}

export function buildMetarTacPresentation(parsed) {
  if (!parsed?.header || !parsed?.observation) return null
  const h = parsed.header
  const o = parsed.observation
  const d = o.display || {}

  const type = h.report_type === 'SPECI' ? 'SPECI' : 'METAR'
  const time = ddhhmmZ(h.observation_time || h.issue_time)
  const wind = d.wind || o.wind?.raw || '/////KT'
  const visibility = String(d.visibility) === '10000' ? '9999' : d.visibility

  // 순서(Annex 3): 바람 · 본문(시정/RVR/기상/구름) · 기온/노점 · QNH · 윈드시어(보충)
  const parts = [
    tacToken(type, 'report'), tacToken(h.icao, 'station'), tacToken(time, 'time'), tacToken(wind, 'wind'),
  ]
  if (parsed.cavok_flag) parts.push(tacToken('CAVOK'))
  else {
    if (visibility) parts.push(tacToken(visibility, 'visibility'))
    for (const rvr of (o.rvr || []).map(rvrToken).filter(Boolean)) parts.push(tacToken(rvr, 'rvr'))
    for (const weather of (o.weather || []).filter((weather) => weather?.descriptor || weather?.phenomena?.length)) {
      parts.push(tacToken(weather.raw, weatherTokenRole(weather)))
    }
    for (const cloud of String(d.clouds || '').split(/\s+/).filter(Boolean)) parts.push(tacToken(cloud, /CB$/.test(cloud) ? 'cloud-cb' : /^(BKN|OVC)/.test(cloud) ? 'ceiling' : 'plain'))
  }
  if (d.temperature) parts.push(tacToken(d.temperature, 'temperature'))
  if (d.qnh) parts.push(tacToken(d.qnh, 'qnh'))
  const shear = windShearToken(o.wind_shear)
  if (shear) parts.push(tacToken(shear, 'supplementary'))
  return tacPresentation([tacDisplayLine(parts)])
}

export function buildMetarTac(parsed) { return buildMetarTacPresentation(parsed)?.text ?? null }

export default { buildMetarTac }
