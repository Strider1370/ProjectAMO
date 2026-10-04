// Connected occupied cells. All rings retain holes for fills; outerRings omit holes for outlines.
export function cellRegionRings(nx, ny, occupied) {
  const edges = [], adjacent = new Map()
  const has = (x, y) => x >= 0 && x < nx && y >= 0 && y < ny && occupied(x, y)
  const key = (x, y) => `${x},${y}`
  function edge(x, y, tx, ty, direction) {
    const index = edges.length
    edges.push({ from: [x, y], to: [tx, ty], direction })
    const k = key(x, y)
    adjacent.set(k, [...(adjacent.get(k) ?? []), index])
  }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (has(x, y)) {
    if (!has(x, y - 1)) edge(x, y, x + 1, y, 0)
    if (!has(x + 1, y)) edge(x + 1, y, x + 1, y + 1, 1)
    if (!has(x, y + 1)) edge(x + 1, y + 1, x, y + 1, 2)
    if (!has(x - 1, y)) edge(x, y + 1, x, y, 3)
  }
  const used = new Set(), rings = []
  for (let first = 0; first < edges.length; first++) {
    if (used.has(first)) continue
    let index = first
    const ring = [edges[first].from]
    while (!used.has(index)) {
      used.add(index)
      const current = edges[index]
      ring.push(current.to)
      if (key(...current.to) === key(...ring[0])) break
      const next = (adjacent.get(key(...current.to)) ?? []).filter(i => !used.has(i))
      // Right turn keeps diagonally touching cells in separate components.
      const rank = i => [1, 0, 3, 2].indexOf((edges[i].direction - current.direction + 4) % 4)
      next.sort((a, b) => rank(a) - rank(b))
      if (!next.length) break
      index = next[0]
    }
    if (ring.length >= 4 && key(...ring[0]) === key(...ring.at(-1))) rings.push(simplifyRing(ring))
  }
  return { rings, outerRings: rings.filter(ring => signedArea(ring) > 0) }
}

function simplifyRing(ring) {
  const points = ring.slice(0, -1)
  const simple = points.filter((p, i) => {
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length]
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0])
  })
  return [...simple, simple[0]]
}

export function signedArea(ring) {
  return ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0) / 2
}

function insideRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

export function ringsToPolygons(rings) {
  const outers = rings.filter(r => signedArea(r) > 0).map(r => [r])
  for (const hole of rings.filter(r => signedArea(r) < 0)) {
    const owner = outers.filter(p => insideRing(hole[0], p[0])).sort((a, b) => signedArea(a[0]) - signedArea(b[0]))[0]
    if (owner) owner.push(hole)
  }
  return outers
}

export function isothermSegments({ nx, ny, values, xs, ys }, level) {
  const segments = [], seen = new Set()
  const key = p => `${p.x.toFixed(8)},${p.y.toFixed(8)}`
  for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const points = [{ x: xs[x], y: ys[y] }, { x: xs[x + 1], y: ys[y] }, { x: xs[x + 1], y: ys[y + 1] }, { x: xs[x], y: ys[y + 1] }]
    const v = [values[y * nx + x], values[y * nx + x + 1], values[(y + 1) * nx + x + 1], values[(y + 1) * nx + x]]
    if (!v.every(Number.isFinite)) continue
    const crossings = []
    for (let a = 0; a < 4; a++) {
      const b = (a + 1) % 4
      if ((v[a] >= level) === (v[b] >= level)) continue
      const t = (level - v[a]) / (v[b] - v[a])
      crossings.push({ edge: a, point: { x: points[a].x + (points[b].x - points[a].x) * t, y: points[a].y + (points[b].y - points[a].y) * t } })
    }
    let pairs = crossings.length === 2 ? [[0, 1]] : []
    if (crossings.length === 4) {
      const determinant = (v[0] - level) * (v[2] - level) - (v[1] - level) * (v[3] - level)
      pairs = determinant >= 0 ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]]
    }
    for (const [a, b] of pairs) {
      const segment = [crossings[a].point, crossings[b].point]
      const keys = segment.map(key).sort()
      if (keys[0] === keys[1] || seen.has(keys.join('|'))) continue
      seen.add(keys.join('|')); segments.push(segment)
    }
  }
  return segments
}

export function chainContourSegments(segments) {
  const key = p => `${p.x.toFixed(8)},${p.y.toFixed(8)}`
  const adjacent = new Map()
  segments.forEach((s, i) => s.forEach(p => { const k = key(p); adjacent.set(k, [...(adjacent.get(k) ?? []), i]) }))
  const used = new Set(), chains = []
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue
    const chain = [...segments[i]]; used.add(i)
    for (const end of [true, false]) {
      while (true) {
        const tip = end ? chain.at(-1) : chain[0]
        const next = (adjacent.get(key(tip)) ?? []).find(j => !used.has(j))
        if (next == null) break
        used.add(next)
        const p = key(segments[next][0]) === key(tip) ? segments[next][1] : segments[next][0]
        if (end) chain.push(p); else chain.unshift(p)
      }
    }
    chains.push(chain)
  }
  return chains
}
