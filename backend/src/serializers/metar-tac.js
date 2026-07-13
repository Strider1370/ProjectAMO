// 파싱된 METAR 구조 → 원문 TAC 문자열 재구성.
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

export function buildMetarTac(parsed) {
  if (!parsed?.header || !parsed?.observation) return null
  const h = parsed.header
  const o = parsed.observation
  const d = o.display || {}

  const type = h.report_type === 'SPECI' ? 'SPECI' : 'METAR'
  const time = ddhhmmZ(h.observation_time || h.issue_time)
  const wind = d.wind || o.wind?.raw || '/////KT'

  let body
  if (parsed.cavok_flag) {
    body = 'CAVOK'
  } else {
    const rvr = (o.rvr || []).map(rvrToken).filter(Boolean)
    // d.clouds 는 nsc/cavok 시 이미 'NSC'
    body = [d.visibility, ...rvr, d.weather, d.clouds].filter(Boolean).join(' ')
  }

  // 순서(Annex 3): 바람 · 본문(시정/RVR/기상/구름) · 기온/노점 · QNH · 윈드시어(보충)
  const tokens = [type, h.icao, time, wind, body, d.temperature, d.qnh, windShearToken(o.wind_shear)]
  return tokens.filter(Boolean).join(' ')
}

export default { buildMetarTac }
