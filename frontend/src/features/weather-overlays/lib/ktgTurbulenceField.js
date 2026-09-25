export const KTG_COLOR_RAMP = [
  { label: 'LIGHT', ktgMin: 0.3, ktgMax: 0.475, color: 'rgba(100,210,100,0.85)' },
  { label: 'MODERATE', ktgMin: 0.475, ktgMax: 0.75, color: 'rgba(255,195,0,0.9)' },
  { label: 'SEVERE', ktgMin: 0.75, ktgMax: 1.0, color: 'rgba(255,55,55,0.9)' },
]

// Returns [r, g, b, a] or null (transparent) for a KTG value.
export function pickKtgRgba(ktg) {
  if (ktg == null || ktg < 0.3) return null
  if (ktg < 0.475) return [100, 210, 100, 217]  // LGT - green
  if (ktg < 0.75) return [255, 195, 0, 230]     // MOD - yellow
  return [255, 55, 55, 230]                       // SEV - red
}
