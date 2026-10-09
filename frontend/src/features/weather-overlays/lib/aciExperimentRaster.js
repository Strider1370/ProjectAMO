import { calculateScore, DEFAULTS, validateSettings } from './aciExperimentScore.js'
import { ACI_BANDS, ACI_LAYER, ACI_SOURCE } from './aciExperimentModel.js'
import { cellCoordinatesForGrid, mercatorSourceRows } from './overlayUtils.js'

export function decodeAciGrid(meta, buffer) {
  const g = meta?.grid
  if (meta?.format !== 'aci-f32-v1' || !g || !Number.isInteger(g.nx) || !Number.isInteger(g.ny) || g.nx < 2 || g.ny < 2 || ![g.lonMin,g.lonMax,g.latMin,g.latMax].every(Number.isFinite) || g.lonMax <= g.lonMin || g.latMax <= g.latMin || !Number.isFinite(Date.parse(meta.validAt))) throw new Error('실험 격자 형식 오류')
  const n = g.nx * g.ny
  if (buffer.byteLength !== n * 3 * 4) throw new Error('실험 격자 크기 오류')
  // The preview wire format is explicitly little endian.
  const values = new Float32Array(n * 3), view = new DataView(buffer)
  for (let i = 0; i < values.length; i++) values[i] = view.getFloat32(i * 4, true)
  return { ...meta, cape: values.subarray(0,n), rainRate: values.subarray(n,2*n), olr: values.subarray(2*n) }
}

export function aciCellAt(data, lon, lat, settings = DEFAULTS) {
  const g = data.grid, dx = (g.lonMax-g.lonMin)/(g.nx-1), dy = (g.latMax-g.latMin)/(g.ny-1)
  const x = Math.round((lon-g.lonMin)/dx), y = Math.round((lat-g.latMin)/dy)
  if (x < 0 || x >= g.nx || y < 0 || y >= g.ny) return null
  const i = y*g.nx+x, cell = {lon:g.lonMin+x*dx,lat:g.latMin+y*dy,cape:data.cape[i],rainRate:data.rainRate[i],olr:data.olr[i]}
  const r = calculateScore(cell, settings)
  return r ? {...cell,score:r.score,capeContribution:r.contributions[0],rainContribution:r.contributions[1],olrContribution:r.contributions[2]} : null
}

export function aciRasterPixels(data, settings = DEFAULTS) {
  validateSettings(settings)
  const g = data.grid, n = g.nx*g.ny, bands = new Uint8Array(n)
  let validCount = 0
  for (let i = 0; i < n; i++) {
    const r = calculateScore({cape:data.cape[i],rainRate:data.rainRate[i],olr:data.olr[i]},settings)
    if (!r) continue
    validCount++
    bands[i] = r.score >= .75 ? 3 : r.score >= .5 ? 2 : r.score >= .25 ? 1 : 0
  }
  const rows = mercatorSourceRows(g), pixels = new Uint8ClampedArray(n*4)
  const palette = ACI_BANDS.map(b=>[parseInt(b.color.slice(1,3),16),parseInt(b.color.slice(3,5),16),parseInt(b.color.slice(5,7),16)])
  for(let y=0;y<g.ny;y++) for(let x=0;x<g.nx;x++) {
    const band=bands[rows[y]*g.nx+x], dest=(y*g.nx+x)*4
    if(band) {pixels.set(palette[band],dest);pixels[dest+3]=166}
  }
  return {pixels,validCount}
}

export function buildAciRaster(data, settings) {
  const {pixels,validCount}=aciRasterPixels(data,settings), canvas=document.createElement('canvas')
  canvas.width=data.grid.nx;canvas.height=data.grid.ny
  canvas.getContext('2d').putImageData(new ImageData(pixels,canvas.width,canvas.height),0,0)
  return {url:canvas.toDataURL('image/png'),coordinates:cellCoordinatesForGrid(data.grid),validCount}
}

export function syncAciRaster(map, raster, enabled) {
  if (!map.getSource(ACI_SOURCE)) map.addSource(ACI_SOURCE,{type:'image',url:raster.url,coordinates:raster.coordinates})
  else map.getSource(ACI_SOURCE).updateImage({url:raster.url,coordinates:raster.coordinates})
  if (!map.getLayer(ACI_LAYER)) map.addLayer({id:ACI_LAYER,source:ACI_SOURCE,type:'raster',slot:'middle',paint:{'raster-resampling':'nearest','raster-fade-duration':0}})
  map.setLayoutProperty(ACI_LAYER,'visibility',enabled?'visible':'none')
}
