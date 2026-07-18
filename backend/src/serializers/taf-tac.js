// 파싱된 TAF 구조 → 원문 TAF TAC + 역할 토큰 재구성.
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
import { tacDisplayLine, tacPresentation, tacToken, weatherTokenRole } from './tac-presentation.js'

function stateParts(s) {
  if (!s) return []
  const parts = []
  if (s.wind?.raw) parts.push(tacToken(s.wind.raw, 'wind'))
  if (s.cavok_flag) {
    parts.push(tacToken('CAVOK'))
  } else {
    if (s.vis != null) parts.push(tacToken(String(s.vis).padStart(4, '0'), 'visibility'))
    for (const weather of (s.wx || []).filter((weather) => weather?.descriptor || weather?.phenomena?.length)) {
      parts.push(tacToken(weather.raw, weatherTokenRole(weather)))
    }
    if (s.nsc_flag) parts.push(tacToken('NSC'))
    else for (const cloud of (s.clouds || []).map((c) => c.raw).filter(Boolean)) parts.push(tacToken(cloud, /CB$/.test(cloud) ? 'cloud-cb' : /^(BKN|OVC)/.test(cloud) ? 'ceiling' : 'plain'))
  }
  return parts
}

function groupHead(g) {
  if (g.type === 'FM') return `FM${ddhhmmZ(g.start).replace('Z', '')}` // FMddhhmm (시점, 범위 아님)
  const label = g.type?.includes('PROB') ? g.type.replace('_', ' ') : g.type // PROB30_TEMPO → "PROB30 TEMPO"
  return `${label} ${ddhh(g.start)}/${ddhh(g.end)}`
}

function slotTime(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())).toISOString().replace('.000Z', 'Z')
}

export function buildTafTacPresentation(parsed) {
  if (!parsed?.header) return null
  const h = parsed.header
  const amd = h.report_status === 'AMENDMENT' ? ' AMD' : h.report_status === 'CORRECTION' ? ' COR' : ''
  const headParts = [
    tacToken('TAF', 'report'),
    ...(amd ? [tacToken(amd.trim(), 'report')] : []),
    tacToken(h.icao, 'station'),
    tacToken(ddhhmmZ(h.issued), 'time'),
    tacToken(`${ddhh(h.valid_start)}/${ddhh(h.valid_end)}`, 'validity'),
  ]
  const lines = [tacDisplayLine([...headParts, ...stateParts(parsed.base)], { slotTime: slotTime(h.valid_start) })]
  for (const group of parsed.change_groups || []) {
    const prefix = groupHead(group).split(' ').map((text, index) => tacToken(text, index === 0 ? 'change' : 'validity'))
    lines.push(tacDisplayLine([...prefix, ...stateParts(group)], { slotTime: slotTime(group.start) }))
  }
  return tacPresentation(lines)
}

export function buildTafTac(parsed) { return buildTafTacPresentation(parsed)?.text ?? null }

export default { buildTafTac }
