const EDGE_VERTICES = { top: ['tl', 'tr'], right: ['tr', 'br'], bottom: ['br', 'bl'], left: ['bl', 'tl'] }
const SIMPLE_CASES = { 1: [['left', 'top']], 2: [['top', 'right']], 3: [['left', 'right']], 4: [['right', 'bottom']], 6: [['top', 'bottom']], 7: [['left', 'bottom']], 8: [['bottom', 'left']], 9: [['top', 'bottom']], 11: [['right', 'bottom']], 12: [['left', 'right']], 13: [['top', 'right']], 14: [['left', 'top']] }
const key = (p) => `${p.distanceNm.toFixed(4)},${p.altFt.toFixed(2)}`
function pairsFor(mask, inside) {
  if (mask === 5) return inside ? [['top', 'right'], ['bottom', 'left']] : [['left', 'top'], ['right', 'bottom']]
  if (mask === 10) return inside ? [['left', 'top'], ['right', 'bottom']] : [['top', 'right'], ['bottom', 'left']]
  return SIMPLE_CASES[mask] ?? []
}
function point(a, b, threshold) {
  const ratio = a.cld === b.cld ? 0.5 : (threshold - a.cld) / (b.cld - a.cld)
  return { distanceNm: a.distanceNm + (b.distanceNm - a.distanceNm) * ratio, altFt: a.altFt + (b.altFt - a.altFt) * ratio }
}
export function buildCloudContourModel(levels, threshold) {
  const values = levels.flatMap((level) => level.values ?? [])
  const finite = values.filter((v) => Number.isFinite(v.cld))
  const partial = finite.length > 0 && values.some((v) => !Number.isFinite(v.cld) || !Number.isFinite(v.distanceNm) || !Number.isFinite(v.altFt))
  const status = finite.length === 0 ? 'unavailable' : finite.some((v) => v.cld >= threshold) ? 'detected' : 'not_detected'
  const segments = []
  const segmentKeys = new Set()
  for (let y = 0; y < levels.length - 1; y++) for (let x = 0; x < Math.min(levels[y].values?.length ?? 0, levels[y + 1].values?.length ?? 0) - 1; x++) {
    const vertices = { tl: levels[y].values[x], tr: levels[y].values[x + 1], br: levels[y + 1].values[x + 1], bl: levels[y + 1].values[x] }
    if (!Object.values(vertices).every((v) => Number.isFinite(v.cld) && Number.isFinite(v.distanceNm) && Number.isFinite(v.altFt))) continue
    const mask = (vertices.tl.cld >= threshold ? 1 : 0) | (vertices.tr.cld >= threshold ? 2 : 0) | (vertices.br.cld >= threshold ? 4 : 0) | (vertices.bl.cld >= threshold ? 8 : 0)
    const centerInside = Object.values(vertices).reduce((sum, v) => sum + v.cld, 0) / 4 >= threshold
    for (const [a, b] of pairsFor(mask, centerInside)) {
      const segment = [point(vertices[EDGE_VERTICES[a][0]], vertices[EDGE_VERTICES[a][1]], threshold), point(vertices[EDGE_VERTICES[b][0]], vertices[EDGE_VERTICES[b][1]], threshold)]
      const endpoints = [key(segment[0]), key(segment[1])].sort()
      if (endpoints[0] === endpoints[1]) continue
      const segmentKey = endpoints.join('|')
      if (!segmentKeys.has(segmentKey)) { segmentKeys.add(segmentKey); segments.push(segment) }
    }
  }
  const adjacent = new Map(); segments.forEach((s, i) => s.forEach((p) => { const k = key(p); adjacent.set(k, [...(adjacent.get(k) ?? []), i]) }))
  const used = new Set(), chains = []
  for (let i = 0; i < segments.length; i++) { if (used.has(i)) continue; const chain = [...segments[i]]; used.add(i)
    for (const end of [1, 0]) { let growing = true; while (growing) { growing = false; const at = end ? chain.at(-1) : chain[0]; for (const next of adjacent.get(key(at)) ?? []) if (!used.has(next)) { const segment = segments[next], p = key(segment[0]) === key(at) ? segment[1] : segment[0]; if (key(p) !== key(at)) end ? chain.push(p) : chain.unshift(p); used.add(next); growing = true; break } } }
    if (key(chain[0]) === key(chain.at(-1))) chain[chain.length - 1] = chain[0]; chains.push(chain)
  }
  return { status, partial, threshold, chains }
}
