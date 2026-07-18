import { parseWeatherCode } from './parse-utils.js'
import { weatherTokenRole } from '../serializers/tac-presentation.js'

function roleForToken(text) {
  const token = text.replace(/=$/, '')
  if (/^(METAR|SPECI|TAF|AMD|COR)$/i.test(token)) return 'report'
  if (/^[A-Z]{4}$/.test(token)) return 'station'
  if (/^\d{6}Z$/.test(token)) return 'time'
  if (/^\d{4}\/\d{4}$/.test(token)) return 'validity'
  if (/^(FM\d{6}|BECMG|TEMPO|PROB\d{2})$/.test(token)) return 'change'
  if (/^(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?KT$/.test(token)) return 'wind'
  if (/^R\d{2}[LCR]?\//.test(token)) return 'rvr'
  if (/^(?:M|P)?\d+(?:\/\d+)?SM$/.test(token) || /^\d{4}$/.test(token)) return 'visibility'
  if (/^(?:FEW|SCT|BKN|OVC)\d{3}CB$/.test(token)) return 'cloud-cb'
  if (/^(BKN|OVC)\d{3}$/.test(token)) return 'ceiling'
  if (/^(FEW|SCT|VV)\d{3}$/.test(token)) return 'plain'
  if (/^(M?\d{2})\/(M?\d{2})$/.test(token)) return 'temperature'
  if (/^[QA]\d{4}$/.test(token)) return 'qnh'
  const weather = parseWeatherCode(token)
  return weather ? weatherTokenRole(weather) : 'plain'
}

function annotateLine(text, slotTime = null) {
  const tokens = String(text).split(/(\s+)/).filter(Boolean).map((value) => ({ text: value, role: /^\s+$/.test(value) ? 'separator' : roleForToken(value) }))
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
