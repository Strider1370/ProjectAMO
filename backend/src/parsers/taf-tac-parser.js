// TAF 원문(TAC) → 정규화된 base + change_groups.
// NOAA TAF JSON은 변화군마다 앞 상태를 이어받은 "전체 상태"를 주고 CAVOK을 6+/NSW/NSC로 풀어 버려서,
// 변화군이 실제로 바꾼 요소와 CAVOK 지속 여부를 잃는다. 원문에서 직접 읽어 변화군이 적은 요소만 남긴다.
// 출력 상태 shape는 taf-parser.js(IWXXM)·noaa-taf-parser.js와 같다.
import { parseWeatherCode, parseWind, resolveDdhh, resolveWeatherIconKey } from './parse-utils.js'
import { convertSmToMeters } from './noaa-metar-parser.js'

const MPS_TO_KT = 1.943844
const KMH_TO_KT = 0.539957
const CLEAR_TOKENS = new Set(['NSC', 'SKC', 'CLR', 'NCD'])
const WX_RE = /^(\+|-|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/

function toKnots(value, unit) {
  if (!Number.isFinite(value)) return null
  if (unit === 'MPS') return Math.round(value * MPS_TO_KT)
  if (unit === 'KMH') return Math.round(value * KMH_TO_KT)
  return value
}

function windFromToken(token) {
  const m = /^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/.exec(token)
  if (!m) return null
  const variable = m[1] === 'VRB'
  const node = {
    'iwxxm:meanWindDirection': variable ? null : Number(m[1]),
    'iwxxm:meanWindSpeed': { '#text': toKnots(Number(m[2]), m[4]), '@_uom': '[kn_i]' },
    '@_variableWindDirection': variable ? 'true' : 'false',
  }
  if (m[3]) node['iwxxm:windGustSpeed'] = { '#text': toKnots(Number(m[3]), m[4]), '@_uom': '[kn_i]' }
  return parseWind(node)
}

function cloudFromToken(token) {
  const m = /^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/.exec(token) || /^(VV)(\d{3}|\/\/\/)()$/.exec(token)
  if (!m) return null
  const base = /^\d{3}$/.test(m[2]) ? Number(m[2]) * 100 : null
  return { amount: m[1], base, type: m[3] || null, raw: token }
}

function weatherFromToken(token) {
  const m = WX_RE.exec(token)
  if (!m || (!m[2] && !m[3])) return null
  const parsed = parseWeatherCode(token)
  if (!parsed || (!parsed.descriptor && !(parsed.phenomena && parsed.phenomena.length > 0))) return null
  return { ...parsed, icon_key: resolveWeatherIconKey(parsed) }
}

// 한 그룹의 요소 토큰 → 상태 조각. full=true(base·FM)면 빠진 요소도 "없음"으로 확정한다.
function parseElements(tokens, { full }) {
  const state = {
    wind: null,
    vis: null,
    wx: full ? [] : null,
    clouds: full ? [] : null,
    wx_touched: full,
    clouds_touched: full,
    cavok_flag: false,
    nsc_flag: false,
    nsw_flag: false,
  }
  const unknown = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const wind = windFromToken(t)
    if (wind) { state.wind = wind; continue }
    if (t === 'CAVOK') {
      Object.assign(state, { vis: 9999, wx: [], clouds: [], wx_touched: true, clouds_touched: true, cavok_flag: true })
      continue
    }
    if (/^\d{4}$/.test(t)) { state.vis = Number(t); continue }
    // SM 시정: P6SM, 3SM, 1/2SM, "1 1/2SM"
    if (/^\d$/.test(t) && /^\d\/\dSM$/.test(tokens[i + 1] || '')) { state.vis = convertSmToMeters(`${t} ${tokens[i + 1]}`); i++; continue }
    if (/^P?\d+(?:\/\d)?SM$/.test(t)) { state.vis = t.startsWith('P') ? 9999 : convertSmToMeters(t); continue }
    if (t === 'NSW') { state.wx = []; state.wx_touched = true; state.nsw_flag = true; continue }
    if (CLEAR_TOKENS.has(t)) { state.clouds = []; state.clouds_touched = true; state.nsc_flag = true; continue }
    const cloud = cloudFromToken(t)
    if (cloud) { state.clouds = [...(state.clouds || []), cloud]; state.clouds_touched = true; state.nsc_flag = false; continue }
    const wx = weatherFromToken(t)
    if (wx) { state.wx = [...(state.wx || []), wx]; state.wx_touched = true; continue }
    unknown.push(t)
  }
  // 기온군(TX/TN), 윈드시어(WS), QNH 등 표출하지 않는 군은 알 수 없는 토큰에서 뺀다
  return { state, unknown: unknown.filter((t) => !/^(TX|TN)M?\d{2}\/\d{4}Z$|^WS\d|^QNH|^NOSIG$/.test(t)) }
}

