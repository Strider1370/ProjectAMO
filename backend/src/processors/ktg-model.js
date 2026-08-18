export const KTG_FILL_VALUE = 1e30
export const KTG_ALT_LEVELS_FT = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]
export const KTG_FORECAST_HOURS = [6, 9, 12]
export const KTG_SYNOPTIC_HOURS = [0, 6, 12, 18]

export function ktgIntensity(ktg) {
  if (!Number.isFinite(ktg) || ktg < 0.3) return 0  // NIL
  if (ktg < 0.475) return 1                          // LGT
  if (ktg < 0.75) return 2                           // MOD
  return 3                                            // SEV
}

export function addForecastHoursKtg(tmfc, hf) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) return null
  const base = Date.UTC(
    Number(tmfc.slice(0, 4)), Number(tmfc.slice(4, 6)) - 1,
    Number(tmfc.slice(6, 8)), Number(tmfc.slice(8, 10)),
  )
  return new Date(base + Number(hf) * 3600000).toISOString()
}

// Builds a single-altitude KTG grid from NetCDF slice data.
// ktgSlice: typed array of float32 values (length ny*nx) for one altitude.
// lat/lon: full 2D coordinate arrays (ny*nx each), stored once per hf in coords.json.
export function buildKtgGrid({ tmfc, hf, altFt, validTime, ny, nx, ktgSlice, fetchedAt = new Date().toISOString() }) {
  const ktg = Array.from(ktgSlice).map((v) => (v > KTG_FILL_VALUE || !Number.isFinite(v) ? null : Math.round(v * 10000) / 10000))
  return {
    type: 'ktg_grid',
    tmfc,
    hf: Number(hf),
    validTime,
    altFt: Number(altFt),
    grid: { ny, nx },
    ktg,
    fetched_at: fetchedAt,
  }
}

// Builds the shared coordinate file for a tmfc/hf combination.
export function buildKtgCoords({ ny, nx, lat, lon }) {
  return {
    type: 'ktg_coords',
    ny,
    nx,
    lat: Array.from(lat).map((v) => Math.round(v * 10000) / 10000),
    lon: Array.from(lon).map((v) => Math.round(v * 10000) / 10000),
  }
}

export default { KTG_ALT_LEVELS_FT, KTG_FILL_VALUE, KTG_FORECAST_HOURS, KTG_SYNOPTIC_HOURS, addForecastHoursKtg, buildKtgCoords, buildKtgGrid, ktgIntensity }
