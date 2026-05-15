export function hasStyleRevision(styleRevision) {
  return Number.isInteger(styleRevision) && styleRevision > 0
}

export function flattenLayerIds(values) {
  const result = []
  const seen = new Set()

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || seen.has(value)) return
    seen.add(value)
    result.push(value)
  }

  visit(values)
  return result
}

export function bindLayerEvent(map, type, layerId, handler) {
  if (!map || !type || !layerId || typeof handler !== 'function') return null
  map.on(type, layerId, handler)
  return () => map.off(type, layerId, handler)
}

export function cleanupAll(cleanups) {
  cleanups.filter(Boolean).forEach((cleanup) => cleanup())
}
