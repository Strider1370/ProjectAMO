import fs from 'fs'
import path from 'path'

const DEFAULT_CACHE_SIZE = 12
const TILE_NAME_RE = /^E(\d{3})_N(\d{2})\.bin$/

function tileName(lonDeg, latDeg) {
  return `E${String(lonDeg).padStart(3, '0')}_N${String(latDeg).padStart(2, '0')}.bin`
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

export function getTerrainTileIndex(lon, lat, metadata) {
  const { bounds, pointsPerDegree } = metadata
  const maxTileLon = bounds.maxLon - 1
  const maxTileLat = bounds.maxLat - 1

  if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) {
    return null
  }

  const tileLon = Math.min(Math.max(Math.floor(lon), bounds.minLon), maxTileLon)
  const tileLat = Math.min(Math.max(Math.floor(lat), bounds.minLat), maxTileLat)
  const tile = metadata.tiles?.[tileName(tileLon, tileLat)]

  if (!tile) return null

  const localLon = Math.min(Math.max(lon - tileLon, 0), 1)
  const localLat = Math.min(Math.max(lat - tileLat, 0), 1)
  const col = Math.min(tile.cols - 1, Math.max(0, Math.round(localLon * pointsPerDegree)))
  const row = Math.min(tile.rows - 1, Math.max(0, Math.round(localLat * pointsPerDegree)))

  return {
    tileName: tile.name,
    tileLon,
    tileLat,
    row,
    col,
    rows: tile.rows,
    cols: tile.cols,
  }
}

export class TerrainTileCache {
  constructor({ terrainRoot, maxTiles = DEFAULT_CACHE_SIZE } = {}) {
    this.terrainRoot = terrainRoot
    this.tilesDir = path.join(terrainRoot, 'tiles')
    this.metadataPath = path.join(this.tilesDir, 'metadata.json')
    this.maxTiles = maxTiles
    this.metadata = null
    this.cache = new Map()
  }

  loadMetadata() {
    if (this.metadata) return this.metadata
    if (!fs.existsSync(this.metadataPath)) {
      const sourcePath = path.join(this.terrainRoot, 'korea3sec.bin')
      const detail = fs.existsSync(sourcePath)
        ? 'Run node scripts/prepare-terrain-tiles.js before requesting vertical profiles.'
        : 'Place decompressed backend/data/terrain/korea3sec.bin, then run node scripts/prepare-terrain-tiles.js.'
      const error = new Error(`Terrain tiles are not prepared. ${detail}`)
      error.code = 'TERRAIN_NOT_READY'
      throw error
    }
    this.metadata = readJson(this.metadataPath)
    return this.metadata
  }

  getTile(index) {
    if (this.cache.has(index.tileName)) {
      const cached = this.cache.get(index.tileName)
      this.cache.delete(index.tileName)
      this.cache.set(index.tileName, cached)
      return cached
    }

    const filePath = path.join(this.tilesDir, index.tileName)
    const buffer = fs.readFileSync(filePath)
    const tile = { buffer, rows: index.rows, cols: index.cols }
    this.cache.set(index.tileName, tile)

    while (this.cache.size > this.maxTiles) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }

    return tile
  }

  sampleNearest(lon, lat) {
    const metadata = this.loadMetadata()
    const index = getTerrainTileIndex(lon, lat, metadata)
    if (!index) return null

    const tile = this.getTile(index)
    const offset = (index.row * tile.cols + index.col) * 2
    if (offset < 0 || offset + 2 > tile.buffer.length) return null

    const elevationM = metadata.byteOrder === 'int16be'
      ? tile.buffer.readInt16BE(offset)
      : tile.buffer.readInt16LE(offset)
    if (metadata.noDataValues?.includes(elevationM)) return null
    return elevationM
  }
}

export function listTileNames(metadata) {
  return Object.keys(metadata.tiles ?? {}).filter((name) => TILE_NAME_RE.test(name))
}
