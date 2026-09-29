const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

export function windParts(speed) {
  if (!Number.isFinite(speed) || speed < 0) return null
  const rounded = Math.round(speed / 5) * 5
  return { pennants: Math.floor(rounded / 50), full: Math.floor((rounded % 50) / 10), half: rounded % 10 >= 5 ? 1 : 0 }
}

export function nearestTangent(point, paths) {
  let best = null
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y
    const length2 = dx * dx + dy * dy
    if (length2 < 0.001) continue
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2))
    const gap = Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)
    if (!best || gap < best.gap) best = { angle: Math.atan2(dy, dx), gap }
  }
  return best?.angle ?? 0
}

// Use at a settled camera only. Repeating this every zoom frame makes the
// pattern's phase travel along the boundary as its screen length changes.
export function resamplePath(points, spacing) {
  if (!points.length) return []
  const output = [points[0]]
  let remaining = spacing
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1], b = points[i], length = distance(a, b)
    while (length >= remaining && length > 0) {
      const t = remaining / length
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      output.push(a); length = distance(a, b); remaining = spacing
    }
    remaining -= length
  }
  if (distance(output.at(-1), points.at(-1)) > 0.1) output.push(points.at(-1))
  return output
}

/** Anchor decoration endpoints to geography until the camera has settled.
 * Cache by immutable source line, so pan, zoom, redraw and filter changes do
 * not redistribute scallops. Reset explicitly after zoom/pitch/resize settles.
 */
export function createBoundaryPatterns() {
  let cache = new WeakMap()
  return {
    get(line, spacing, project, unproject) {
      let anchors = cache.get(line)
      if (!anchors) {
        anchors = resamplePath(line.map(project), spacing).map(unproject)
        cache.set(line, anchors)
      }
      return anchors
    },
    reset() { cache = new WeakMap() },
  }
}

export const isSelectableHazard = p => ['TURBULENCE', 'AIRFRAME_ICING'].includes(p.phenomenon)

// Clip full rings before Mercator projection. Polar spline overshoot can exceed
// latitude 90; both clipping edges stay outside the preview's -20..70 latitude.
// Interpolate crossings instead of clamping vertices, preserving visible edges.
export function clipPolarRing(ring) {
  let result = ring
  for (const [limit, sign] of [[-85, 1], [85, -1]]) {
    const output = []
    for (let i = 0; i < result.length; i++) {
      const a = result[(i + result.length - 1) % result.length], b = result[i]
      const aInside = (a[1] - limit) * sign >= 0, bInside = (b[1] - limit) * sign >= 0
      if (aInside !== bInside) {
        const t = (limit - a[1]) / (b[1] - a[1])
        output.push([a[0] + t * (b[0] - a[0]), limit])
      }
      if (bInside) output.push(b)
    }
    result = output
  }
  return result
}

function inRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

// Each polygon has one exterior and zero or more holes. Separate polygons are
// a union; they must not cancel each other as an even-odd multi-polygon would.
export function insideArea(point, polygons) {
  return polygons.some(([outer, ...holes]) => inRing(point, outer) && !holes.some(ring => inRing(point, ring)))
}

export function nearBoundary(point, paths, tolerance = 7) {
  return paths.some(path => path.some((b, i) => {
    if (!i) return false
    const a = path[i - 1], dx = b.x - a.x, dy = b.y - a.y
    const length2 = dx * dx + dy * dy
    const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= tolerance
  }))
}
