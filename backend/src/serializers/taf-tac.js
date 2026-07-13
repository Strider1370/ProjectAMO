// 파싱된 TAF 구조 → 원문 TAF TAC 문자열 재구성.
// 국내(KMA IWXXM)는 원문이 없어 base + change_groups 로 재조립.
// 입력 = taf-parser.parse() 결과 객체.

function ddhhmmZ(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z`
}

function ddhh(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}`
}

// base 또는 change_group 의 본문. null(=미변경) 필드는 생략, 존재하는 것만.
function stateBody(s) {
  if (!s) return ''
  const parts = []
  if (s.wind?.raw) parts.push(s.wind.raw)
  if (s.cavok_flag) {
    parts.push('CAVOK')
  } else {
    if (s.vis != null) parts.push(String(s.vis).padStart(4, '0'))
    const wx = Array.isArray(s.wx) ? s.wx.map((w) => w.raw).filter(Boolean).join(' ') : ''
    if (wx) parts.push(wx)
    if (s.nsc_flag) parts.push('NSC')
    else if (Array.isArray(s.clouds) && s.clouds.length) parts.push(s.clouds.map((c) => c.raw).join(' '))
  }
  return parts.join(' ')
}

function groupHead(g) {
  if (g.type === 'FM') return `FM${ddhhmmZ(g.start).replace('Z', '')}` // FMddhhmm (시점, 범위 아님)
  const label = g.type?.includes('PROB') ? g.type.replace('_', ' ') : g.type // PROB30_TEMPO → "PROB30 TEMPO"
  return `${label} ${ddhh(g.start)}/${ddhh(g.end)}`
}

export function buildTafTac(parsed) {
  if (!parsed?.header) return null
  const h = parsed.header
  const amd = h.report_status === 'AMENDMENT' ? ' AMD' : h.report_status === 'CORRECTION' ? ' COR' : ''
  const head = `TAF${amd} ${h.icao} ${ddhhmmZ(h.issued)} ${ddhh(h.valid_start)}/${ddhh(h.valid_end)}`
  const line1 = `${head} ${stateBody(parsed.base)}`.trim()
  const groups = (parsed.change_groups || []).map((g) => `${groupHead(g)} ${stateBody(g)}`.trim())
  return [line1, ...groups].join('\n')
}

export default { buildTafTac }
