// TURB operational NCL plot boundaries and gui_default colours.
export const GKTG_BANDS = Object.freeze([
  { label: 'NIL', min: 0, range: '<0.15', color: 'transparent', rgba: [0, 0, 0, 0] },
  { label: 'LGT', min: 0.15, range: '0.15–<0.22', color: '#33ff00', rgba: [51, 255, 0, 185] },
  { label: 'MOD', min: 0.22, range: '0.22–<0.34', color: '#ffcc00', rgba: [255, 204, 0, 185] },
  { label: 'SEV', min: 0.34, range: '≥0.34', color: '#ff2900', rgba: [255, 41, 0, 185] },
])
// NCL's unsuffixed cnLevels and TURB fields are binary32. Compare in that
// precision so a stored float32 0.22 is MOD rather than falling below 0.22.
const LIMITS = [0.15, 0.22, 0.34].map(Math.fround)

export function gktgIntensity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  const single = Math.fround(value)
  return single >= LIMITS[2] ? 3 : single >= LIMITS[1] ? 2 : single >= LIMITS[0] ? 1 : 0
}

export function gktgBand(value) {
  const grade = gktgIntensity(value)
  return grade === null ? null : GKTG_BANDS[grade]
}
