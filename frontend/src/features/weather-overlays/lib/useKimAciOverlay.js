import { useEffect, useMemo } from 'react'
import { ACIM_TOP_BANDS, acimTopBand } from '../../../../../shared/acim.js'
import { cellCoordinatesForGrid, mercatorSourceRows } from './overlayUtils.js'
import { ACI_SOURCE, ACI_LAYER, removeAciLayer } from './aciExperimentModel.js'
import { syncAciRaster } from './aciExperimentRaster.js'
import { formatSigwxStamp, formatUtcTmfcStamp } from './weatherOverlayModel.js'
import { MAP_LAYER_OPACITY } from './mapLayerOpacity.js'

const rgb=hex=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]
const BAND_RGB=new Map(ACIM_TOP_BANDS.map(b=>[b,rgb(b.color)]))
// 표시 운정고도(FL250 이상)를 원본 일기도의 25 단위 색으로 칠한다. FL250 미만·결측은 투명.
export function aciFieldPixels(field) {
  const g=field.grid,n=g.nx*g.ny,values=field.displayFl
  if(field.product!=='ACIM'||values?.length!==n)throw new Error('Invalid ACI map field')
  const rows=mercatorSourceRows(g),pixels=new Uint8ClampedArray(n*4)
  for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++) {
    const band=acimTopBand(values[rows[y]*g.nx+x])
    if(!band)continue
    const i=(y*g.nx+x)*4
    pixels.set(BAND_RGB.get(band),i);pixels[i+3]=Math.round(MAP_LAYER_OPACITY.acim*255)
  }
  return pixels
}
export function useKimAciOverlay({mapRef,isStyleReady,styleRevision,aci,tz}) {
  const raster=useMemo(()=>{
    if(!aci.field)return null
    let pixels
    try{pixels=aciFieldPixels(aci.field)}catch{return null}
    const canvas=document.createElement('canvas');canvas.width=aci.field.grid.nx;canvas.height=aci.field.grid.ny
    canvas.getContext('2d').putImageData(new ImageData(pixels,canvas.width,canvas.height),0,0)
    return {url:canvas.toDataURL('image/png'),coordinates:cellCoordinatesForGrid(aci.field.grid)}
  },[aci.field])
  useEffect(()=>{
    const map=mapRef.current;if(!map||!isStyleReady)return
    if(!aci.enabled||!raster){removeAciLayer(map);return}
    syncAciRaster(map,raster,true)
    return ()=>removeAciLayer(map)
  },[mapRef,isStyleReady,styleRevision,aci.enabled,raster])
  const timestamp=aci.enabled?{key:'aci',label:'대류영역',issueLabel:aci.time?formatUtcTmfcStamp(aci.time.tmfc,tz):'-',validLabel:aci.time?formatSigwxStamp(aci.time.validTime,tz):'-',note:aci.problem,noteTone:aci.problem?'warning':undefined}:null
  return {enabled:aci.enabled,problem:aci.problem,timestamp,count:aci.field?.validCount??0,caseLabel:aci.time?`${formatUtcTmfcStamp(aci.time.tmfc,tz)} 발표 · ${formatSigwxStamp(aci.time.validTime,tz)} 유효`:'자료 준비 중'}
}
