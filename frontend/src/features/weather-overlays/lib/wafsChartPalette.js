import { color } from '../../../shared/theme/tokens.js'
import { OUTLINE_BASEMAP_PALETTES } from '../../map/lib/outlineBasemapStyle.js'

// Light colors follow AWC's web map. Dark colors are a local display adaptation:
// preserve phenomenon/severity hues while improving contrast on dark basemaps.
export const WAFS_CHART_PALETTES = {
  light: {
    mode: 'light', ink: color.text1, background: color.bg1, halo: color.bg1,
    cloud: '#7037bd', tropopause: color.cat.mvfr, cyclone: color.level.red,
    hazards: {
      TURBULENCE: { MOD: '#FF9900', SEV: '#CC0000', opacity: 0.3 },
      AIRFRAME_ICING: { MOD: '#99CCFF', SEV: '#6699FF', opacity: 0.5 },
    },
  },
  dark: {
    mode: 'dark', ink: '#e2e8f0', background: '#0f172a', halo: '#0f172a',
    cloud: '#b49aff', tropopause: '#7dd3fc', cyclone: '#ff9494',
    hazards: {
      TURBULENCE: { MOD: '#FFB347', SEV: '#FF6262', opacity: 0.4 },
      AIRFRAME_ICING: { MOD: '#B3DDFF', SEV: '#6DAAFF', opacity: 0.55 },
    },
  },
}

// Keep palette identities stable for overlay effects. The legend uses the
// actual ocean background for these styles when previewing translucent fills.
const outlineChartPalettes = Object.fromEntries(Object.entries(OUTLINE_BASEMAP_PALETTES)
  .map(([id, colors]) => [id, { ...WAFS_CHART_PALETTES.dark, legendBackground: colors.water }]))

export function wafsChartPalette(basemapId) {
  if (Object.hasOwn(outlineChartPalettes, basemapId)) return outlineChartPalettes[basemapId]
  return basemapId === 'dark' || basemapId === 'satellite' || Object.hasOwn(OUTLINE_BASEMAP_PALETTES, basemapId)
    ? WAFS_CHART_PALETTES.dark : WAFS_CHART_PALETTES.light
}

export function chartColor(p, palette = WAFS_CHART_PALETTES.light) {
  switch (p.phenomenon) {
    case 'CLOUD': return palette.cloud
    case 'TURBULENCE':
    case 'AIRFRAME_ICING': return palette.hazards[p.phenomenon][p.severity === 'SEV' ? 'SEV' : 'MOD']
    case 'TROPOPAUSE': return palette.tropopause
    case 'TROPICAL_CYCLONE': return palette.cyclone
    default: return palette.ink
  }
}