function addMinutes(iso, minutes) {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString().replace('.000Z', 'Z')
}

// 반환: { base, change_groups, unknown } 또는 해석 불가면 null.
// change_groups[i] = { type, start, end, ...상태 조각 }. type은 BECMG·TEMPO·PROB30·PROB40·PROB30_TEMPO·PROB40_TEMPO·FM.
// 원문의 일·시만으로는 연·월을 모르므로, 호출자가 아는 유효시작(validStart)이 있으면 그 기준으로 푼다.
export function parseTafTac(rawText, { validStart: validStartHint, validEnd, now = new Date() } = {}) {
  const tokens = String(rawText || '').toUpperCase().replace(/=/g, ' ').split(/\s+/).filter(Boolean)
  const rmk = tokens.indexOf('RMK')
  const body = rmk >= 0 ? tokens.slice(0, rmk) : tokens

  let i = 0
  if (body[i] === 'TAF') i++
  while (['AMD', 'COR', 'RTD'].includes(body[i])) i++
  if (!/^[A-Z]{4}$/.test(body[i] || '')) return null
  i++
  const issue = /^(\d{2})(\d{2})(\d{2})Z$/.exec(body[i] || '')
  if (!issue) return null
  i++
  const validity = /^(\d{4})\/(\d{4})$/.exec(body[i] || '')
  if (!validity) return null
  i++
  if (['NIL', 'CNL'].includes(body[i])) return null

  const anchor = validStartHint ? new Date(validStartHint) : new Date(resolveDdhh(`${issue[1]}${issue[2]}`, now))
  const validStart = resolveDdhh(validity[1], anchor)
  const end = validEnd || resolveDdhh(validity[2], new Date(validStart))
  const at = (ddhh) => resolveDdhh(ddhh, new Date(validStart))

  // 그룹 경계로 자른다
  const groups = []
  let current = { type: 'BASE', start: validStart, end, tokens: [] }
  for (; i < body.length; i++) {
    const t = body[i]
    let next = null
    const fm = /^FM(\d{4})(\d{2})$/.exec(t)
    if (fm) next = { type: 'FM', start: addMinutes(at(fm[1]), Number(fm[2])), end: null }
    else if (t === 'BECMG' || t === 'TEMPO' || /^PROB\d{2}$/.test(t)) {
      let type = t
      if (/^PROB\d{2}$/.test(t) && body[i + 1] === 'TEMPO') { type = `${t}_TEMPO`; i++ }
      const span = /^(\d{4})\/(\d{4})$/.exec(body[i + 1] || '')
      if (!span) return null
      i++
      next = { type, start: at(span[1]), end: at(span[2]) }
    }
    if (next) { groups.push(current); current = { ...next, tokens: [] } } else current.tokens.push(t)
  }
  groups.push(current)

  // FM은 다음 FM(없으면 유효기간 끝)까지 이어진다
  const fms = groups.filter((g) => g.type === 'FM')
  fms.forEach((g, k) => { g.end = fms[k + 1]?.start || end })

  const unknown = []
  const parsed = groups.map((g) => {
    const { state, unknown: u } = parseElements(g.tokens, { full: g.type === 'BASE' || g.type === 'FM' })
    unknown.push(...u)
    return { type: g.type, start: g.start, end: g.end, ...state }
  })
  const [base, ...change_groups] = parsed
  if (!base.wind && base.vis == null) return null
  const { type, start, end: _end, ...baseState } = base
  return { valid_start: validStart, valid_end: end, base: baseState, change_groups, unknown }
}

export default { parseTafTac }
