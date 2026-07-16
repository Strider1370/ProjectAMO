import fs from 'node:fs'
import path from 'node:path'

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function currentFile(dataRoot, relativePath) {
  const root = path.resolve(dataRoot, 'aip', 'current')
  const target = path.resolve(root, relativePath)
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('invalid AIP current path')
  return target
}

function loadActiveSnapshot(dataRoot) {
  try {
    const manifest = readJson(path.join(dataRoot, 'aip', 'current', 'manifest.json'))
    if (manifest.status !== 'active' || !manifest.snapshot || !manifest.validation) return null
    const snapshot = readJson(currentFile(dataRoot, manifest.snapshot))
    const validation = readJson(currentFile(dataRoot, manifest.validation))
    if (!Array.isArray(snapshot.segments) || (validation.validationErrors ?? []).length > 0) return null
    return { manifest, snapshot }
  } catch {
    return null
  }
}

function directionFor(routeSegment, aipSegment) {
  if (routeSegment.fromFix === aipSegment.fromFix && routeSegment.toFix === aipSegment.toFix) return 'forward'
  if (routeSegment.fromFix === aipSegment.toFix && routeSegment.toFix === aipSegment.fromFix) return 'reverse'
  return null
}

function constraintFields(aipSegment, direction) {
  return {
    minimumFlightAltitude: aipSegment.minimumFlightAltitude ?? null,
    meaMoca: aipSegment.meaMoca ?? null,
    lowerLimit: aipSegment.lowerLimit ?? null,
    upperLimit: aipSegment.upperLimit ?? null,
    limitPairs: aipSegment.limitPairs ?? null,
    cruisingLevelSeries: aipSegment.cruisingLevelSeries
      ? { direction, series: aipSegment.cruisingLevelSeries[direction] ?? null, all: aipSegment.cruisingLevelSeries }
      : null,
  }
}

export function attachActiveAipConstraints({ dataRoot, routeModel } = {}) {
  const routeSegments = routeModel?.enRouteSegments
  if (!Array.isArray(routeSegments)) return { status: 'unavailable', provenance: null, segments: [] }
  if (routeSegments.length === 0) return { status: 'not_applicable', provenance: null, segments: [] }

  const active = dataRoot ? loadActiveSnapshot(dataRoot) : null
  if (!active) {
    return {
      status: 'unavailable',
      provenance: null,
      segments: routeSegments.map((segment) => ({ id: segment.id, status: 'unavailable', constraints: null })),
    }
  }

  const byId = new Map(active.snapshot.segments.map((segment) => [segment.id, segment]))
  const segments = routeSegments.map((routeSegment) => {
    const aipSegment = byId.get(routeSegment.id)
    if (routeSegment.alignmentStatus !== 'aligned' || !aipSegment || aipSegment.review?.status !== 'reviewed') {
      return { id: routeSegment.id, status: 'unavailable', constraints: null }
    }
    const direction = directionFor(routeSegment, aipSegment)
    if (!direction) return { id: routeSegment.id, status: 'conflicting', constraints: null }
    return { id: routeSegment.id, status: 'matched', constraints: constraintFields(aipSegment, direction) }
  })
  const hasConflict = segments.some((segment) => segment.status === 'conflicting')
  const matched = segments.filter((segment) => segment.status === 'matched').length
  const status = hasConflict ? 'conflicting' : matched === segments.length ? 'matched' : matched ? 'partial' : 'unavailable'

  return {
    status,
    provenance: {
      publicationId: active.manifest.publicationId,
      effectiveAt: active.manifest.effectiveAt,
      validationStatus: 'validated',
    },
    segments,
  }
}
