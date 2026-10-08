import { cellCoordinatesForGrid, mercatorSourceRows } from './overlayUtils.js'

export const EXPERIMENT_SOURCE = 'kim-turbulence-experiment-image'
export const EXPERIMENT_LAYER = 'kim-turbulence-experiment-raster'
// Quantitative colours for the 24 raw indices only.
export const EXPERIMENT_COLORS = ['#00224e', '#434e6c', '#7c7b78', '#bcae6c', '#fee838']
// TURB/SHEL/NCL/amo_gdps_diag_gktg_plot_{max,cat,mwt}.ncl:130–131.
// gui_default workstation indices 10/17/22 (0/1 are background/foreground):
// https://www.ncl.ucar.edu/Document/Graphics/ColorTables/gui_default.shtml
// NIL uses transparency as in amo_gdps_diag_gktg_plot_wf.ncl:94–95.
export const GKTG_BANDS = [
  { label: 'NIL', min: 0, range: '<0.15', color: 'transparent', rgba: [0, 0, 0, 0] },
  { label: 'LGT', min: .15, range: '0.15–<0.22', color: '#33ff00', rgba: [51, 255, 0, 185] },
  { label: 'MOD', min: .22, range: '0.22–<0.34', color: '#ffcc00', rgba: [255, 204, 0, 185] },
  { label: 'SEV', min: .34, range: '≥0.34', color: '#ff2900', rgba: [255, 41, 0, 185] },
]
const stateByMap = new WeakMap()

export function gktgBand(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return GKTG_BANDS.findLast((band) => value >= band.min)
}

export function experimentColor(value, max, combined = false) {
  if (combined) return gktgBand(value)?.rgba ?? [0, 0, 0, 0]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !(max > 0)) return [0, 0, 0, 0]
  const bin = Math.min(4, Math.floor(value / max * 5))
  const color = EXPERIMENT_COLORS[bin]
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 185]
}

export function buildExperimentPixels(field) {
  const { nx, ny } = field.grid
  const sourceRows = mercatorSourceRows(field.grid)
  const pixels = new Uint8ClampedArray(nx * sourceRows.length * 4)
  for (let y = 0; y < sourceRows.length; y++) for (let x = 0; x < nx; x++) {
    const value = field.values[sourceRows[y] * nx + x]
    pixels.set(experimentColor(value, field.diagnostic.colorMax, field.diagnostic.combined), (y * nx + x) * 4)
  }
  return pixels
}

export function sampleExperimentField(field, lng, lat) {
  if (!field) return null
  const g = field.grid
  if (lng < g.lonMin || lng > g.lonMax || lat < g.latMin || lat > g.latMax) return null
  const x = Math.round((lng - g.lonMin) / (g.lonMax - g.lonMin) * (g.nx - 1))
  const y = Math.round((lat - g.latMin) / (g.latMax - g.latMin) * (g.ny - 1))
  const value = field.values[y * g.nx + x]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function syncExperimentOverlay(map, field, visible) {
  if (!map) return
  if (!visible || !field) {
    if (map.getLayer(EXPERIMENT_LAYER)) map.setLayoutProperty(EXPERIMENT_LAYER, 'visibility', 'none')
    return
  }
  const source = map.getSource(EXPERIMENT_SOURCE)
  if (stateByMap.get(map) !== field || !source) {
    const canvas = document.createElement('canvas')
    canvas.width = field.grid.nx
    canvas.height = mercatorSourceRows(field.grid).length
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pixels = ctx.createImageData(canvas.width, canvas.height)
    pixels.data.set(buildExperimentPixels(field))
    ctx.putImageData(pixels, 0, 0)
    const image = { url: canvas.toDataURL('image/png'), coordinates: cellCoordinatesForGrid(field.grid) }
    if (source) source.updateImage(image)
    else map.addSource(EXPERIMENT_SOURCE, { type: 'image', ...image })
    stateByMap.set(map, field)
  }
  if (!map.getLayer(EXPERIMENT_LAYER)) map.addLayer({
    id: EXPERIMENT_LAYER, type: 'raster', source: EXPERIMENT_SOURCE, slot: 'middle',
    paint: { 'raster-opacity': .8, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' },
  })
  map.setLayoutProperty(EXPERIMENT_LAYER, 'visibility', 'visible')
}

export function destroyExperimentOverlay(map) {
  if (!map) return
  if (map.getLayer(EXPERIMENT_LAYER)) map.removeLayer(EXPERIMENT_LAYER)
  if (map.getSource(EXPERIMENT_SOURCE)) map.removeSource(EXPERIMENT_SOURCE)
  stateByMap.delete(map)
}
