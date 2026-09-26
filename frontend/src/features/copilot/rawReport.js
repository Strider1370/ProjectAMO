import { classifyVisibilityCategory, classifyCeilingCategory, hasHighWindCondition } from '../../shared/weather/helpers.js'
import { tacRoleClass } from '../airport-panel/lib/metarViewModel.js'

// Colour each report token with the airport-panel rules. The server only sends
// token text and role; thresholds stay in the shared frontend helpers.
export function tokenHighlightClass(token, icao) {
  const text = String(token?.text ?? '').replace(/=$/, '')
  const context = { highWind: false, visCat: null, ceilCat: null }
  if (token?.role === 'wind') {
    const match = text.match(/^(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/)
    if (match) context.highWind = hasHighWindCondition({ speed: Number(match[1]), gust: match[2] ? Number(match[2]) : null })
  }
  if (token?.role === 'visibility' && /^\d{4}$/.test(text)) context.visCat = classifyVisibilityCategory(Number(text), icao)
  if (token?.role === 'ceiling') {
    const match = text.match(/^(?:BKN|OVC|VV)(\d{3})/)
    if (match) context.ceilCat = classifyCeilingCategory(Number(match[1]) * 100, icao)
  }
  return tacRoleClass(token?.role, context) ?? null
}

// Airports with a raw METAR/TAF in a get_airport_weather result, in display order.
export function rawReports(result) {
  return (result?.data?.airports ?? []).flatMap((airport) => ['metar', 'taf']
    .map((kind) => airport[kind])
    .filter((report) => Array.isArray(report?.rawLines) && report.rawLines.length)
    .map((report) => ({
      icao: airport.icao,
      // "TAF AMD RKTU 261608Z": report words up to and including the issue time.
      title: report.rawLines[0].slice(0, report.rawLines[0].findIndex((token) => token.role === 'time') + 1 || 3)
        .map((token) => token.text).join(' '),
      lines: report.rawLines.map((line) => line.map((token) => ({ text: token.text, className: tokenHighlightClass(token, airport.icao) }))),
    })))
}
