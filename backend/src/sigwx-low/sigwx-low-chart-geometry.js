const MAP_RANGES = {
  normal: { minLat: 27.5, maxLat: 39, minLon: 121, maxLon: 135 },
  wide: { minLat: 27.3, maxLat: 44, minLon: 119, maxLon: 135 },
}

export function fpvPointToLngLat(point, source) {
  const width = Number(source?.fpv_safe_bound_width)
  const height = Number(source?.fpv_safe_bound_height)
  const x = Number(point?.x)
  const y = Number(point?.y)
  if (![width, height, x, y].every(Number.isFinite) || width === 0 || height === 0) return null

  const range = MAP_RANGES[String(source?.map_range_mode || 'normal')] || MAP_RANGES.normal
  const lon = range.minLon + (x / width) * (range.maxLon - range.minLon)
  const lat = range.maxLat - (y / height) * (range.maxLat - range.minLat)
  return [lon, lat]
}

export function samplePolylineByDistance(points, options = {}) {
  if (!Array.isArray(points) || points.length < 2) return []
  const offset = Number.isFinite(Number(options.offset)) ? Number(options.offset) : 0
  const repeat = Number.isFinite(Number(options.repeat)) ? Number(options.repeat) : 100
  if (repeat <= 0) return []

  const segments = []
  let totalLength = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const dx = Number(b?.x) - Number(a?.x)
    const dy = Number(b?.y) - Number(a?.y)
    const length = Math.sqrt((dx * dx) + (dy * dy))
    if (length <= 0.0001) continue
    segments.push({ a, dx, dy, length, start: totalLength, end: totalLength + length })
    totalLength += length
  }

  const samples = []
  for (let distance = offset; distance < totalLength; distance += repeat) {
    const segment = segments.find((entry) => distance >= entry.start && distance <= entry.end)
    if (!segment) continue
    const ratio = (distance - segment.start) / segment.length
    samples.push({
      x: Number(segment.a.x) + (segment.dx * ratio),
      y: Number(segment.a.y) + (segment.dy * ratio),
      angle: Math.atan2(segment.dy, segment.dx) * (180 / Math.PI),
    })
  }
  return samples
}

function polygonSignedArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += (Number(a.x) * Number(b.y)) - (Number(b.x) * Number(a.y))
  }
  return area / 2
}

export function offsetSamplesFromPolygon(samples, polygonPoints, offset) {
  const signedArea = polygonSignedArea(polygonPoints)
  const clockwise = signedArea < 0
  const distance = Number(offset) || 0

  return (samples || []).map((sample) => {
    const rad = (Number(sample.angle) || 0) * (Math.PI / 180)
    const nx = clockwise ? -Math.sin(rad) : Math.sin(rad)
    const ny = clockwise ? Math.cos(rad) : -Math.cos(rad)
    return {
      ...sample,
      x: sample.x + (nx * distance),
      y: sample.y + (ny * distance),
      nx,
      ny,
    }
  })
}
