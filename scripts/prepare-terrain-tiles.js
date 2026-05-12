#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const terrainRoot = path.join(projectRoot, 'backend', 'data', 'terrain')
const sourcePath = path.join(terrainRoot, 'korea3sec.bin')
const tilesDir = path.join(terrainRoot, 'tiles')
const metadataPath = path.join(tilesDir, 'metadata.json')

const bounds = { minLon: 124, maxLon: 130, minLat: 33, maxLat: 43 }
const pointsPerDegree = 1200
const lonSpan = bounds.maxLon - bounds.minLon
const latSpan = bounds.maxLat - bounds.minLat

function detectLayout(byteLength) {
  const cells = byteLength / 2
  const inclusiveCols = lonSpan * pointsPerDegree + 1
  const inclusiveRows = latSpan * pointsPerDegree + 1
  const exclusiveCols = lonSpan * pointsPerDegree
  const exclusiveRows = latSpan * pointsPerDegree

  if (cells === inclusiveCols * inclusiveRows) {
    return { cols: inclusiveCols, rows: inclusiveRows, inclusive: true }
  }

  if (cells % inclusiveCols === 0 && cells / inclusiveCols >= inclusiveRows) {
    return {
      cols: inclusiveCols,
      rows: cells / inclusiveCols,
      inclusive: true,
      usedRows: inclusiveRows,
      ignoredTrailingRows: (cells / inclusiveCols) - inclusiveRows,
    }
  }

  if (cells === exclusiveCols * exclusiveRows) {
    return { cols: exclusiveCols, rows: exclusiveRows, inclusive: false }
  }

  throw new Error(`Unexpected DEM size: ${byteLength} bytes. Expected ${inclusiveCols * inclusiveRows * 2} or ${exclusiveCols * exclusiveRows * 2}.`)
}

function tileFileName(lon, lat) {
  return `E${String(lon).padStart(3, '0')}_N${String(lat).padStart(2, '0')}.bin`
}

function copyTile(source, layout, tileLon, tileLat) {
  const startCol = (tileLon - bounds.minLon) * pointsPerDegree
  const startRow = (tileLat - bounds.minLat) * pointsPerDegree
  const tileCols = layout.inclusive ? pointsPerDegree + 1 : pointsPerDegree
  const tileRows = layout.inclusive ? pointsPerDegree + 1 : pointsPerDegree
  const buffer = Buffer.alloc(tileCols * tileRows * 2)

  for (let row = 0; row < tileRows; row += 1) {
    const sourceRow = startRow + row
    const sourceOffset = (sourceRow * layout.cols + startCol) * 2
    const targetOffset = row * tileCols * 2
    source.copy(buffer, targetOffset, sourceOffset, sourceOffset + tileCols * 2)
  }

  return { buffer, rows: tileRows, cols: tileCols }
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing ${sourcePath}`)
  console.error('Decompress korea3sec.bin.Z to backend/data/terrain/korea3sec.bin, then run this script again.')
  process.exit(1)
}

const stat = fs.statSync(sourcePath)
const layout = detectLayout(stat.size)
const source = fs.readFileSync(sourcePath)
fs.mkdirSync(tilesDir, { recursive: true })

const metadata = {
  source: 'korea3sec.bin',
  byteOrder: 'int16be',
  heightUnit: 'm',
  bounds,
  pointsPerDegree,
  sourceLayout: layout,
  noDataValues: [-32768],
  tileOrder: 'lat-ascending-lon-ascending',
  tiles: {},
}

for (let lat = bounds.minLat; lat < bounds.maxLat; lat += 1) {
  for (let lon = bounds.minLon; lon < bounds.maxLon; lon += 1) {
    const name = tileFileName(lon, lat)
    const tile = copyTile(source, layout, lon, lat)
    fs.writeFileSync(path.join(tilesDir, name), tile.buffer)
    metadata.tiles[name] = {
      name,
      bounds: { minLon: lon, maxLon: lon + 1, minLat: lat, maxLat: lat + 1 },
      rows: tile.rows,
      cols: tile.cols,
    }
  }
}

fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8')
console.log(`Prepared ${Object.keys(metadata.tiles).length} terrain tiles in ${tilesDir}`)
