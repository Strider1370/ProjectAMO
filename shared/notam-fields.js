// Lossless TAC field boundary. E) prose such as BOARD), ETD) and GND) is not D).
export function splitNotamFields(rawText) {
  let text = String(rawText || '').replace(/\r\n?/g, '\n').trim()
  if (/\([A-Z]\d{4}\/\d{2}(?:[A-Z]\d{2})?\s+NOTAM[NRC]\b/.test(text)) text = text.replace(/\)\s*$/, '')
  const e = /(?:^|\n)\s*E\)/.exec(text)
  const header = e ? text.slice(0, e.index) : text
  const fields = {}
  const markers = [...header.matchAll(/(?:^|\s)([ABCDQ])\)\s*/g)]
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    fields[marker[1]] = header.slice(marker.index + marker[0].length, markers[i + 1]?.index ?? header.length).trim()
  }
  if (e) {
    const body = text.slice(e.index + e[0].length)
    const fg = /(?:^|\n)\s*F\)\s*([\s\S]*?)\s+G\)\s*([\s\S]*)$/.exec(body)
    fields.E = (fg ? body.slice(0, fg.index) : body).trim()
    if (fg) { fields.F = fg[1].trim(); fields.G = fg[2].trim() }
  }
  return fields
}

export function notamInstant(token) {
  const match = /^(\d{10})(?:EST)?$/.exec(String(token || '').trim())
  if (!match) return null
  const s = match[1]
  const iso = `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}T${s.slice(6, 8)}:${s.slice(8, 10)}:00.000Z`
  const ms = Date.parse(iso)
  return Number.isFinite(ms) && new Date(ms).toISOString() === iso ? iso : null
}

export function parseNotamHeight(token) {
  const text = String(token || '').trim().toUpperCase()
  if (/^(SFC|GND)$/.test(text)) return { value: 0, unit: 'SFC', ref: 'AGL' }
  if (/^(UNL|UNLTD|UNLIMITED)$/.test(text)) return { value: null, unit: 'UNL', ref: null }
  const fl = /^FL\s*(\d+)$/.exec(text)
  if (fl) return { value: Number(fl[1]), unit: 'FL', ref: 'STD' }
  const height = /^([\d,.]+)\s*(FT|M)\s*(AMSL|MSL|AGL)?$/.exec(text)
  if (!height) return null
  const value = Number(height[1].replaceAll(',', ''))
  return Number.isFinite(value) ? { value, unit: height[2], ref: height[3] === 'MSL' ? 'AMSL' : height[3] || null } : null
}

export function parseNotamAltitude(qLine, lowerText, upperText) {
  const lowerBound = parseNotamHeight(lowerText)
  const upperBound = parseNotamHeight(upperText)
  if (lowerBound && upperBound) {
    // Legacy numeric band is retained for old consumers. bounds are authoritative.
    const sameFl = lowerBound.unit === 'FL' && upperBound.unit === 'FL'
    const numeric = (bound) => bound.unit === 'UNL' ? 99999 : bound.unit === 'FL' ? bound.value * 100 : bound.unit === 'M' ? bound.value / 0.3048 : bound.value
    const ref = lowerBound.unit === 'SFC' ? (upperBound.ref === 'STD' ? null : upperBound.ref)
      : lowerBound.ref === upperBound.ref && lowerBound.ref !== 'STD' ? lowerBound.ref : null
    return { lower: sameFl ? lowerBound.value : numeric(lowerBound), upper: sameFl ? upperBound.value : numeric(upperBound),
      unit: sameFl ? 'FL' : 'FT', ref, source: 'fg', lowerBound, upperBound }
  }
  const band = /\/(\d{3})\/(\d{3})\/\d/.exec(String(qLine || ''))
  return band ? { lower: Number(band[1]), upper: Number(band[2]), unit: 'FL', ref: null, source: 'qline' } : null
}

export function notamGeographicExclusions(summary) {
  return [...String(summary || '').replace(/\s+/g, ' ').matchAll(/\b(?:EXC|EXCLUDING)\s+(?:THE AREA THAT OVERLAP WITH\s+)?(?:RK[A-Z]{2}\s+CTR|UA\d+|ATS RTE [A-Z0-9/]+)/gi)].map(match => match[0])
}

// Old snapshots are repaired from their original text in memory, never rewritten.
export function hydrateNotamItem(item) {
  if (!item?.rawText) return item
  const f = splitNotamFields(item.rawText)
  const validFrom = notamInstant(f.B), validTo = f.C === 'PERM' ? '2099-12-31T23:59:00.000Z' : notamInstant(f.C)
  if (!validFrom || !validTo || !f.E) return item
  return { ...item, valid_from: validFrom, valid_to: validTo, schedule_text: f.D || null,
    validity_end: f.C === 'PERM' ? 'permanent' : /EST$/.test(f.C) ? 'estimated' : 'fixed',
    altitude: parseNotamAltitude(f.Q, f.F, f.G), summary: f.E,
    geographicExclusions: notamGeographicExclusions(f.E),
    coverage: item.scope === 'fir' && ['prohibited', 'restricted', 'danger', 'firing'].includes(item.category) ? 'area' : item.scope,
    parser_version: 2 }
}

export function hydrateNotamSnapshot(data) {
  return Array.isArray(data?.items) ? { ...data, items: data.items.map(hydrateNotamItem), parser_version: 2 } : data
}
