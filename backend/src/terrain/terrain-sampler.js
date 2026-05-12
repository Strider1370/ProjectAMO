import path from 'path'
import { TerrainTileCache } from './terrain-cache.js'

export function createTerrainSampler({ terrainRoot }) {
  const cache = new TerrainTileCache({ terrainRoot })

  return {
    sampleAxis(axis) {
      const warnings = []
      const values = axis.samples.map((sample) => {
        const elevationM = cache.sampleNearest(sample.lon, sample.lat)
        if (elevationM == null) {
          warnings.push(`No terrain elevation for sample ${sample.index}`)
        }
        return { index: sample.index, elevationM }
      })

      return {
        terrain: {
          unit: 'm',
          values,
        },
        warnings: [...new Set(warnings)],
      }
    },
  }
}

export function createDefaultTerrainSampler(dataRoot) {
  return createTerrainSampler({ terrainRoot: path.join(dataRoot, 'terrain') })
}

