#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const DEFAULT_SOURCE = path.join(projectRoot, 'frontend', 'public', 'Geo', 'sido.json')
const DEFAULT_OUTPUT = path.join(projectRoot, 'backend', 'data', 'terrain', 'land-water-mask.json')
const DEFAULT_BOUNDS = { minLon: 124, maxLon: 130, minLat: 33, maxLat: 43 }
const DEFAULT_RESOLUTION_DEG = 0.01

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    bounds: DEFAULT_BOUNDS,
    resolutionDeg: DEFAULT_RESOLUTION_DEG,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--source' && next) {
      options.source = path.resolve(next)
      i += 1
    } else if (arg === '--output' && next) {
      options.output = path.resolve(next)
      i += 1
    } else if (arg === '--resolution' && next) {
      options.resolutionDeg = Number(next)
      i += 1
    } else if (arg === '--bounds' && next) {
      const [minLon, maxLon, minLat, maxLat] = next.split(',').map(Number)
      options.bounds = { minLon, maxLon, minLat, maxLat }
      i += 1
    } else if (arg === '--help') {
      printHelp()
      process.exit(0)
    }
  }

  validateOptions(options)
  return options
}

function validateOptions(options) {
  const { bounds, resolutionDeg } = options
  if (!Number.isFinite(resolutionDeg) || resolutionDeg <= 0) {
    throw new Error('--resolution must be a positive number')
  }
  for (const key of ['minLon', 'maxLon', 'minLat', 'maxLat']) {
    if (!Number.isFinite(bounds[key])) {
      throw new Error('--bounds must be "minLon,maxLon,minLat,maxLat"')
    }
  }
  if (bounds.minLon >= bounds.maxLon || bounds.minLat >= bounds.maxLat) {
    throw new Error('--bounds minimums must be less than maximums')
  }
}

function printHelp() {
  console.log(`Usage: node scripts/prepare-land-water-mask.js [options]

Creates a lightweight land/water grid mask from frontend/public/Geo/sido.json.

Options:
  --source <path>       Source SIDO GeoJSON. Default: frontend/public/Geo/sido.json
  --output <path>       Output mask JSON. Default: backend/data/terrain/land-water-mask.json
  --bounds <csv>        minLon,maxLon,minLat,maxLat. Default: 124,130,33,43
  --resolution <deg>    Grid resolution in degrees. Default: 0.01
`)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function ringBounds(ring) {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  for (const point of ring) {
    const lon = point[0]
    const lat = point[1]
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  return { minLon, maxLon, minLat, maxLat }
}

function containsBounds(bounds, lon, lat) {
  return lon >= bounds.minLon && lon <= bounds.maxLon && lat >= bounds.minLat && lat <= bounds.maxLat
}

function pointInRing(lon, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersects = ((yi > lat) !== (yj > lat)) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function normalizePolygons(geojson) {
  const polygons = []
  for (const feature of geojson.features ?? []) {
    const geometry = feature.geometry
    const coordinateSets = geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : []

    for (const polygon of coordinateSets) {
      const rings = polygon
        .filter((ring) => Array.isArray(ring) && ring.length >= 4)
        .map((ring) => ({ coordinates: ring, bounds: ringBounds(ring) }))

      if (rings.length > 0) {
        polygons.push({
          rings,
          bounds: rings.reduce((acc, ring) => ({
            minLon: Math.min(acc.minLon, ring.bounds.minLon),
            maxLon: Math.max(acc.maxLon, ring.bounds.maxLon),
            minLat: Math.min(acc.minLat, ring.bounds.minLat),
            maxLat: Math.max(acc.maxLat, ring.bounds.maxLat),
          }), { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity }),
        })
      }
    }
  }
  return polygons
}

function pointInPolygon(lon, lat, polygon) {
  if (!containsBounds(polygon.bounds, lon, lat)) return false
  const [outerRing, ...holes] = polygon.rings
  if (!containsBounds(outerRing.bounds, lon, lat) || !pointInRing(lon, lat, outerRing.coordinates)) {
    return false
  }
  return !holes.some((hole) => containsBounds(hole.bounds, lon, lat) && pointInRing(lon, lat, hole.coordinates))
}

function pointInAnyPolygon(lon, lat, polygons) {
  return polygons.some((polygon) => pointInPolygon(lon, lat, polygon))
}

function gridCellCount(min, max, resolutionDeg) {
  return Math.ceil((max - min) / resolutionDeg - 1e-9)
}

function createMask({ bounds, resolutionDeg, polygons }) {
  const cols = gridCellCount(bounds.minLon, bounds.maxLon, resolutionDeg)
  const rows = gridCellCount(bounds.minLat, bounds.maxLat, resolutionDeg)
  const cells = []
  let landCells = 0

  for (let row = 0; row < rows; row += 1) {
    let line = ''
    const lat = bounds.minLat + (row + 0.5) * resolutionDeg
    for (let col = 0; col < cols; col += 1) {
      const lon = bounds.minLon + (col + 0.5) * resolutionDeg
      const isLand = pointInAnyPolygon(lon, lat, polygons)
      line += isLand ? '1' : '0'
      if (isLand) landCells += 1
    }
    cells.push(line)
  }

  return {
    type: 'land-water-grid-mask',
    source: 'sido.json',
    cellEncoding: '1=land,0=water-or-outside-sido',
    bounds,
    resolutionDeg,
    rows,
    cols,
    landCells,
    waterCells: rows * cols - landCells,
    cells,
  }
}

const options = parseArgs(process.argv.slice(2))
const geojson = readJson(options.source)
const polygons = normalizePolygons(geojson)
const mask = createMask({ bounds: options.bounds, resolutionDeg: options.resolutionDeg, polygons })

fs.mkdirSync(path.dirname(options.output), { recursive: true })
fs.writeFileSync(options.output, JSON.stringify(mask, null, 2) + '\n', 'utf8')

console.log(`Prepared land/water mask: ${options.output}`)
console.log(`Grid: ${mask.cols} x ${mask.rows} (${mask.landCells} land, ${mask.waterCells} water/outside)`)
