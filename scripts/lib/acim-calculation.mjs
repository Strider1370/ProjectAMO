// Research prototype of the source calculation. Not yet wired into runtime data.
export function seasonForTmfc(tmfc) {
  if (!/^\d{10}$/.test(tmfc)) throw new Error('Invalid ACIM initialization time')
  const month = Number(tmfc.slice(4, 6))
  if (month < 1 || month > 12) throw new Error('Invalid ACIM month')
  return month === 12 || month < 3 ? 'DJF' : month < 6 ? 'MAM' : month < 9 ? 'JJA' : 'SON'
}

function polynomial(c, prefix, value) {
  // Preserve the source expression; do not clamp individual membership scores.
  let result = c[`${prefix}0`]
  for (let power = 1; power <= 6; power++) result += c[`${prefix}${power}`] * value ** power
  return result
}

export function calculateAcim(olr, precc, coefficients) {
  if (![olr, precc].every(Number.isFinite) || olr < 0 || precc < 0) return null
  const c = coefficients
  // Source leaves olr == OLR1 unassigned. Explicitly assign the low-OLR branch.
  const molr = olr <= c.OLR1 ? 1 : olr > c.OLR2 ? 0 : polynomial(c, 'cOLR', olr)
  const mapcp = precc <= c.APCP1 ? 0 : precc > c.APCP2 ? 1 : polynomial(c, 'cAPCP', precc)
  return Math.max(0, Math.min(1, c.a * molr + c.b * mapcp))
}

export function topFeetForAcim(aci, table) {
  if (!Number.isFinite(aci) || aci < 0 || aci > 1) return null
  let top = 0
  for (const [fl, threshold] of table) if (aci >= threshold) top = fl * 100
  return top
}

export function altitudeBand(topFt) {
  return topFt == null ? null : topFt < 5000 ? -1 : Math.min(6, Math.floor(topFt / 5000) - 1)
}
