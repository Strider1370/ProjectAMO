import { color } from '../theme/tokens.js'

// Logical CSS pixels. Mapbox texture pixels are scaled separately.
export const ICING_DOTS = Object.freeze({ color: '#ffffff', opacity: .82, radius: .85, spacing: 9, size: 64, repeats: 4, pixelRatio: 16 / 9 })
export const ICING_PRESENTATION = [
  { grade: 0, label: 'None', fillColor: 'transparent' },
  ...['LIGHT', 'MODERATE', 'SEVERE'].map((label, i) => ({ grade: i + 1, label, fillColor: color.icing[i + 1] })),
]
export const ICING_OUTLINE_COLOR = color.accent
export const ICING_BACKGROUND_OPACITY = 1
export const ICING_OUTLINE_WIDTH = 1.4
export const BASIC_ISOTHERMS = [0, -20]
export const DETAIL_ISOTHERMS = [0, -10, -20]
export const MAP_ISOTHERM_COLOR = color.level.red
export function icingOutlineColor(basemapId) {
  return ['outline', 'outline-green', 'outline-slate', 'satellite'].includes(basemapId) ? '#e6edf5' : ICING_OUTLINE_COLOR
}

export function cloudSpreadColor(spread, maxSpread = 4) {
  if (!Number.isFinite(spread) || spread < 0 || spread > maxSpread) return 'rgba(0,0,0,0)'
  const bands = ['rgba(128,128,128,0.58)', 'rgba(145,145,145,0.50)', 'rgba(165,165,165,0.42)', 'rgba(188,188,188,0.34)', 'rgba(204,204,204,0.28)', 'rgba(218,218,218,0.22)']
  return bands[Math.min(bands.length - 1, Math.max(0, Math.ceil(spread) - 1))]
}

export function icingPatternSpacing() { return ICING_DOTS.spacing }
export function icingPatternStyle(grade) {
  const p = ICING_PRESENTATION.find(entry => entry.grade === grade) ?? ICING_PRESENTATION[0]
  const dot = `rgba(255,255,255,${ICING_DOTS.opacity})`
  return { backgroundColor: p.fillColor, backgroundImage: grade ? `radial-gradient(${dot} ${ICING_DOTS.radius}px, transparent ${ICING_DOTS.radius + .3}px)` : 'none', backgroundSize: `${ICING_DOTS.spacing}px ${ICING_DOTS.spacing}px`, border: `1px solid ${ICING_OUTLINE_COLOR}` }
}
