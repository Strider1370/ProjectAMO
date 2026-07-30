import { parseWeatherCode } from './parse-utils.js'
import { weatherTokenRole } from '../serializers/tac-presentation.js'

const REPORT_KEYWORD = /^(METAR|SPECI|TAF|AMD|COR)$/i

// isStation은 문법 위치로 판정한다 — 4글자 대문자 규칙만 쓰면 TSRA·VCSH·FZFG·MIFG 같은
// 4글자 현상코드가 공항코드로 잡혀 강조에서 빠지고, SASA 같은 실제 공항코드는 반대로 기상으로 잡힌다.
function roleForToken(text, { isStation = false, inRemark = false } = {}) {
  const token = text.replace(/=$/, '')
  if (REPORT_KEYWORD.test(token)) return 'report'
  if (isStation) return 'station'
  if (/^\d{6}Z$/.test(token)) return 'time'
  if (/^\d{4}\/\d{4}$/.test(token)) return 'validity'
  if (/^(FM\d{6}|BECMG|TEMPO|PROB\d{2})$/.test(token)) return 'change'
  // 해외는 m/s(MPS)·km/h(KMH) 표기와 풍향변동군(120V180)을 쓴다. 결측은 /////KT.
  if (/^(?:\d{3}|VRB|\/{3})(?:\d{2,3}|\/{2})(?:G\d{2,3})?(?:KT|MPS|KMH)$/.test(token)) return 'wind'
  if (/^\d{3}V\d{3}$/.test(token)) return 'wind'
  if (/^R\d{2}[LCR]?\//.test(token)) return 'rvr'
  if (/^(?:M|P)?\d+(?:\/\d+)?SM$/.test(token) || /^\d{4}(?:[NSEW]{1,2})?$/.test(token)) return 'visibility'
  if (/^(?:FEW|SCT|BKN|OVC)\d{3}CB$/.test(token)) return 'cloud-cb'
  // VV(수직시정)는 하늘이 막힌 상태 — 운고와 같은 등급 강조를 받아야 한다.
  if (/^(?:BKN|OVC)\d{3}$/.test(token) || /^VV\d{3}$/.test(token)) return 'ceiling'
  if (/^(?:FEW|SCT)\d{3}$/.test(token)) return 'plain'
  if (/^(M?\d{2})\/(M?\d{2})$/.test(token)) return 'temperature'
  if (/^[QA]\d{4}$/.test(token)) return 'qnh'
  // RMK 이후는 국가별 자유서식(FG8, SLP154, AO2…) → 현재기상으로 해석하지 않는다.
  // RE군(RESHRA·RESN…)은 지나간 현상이므로 현재기상과 같은 강조를 주지 않는다.
  if (inRemark || /^RE[A-Z]{2}/.test(token)) return 'plain'
  const weather = parseWeatherCode(token)
  return weather ? weatherTokenRole(weather) : 'plain'
}

function annotateLine(text, slotTime = null) {
  const parts = String(text).split(/(\s+)/).filter(Boolean)
  // 관측소 코드는 보고종별 뒤 첫 토큰 하나뿐. RMK 이후는 자유서식 구간.
  const words = parts.filter((value) => !/^\s+$/.test(value))
  const firstBody = words.find((value) => !REPORT_KEYWORD.test(value.replace(/=$/, '')))
  const stationWord = firstBody && /^[A-Z]{4}$/.test(firstBody) ? firstBody : null
  let stationTaken = false
  let inRemark = false

  const tokens = parts.map((value) => {
    if (/^\s+$/.test(value)) return { text: value, role: 'separator' }
    const isStation = !stationTaken && value === stationWord
    if (isStation) stationTaken = true
    const role = roleForToken(value, { isStation, inRemark })
    if (value.replace(/=$/, '') === 'RMK') inRemark = true
    return { text: value, role }
  })
  return { text: String(text), slot_time: slotTime, tokens }
}

function displayTafLines(rawText) {
  return String(rawText || '').replace(/\s+(FM\d{6}|PROB\d{2}\s+TEMPO|PROB\d{2}|BECMG|TEMPO|RMK)\b/g, '\n$1').split('\n').map((line) => line.trim()).filter(Boolean)
}

function slotTimeForLine(line, timeline) {
  const fm = line.match(/^FM(\d{2})(\d{2})/)
  const range = line.match(/(?:^|\s)(\d{2})(\d{2})\/\d{2}\d{2}/)
  const key = fm ? `${fm[1]}${fm[2]}` : range ? `${range[1]}${range[2]}` : null
  return key ? (timeline || []).find((slot) => `${slot.time.slice(8, 10)}${slot.time.slice(11, 13)}` === key)?.time ?? null : null
}

export function annotateMetarTac(rawText) {
  if (!rawText) return null
  const line = annotateLine(rawText)
  return { text: rawText, display_lines: [line] }
}

export function annotateTafTac(rawText, timeline = []) {
  if (!rawText) return null
  return { text: rawText, display_lines: displayTafLines(rawText).map((line) => annotateLine(line, slotTimeForLine(line, timeline))) }
}
