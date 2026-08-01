import config from '../../config.js'
import { maskCeilingWithCtps, cellToLonLat } from './ceiling-kim.js'

/**
 * Parse ASOS timestamp to get age in milliseconds.
 * tm format: YYYYMMDDHHmm (KST).
 */
function getAsosTmAgeMs(tmStr) {
  if (!tmStr || tmStr.length < 12) return Infinity
  const y = parseInt(tmStr.slice(0, 4))
  const m = parseInt(tmStr.slice(4, 6)) - 1
  const d = parseInt(tmStr.slice(6, 8))
  const h = parseInt(tmStr.slice(8, 10))
  const min = parseInt(tmStr.slice(10, 12))
  const kstDate = new Date(Date.UTC(y, m, d, h, min, 0))
  // Convert KST to UTC by subtracting 9 hours
  const utcDate = new Date(kstDate.getTime() - 9 * 3600 * 1000)
  return Date.now() - utcDate.getTime()
}

/**
 * Sample the KIM ceiling grid at a lat/lon point.
 * Returns ceiling in metres, or -1 if not available.
 */
function sampleKimCeiling(kimCeiling, lat, lon) {
  if (!kimCeiling || !kimCeiling.grid || !kimCeiling.ceilingM) return -1
  const { grid, ceilingM } = kimCeiling
  // Bilinear interpolation within the grid bounds
  const lonRange = grid.lonMax - grid.lonMin
  const latRange = grid.latMax - grid.latMin
  const normLon = lonRange > 0 ? (lon - grid.lonMin) / lonRange : 0.5
  const normLat = latRange > 0 ? (lat - grid.latMin) / latRange : 0.5
  if (normLon < 0 || normLon > 1 || normLat < 0 || normLat > 1) return -1
  const px = normLon * (grid.nx - 1)
  const py = normLat * (grid.ny - 1)
  const x0 = Math.floor(px)
  const x1 = Math.min(x0 + 1, grid.nx - 1)
  const y0 = Math.floor(py)
  const y1 = Math.min(y0 + 1, grid.ny - 1)
  const fx = px - x0
  const fy = py - y0
  const idx00 = y0 * grid.nx + x0
  const idx10 = y0 * grid.nx + x1
  const idx01 = y1 * grid.nx + x0
  const idx11 = y1 * grid.nx + x1
  const v00 = ceilingM[idx00]
  const v10 = ceilingM[idx10]
  const v01 = ceilingM[idx01]
  const v11 = ceilingM[idx11]
  // Mark as missing if any corner is missing
  if (v00 < 0 || v10 < 0 || v01 < 0 || v11 < 0) return -1
  return (v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
          v01 * (1 - fx) * fy + v11 * fx * fy)
}

/**
 * Merge ASOS and AMOS ceiling observations with KIM model ceiling.
 * Returns array of { id, name, source, lat, lon, ceiling_ft, model_ceiling_ft, diff_ft }.
 */
export function buildStations({ asos, amos, kimCeiling, ctpsMask }) {
  const stations = []
  const seen = new Set() // Track (lat, lon) pairs to avoid duplicates

  // Apply satellite mask to KIM ceiling
  const maskedCeilingM = kimCeiling ? maskCeilingWithCtps(kimCeiling.ceilingM, kimCeiling.grid, ctpsMask) : null

  // Process ASOS observations
  if (asos && asos.stations && Array.isArray(asos.stations)) {
    // Check if ASOS data is not too old (older than 2 hours)
    const ageMs = getAsosTmAgeMs(asos.tm)
    const twoHoursMs = 2 * 60 * 60 * 1000
    if (ageMs < twoHoursMs) {
      for (const sta of asos.stations) {
        const key = `${sta.lat.toFixed(4)},${sta.lon.toFixed(4)}`
        if (seen.has(key)) continue // Skip if already have AMOS for this location
        seen.add(key)

        // Sample model ceiling (from masked grid)
        let modelCeilingFt = null
        if (maskedCeilingM && kimCeiling) {
          const modelM = sampleKimCeiling({ ...kimCeiling, ceilingM: maskedCeilingM }, sta.lat, sta.lon)
          if (modelM >= 0) {
            modelCeilingFt = Math.round(modelM * 3.28084)
          }
        }

        const diffFt = modelCeilingFt !== null ? sta.ceiling_ft - modelCeilingFt : null

        stations.push({
          id: `asos_${sta.stn}`,
          name: sta.name,
          source: 'ASOS',
          lat: sta.lat,
          lon: sta.lon,
          ceiling_ft: sta.ceiling_ft,
          model_ceiling_ft: modelCeilingFt,
          diff_ft: diffFt,
        })
      }
    }
  }

  // Process AMOS observations
  if (amos && amos.airports && typeof amos.airports === 'object') {
    for (const [icao, airport] of Object.entries(amos.airports)) {
      const cloudMinM = airport?.observation?.cloud_min_m
      if (typeof cloudMinM !== 'number' || cloudMinM === -9 || cloudMinM >= 25000) {
        continue // Exclude missing (-9) and NSC (>=25000)
      }

      // Get airport coordinates from config
      const airportInfo = config.airports?.[icao]
      if (!airportInfo) {
        console.warn(`flight-cat: ICAO ${icao} not in config.airports`)
        continue
      }

      const lat = airportInfo.lat
      const lon = airportInfo.lon
      const name = airportInfo.name || icao

      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`
      if (seen.has(key)) {
        continue // Already have ASOS for this location, skip AMOS
      }
      seen.add(key)

      // Convert AMOS ceiling from metres to feet
      const ceilingFt = Math.round(cloudMinM * 3.28084)

      // Sample model ceiling (from masked grid)
      let modelCeilingFt = null
      if (maskedCeilingM && kimCeiling) {
        const modelM = sampleKimCeiling({ ...kimCeiling, ceilingM: maskedCeilingM }, lat, lon)
        if (modelM >= 0) {
          modelCeilingFt = Math.round(modelM * 3.28084)
        }
      }

      const diffFt = modelCeilingFt !== null ? ceilingFt - modelCeilingFt : null

      stations.push({
        id: `amos_${icao}`,
        name,
        source: 'AMOS',
        lat,
        lon,
        ceiling_ft: ceilingFt,
        model_ceiling_ft: modelCeilingFt,
        diff_ft: diffFt,
      })
    }
  }

  return stations
}
