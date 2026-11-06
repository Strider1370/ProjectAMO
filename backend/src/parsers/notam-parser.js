// KML (KOCA xNotam) → structured NOTAM records. No XML lib: KML fields are regex-extractable.
// CR line terminators in source; normalize to LF first.

import { resolveNotamGeometry } from '../notam/notam-geometry.js'

import { splitNotamFields, notamInstant, parseNotamAltitude, notamGeographicExclusions } from '../../../shared/notam-fields.js'

export const dmsToIso = notamInstant
export const parseQcodeBand = parseNotamAltitude

// Order matters: Polygon → LineString → Point. The Point in a KOCA MultiGeometry is the
// label anchor, not the affected area; only fall back to it when no polygon/line exists.
function extractGeometry(placemarkXml) {
  const poly = placemarkXml.match(/<Polygon>[\s\S]*?<LinearRing>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)
  if (poly) {
    const ring = poly[1].trim().split(/\s+/).map((tuple) => tuple.split(',').slice(0, 2).map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite))
    if (ring.length >= 4) return { type: 'Polygon', coordinates: [ring] }
  }
  const line = placemarkXml.match(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)
  if (line) {
    const coords = line[1].trim().split(/\s+/).map((tuple) => tuple.split(',').slice(0, 2).map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite))
    if (coords.length >= 2) return { type: 'LineString', coordinates: coords }
  }
  const pt = placemarkXml.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/)
  if (pt) {
    const [lon, lat] = pt[1].trim().split(/[,\s]+/).map(Number)
    if (Number.isFinite(lon) && Number.isFinite(lat)) return { type: 'Point', coordinates: [lon, lat] }
  }
  return null
}

export function parseNotamText(rawText, id, kmlGeometry = null) {
  const fields = splitNotamFields(rawText)
  const qcode = fields.Q?.match(/^[A-Z]{4}\/(Q[A-Z]{4})\//)?.[1] || null
  const location = fields.A?.match(/^[A-Z]{4}\b/)?.[0] || null
  const validFrom = notamInstant(fields.B)
  const validTo = fields.C === 'PERM' ? '2099-12-31T23:59:00.000Z' : notamInstant(fields.C)
  if (!/^[A-Z]\d{4}\/\d{2}(?:[AB]\d{2})?$/.test(id || '') || !location || !validFrom || !validTo || !fields.E) return null
  const resolved = resolveNotamGeometry({ rawText, kmlGeometry })
  return { id, series: id[0], location, qcode, validFrom, validTo,
    validityEnd: fields.C === 'PERM' ? 'permanent' : /EST$/.test(fields.C) ? 'estimated' : 'fixed',
    scheduleText: fields.D || null, altitude: parseNotamAltitude(fields.Q, fields.F, fields.G),
    summary: fields.E, rawText: rawText.trim(), geometry: resolved.geometry,
    bufferNm: resolved.bufferNm, geometrySource: resolved.source, geometryReason: resolved.reason,
    approximated: resolved.approximated, geographicExclusions: notamGeographicExclusions(fields.E) }
}

function parseOnePlacemark(xml) {
  const id = xml.match(/<Placemark\s[^>]*id=["']([A-Z]\d{4}\/\d{2}(?:[AB]\d{2})?)(?:_|["'])/)?.[1]
  const cdata = xml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)?.[1] || ''
  const text = cdata.replace(/<br\s*\/?>/gi, '\n').replace(/<h3>[\s\S]*?<\/h3>/i, '')
  return parseNotamText(text, id, extractGeometry(xml))
}

export function parseNotamKml(kml) {
  const lf = String(kml || '').replace(/\r/g, '\n')
  const placemarks = lf.split('<Placemark').slice(1).map((chunk) => '<Placemark' + chunk.split('</Placemark>')[0] + '</Placemark>')
  const items = []
  for (const pm of placemarks) {
    try {
      const rec = parseOnePlacemark(pm)
      if (rec) items.push(rec)
    } catch { /* skip broken placemark */ }
  }
  // 조용한 유실을 없앤다 — 이전에는 몇 건이 사라졌는지 알 방법이 없었다.
  return { items, placemarks: placemarks.length, dropped: placemarks.length - items.length }
}

export default { parseNotamKml, parseQcodeBand, dmsToIso }
