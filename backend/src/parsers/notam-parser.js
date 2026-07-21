// KML (KOCA xNotam) → structured NOTAM records. No XML lib: KML fields are regex-extractable.
// CR line terminators in source; normalize to LF first.

export function dmsToIso(field) {
  if (!/^\d{10}$/.test(String(field || ''))) return null
  const s = String(field)
  const yy = 2000 + Number(s.slice(0, 2))
  const mo = Number(s.slice(2, 4)) - 1
  const dd = Number(s.slice(4, 6))
  const hh = Number(s.slice(6, 8))
  const mi = Number(s.slice(8, 10))
  const d = new Date(Date.UTC(yy, mo, dd, hh, mi))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// "4000FT AMSL" / "1500FT AGL" / "SFC" / "FL060" → { value:number, ref:'AMSL'|'AGL'|null, unit }
function parseHeightToken(tok) {
  if (!tok) return null
  const t = tok.trim().toUpperCase()
  if (t === 'SFC' || t === 'GND') return { value: 0, ref: 'AGL', unit: 'FT' }
  const fl = t.match(/^FL\s*(\d+)/)
  if (fl) return { value: Number(fl[1]), ref: null, unit: 'FL' }
  const ft = t.match(/(\d+)\s*FT\s*(AMSL|AGL)?/)
  if (ft) return { value: Number(ft[1]), ref: ft[2] || null, unit: 'FT' }
  return null
}

export function parseNotamSchedule(scheduleText) {
  const m = String(scheduleText || '').trim().match(/^(?:DLY\s+)?(\d{2})(\d{2})-(\d{2})(\d{2})$/i)
  return m ? { kind: 'daily', start_utc_min: Number(m[1]) * 60 + Number(m[2]), end_utc_min: Number(m[3]) * 60 + Number(m[4]) } : null
}

export function parseQcodeBand(qLine, fLine, gLine) {
  const f = parseHeightToken(fLine)
  const g = parseHeightToken(gLine)
  if (f && g) return { lower: f.value, upper: g.value, unit: f.unit, ref: f.ref || g.ref || null }
  // Q-line: .../lower/upper/coord — e.g. /000/999/3459N12623E005
  const m = String(qLine || '').match(/\/(\d{3})\/(\d{3})\/\d/)
  if (m) return { lower: Number(m[1]), upper: Number(m[2]), unit: 'FL', ref: null }
  return null
}

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

function parseOnePlacemark(xml) {
  const idMatch = xml.match(/<Placemark id='([A-Z]\d{4}\/\d{2})/)
  if (!idMatch) return null
  const id = idMatch[1]
  const cdata = xml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  const text = (cdata ? cdata[1] : '').replace(/<br\s*\/?>/gi, '\n').replace(/<h3>[\s\S]*?<\/h3>/i, '')
  const qLine = (text.match(/Q\)([^\n]+)/) || [])[0] || ''
  const qcode = (qLine.match(/Q\)[A-Z]{4}\/(Q[A-Z]{4})/) || [])[1] || null
  const location = (text.match(/A\)\s*([A-Z]{4})/) || [])[1] || null
  const bField = (text.match(/B\)\s*(\d{10})/) || [])[1] || null
  const cField = (text.match(/C\)\s*(\d{10})/) || [])[1] || null
  const scheduleText = (text.match(/D\)\s*([\s\S]*?)(?=\n\s*E\)|\)?\s*$)/) || [])[1]?.trim() || null
  const validFrom = dmsToIso(bField)
  const validTo = dmsToIso(cField)
  if (!id || !location || !validFrom || !validTo) return null // required fields
  // F)SFC / F)4000FT AMSL — allow SFC/GND word or a number+unit token; stop before space or ')'
  const fField = (text.match(/F\)\s*(SFC|GND|[^\n G)]+)/) || [])[1] || null
  const gField = (text.match(/G\)\s*([^\n)]+)/) || [])[1] || null
  const summary = (text.match(/E\)\s*([\s\S]*?)(?:\n[FG]\)|\)?\s*$)/) || [])[1]?.trim().replace(/\)\s*$/, '') || ''
  return {
    id,
    series: id[0],
    location,
    qcode,
    validFrom,
    validTo,
    scheduleText,
    altitude: parseQcodeBand(qLine, fField, gField),
    summary,
    rawText: text.trim(),
    geometry: extractGeometry(xml),
  }
}

export function parseNotamKml(kml) {
  const lf = String(kml || '').replace(/\r/g, '\n')
  const placemarks = lf.split('<Placemark').slice(1).map((chunk) => '<Placemark' + chunk.split('</Placemark>')[0] + '</Placemark>')
  const out = []
  for (const pm of placemarks) {
    try {
      const rec = parseOnePlacemark(pm)
      if (rec) out.push(rec)
    } catch { /* skip broken placemark */ }
  }
  return out
}

export default { parseNotamKml, parseQcodeBand, dmsToIso }
