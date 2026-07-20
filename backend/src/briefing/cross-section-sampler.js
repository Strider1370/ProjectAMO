const M_TO_FT = 3.28084

function gridStep(min, max, count, fallback) {
  if (Number.isFinite(min) && Number.isFinite(max) && count > 1) return (max - min) / (count - 1)
  return fallback
}

// lon/lat → 격자 flat index. sampleGridAt과 사전 계산(enroute-cross-section) 양쪽이
// 반드시 같은 칸을 가리켜야 하므로 이 함수 하나로 통일한다.
export function gridIndexFor(grid, lon, lat) {
  if (!grid) return null
  const dx = gridStep(grid.lonMin, grid.lonMax, grid.nx, grid.dx)
  const dy = gridStep(grid.latMin, grid.latMax, grid.ny, grid.dy)
  const x = Math.round((lon - grid.lonMin) / dx)
  const y = Math.round((lat - grid.latMin) / dy)
  if (x < 0 || y < 0 || x >= grid.nx || y >= grid.ny) return null
  return y * grid.nx + x
}

export function sampleGridAt(grid, values, lon, lat) {
  if (!grid || !Array.isArray(values)) return null
  const index = gridIndexFor(grid, lon, lat)
  if (index == null) return null
  const v = values[index]
  return Number.isFinite(v) ? v : null
}

export function buildCrossSection({ axis, run, levelIds, loadLevel }) {
  const samples = axis?.samples ?? []
  const levels = []
  const coverageTop = { T: null, moisture: null, icing: null, wind: null }
  const has = { T: false, moisture: false, icing: false, wind: false }

  for (const levelId of levelIds) {
    const field = loadLevel(levelId)
    if (!field) continue
    const { pressure, values: sampledValues = [] } = field
    const altFt = (() => {
      let sum = 0
      let n = 0
      for (const value of sampledValues) {
        const h = value.hgt
        if (Number.isFinite(h)) { sum += h; n += 1 }
      }
      return n > 0 ? (sum / n) * M_TO_FT : null
    })()

    const values = sampledValues.map((value) => ({
      distanceNm: value.distanceNm,
      altFt: nullableFt(value.hgt),
      t: nullableC(value.T),
      moistureSpread: null,
      spread: Number.isFinite(value.spread) ? value.spread : null,
      icing: Number.isFinite(value.icing) ? value.icing : null,
      u: Number.isFinite(value.u) ? value.u : null,
      v: Number.isFinite(value.v) ? value.v : null,
    }))

    if (sampledValues.some((value) => Number.isFinite(value.T))) { has.T = true; coverageTop.T = trackTop(coverageTop.T, pressure) }
    if (sampledValues.some((value) => Number.isFinite(value.spread))) { has.moisture = true; coverageTop.moisture = trackTop(coverageTop.moisture, pressure) }
    if (sampledValues.some((value) => Number.isFinite(value.icing))) { has.icing = true; coverageTop.icing = trackTop(coverageTop.icing, pressure) }
    if (sampledValues.some((value) => Number.isFinite(value.u) && Number.isFinite(value.v))) { has.wind = true; coverageTop.wind = trackTop(coverageTop.wind, pressure) }

    levels.push({ pressure, altFt, values })
  }

  return {
    run,
    levels,
    coverage: {
      byVariable: {
        T: { available: has.T, topPressure: coverageTop.T },
        moisture: { available: has.moisture, topPressure: coverageTop.moisture },
        icing: { available: has.icing, topPressure: coverageTop.icing, disabledByConfig: !has.icing },
        wind: { available: has.wind, topPressure: coverageTop.wind },
      },
    },
    warnings: [],
  }
}

// Nearest-neighbour lookup for LCC-projected KTG grids.
// coordsLat/coordsLon are flat float arrays (length ny*nx).
function nearestKtgIndex(coordsLat, coordsLon, targetLat, targetLon) {
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < coordsLat.length; i++) {
    const dlat = coordsLat[i] - targetLat
    const dlon = coordsLon[i] - targetLon
    const d = dlat * dlat + dlon * dlon
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

// Builds turbulence cross-section from pre-loaded KTG coords + per-altitude grids.
// coords: { lat[], lon[], ny, nx }
// loadAltGrid: (altFt) => { ktg: float[] } | null
export function buildKtgCrossSection({ axis, coords, altLevelsFt, loadAltGrid }) {
  if (!coords || !Array.isArray(coords.lat) || !altLevelsFt?.length) {
    return { available: false }
  }
  const samples = axis?.samples ?? []
  if (samples.length === 0) return { available: false }

  // Pre-compute nearest grid index per route sample (shared across altitudes)
  const nearestIdx = samples.map((s) => nearestKtgIndex(coords.lat, coords.lon, s.lat, s.lon))

  const levels = []
  for (const altFt of altLevelsFt) {
    const gridData = loadAltGrid(altFt)
    if (!gridData?.ktg) continue
    const values = samples.map((s, si) => {
      const idx = nearestIdx[si]
      const ktg = idx >= 0 ? (gridData.ktg[idx] ?? null) : null
      return { distanceNm: s.distanceNm, ktg }
    })
    levels.push({ altFt, values })
  }

  return { available: levels.length > 0, levels }
}

function nullableC(kelvin) {
  return Number.isFinite(kelvin) ? Math.round((kelvin - 273.15) * 100) / 100 : null
}

function nullableFt(meters) {
  return Number.isFinite(meters) ? Math.round(meters * M_TO_FT) : null
}

function trackTop(prev, pressure) {
  return prev == null ? pressure : Math.min(prev, pressure)
}
