import { useEffect, useMemo } from 'react'
import { ACI_BANDS, ACI_MISSING } from '../../../../../shared/aci.js'
import { cellCoordinatesForGrid, mercatorSourceRows } from './overlayUtils.js'
import { ACI_SOURCE, ACI_LAYER, removeAciLayer } from './aciExperimentModel.js'
import { syncAciRaster } from './aciExperimentRaster.js'
import { formatSigwxStamp, formatUtcTmfcStamp } from './weatherOverlayModel.js'

export function aciFieldPixels(field) {
  const g=field.grid,n=g.nx*g.ny
  if(field.score?.length!==n||field.scoreScale!==.0001)throw new Error('Invalid ACI map field')
  const rows=mercatorSourceRows(g),pixels=new Uint8ClampedArray(n*4)
  const colors=ACI_BANDS.map(b=>[parseInt(b.color.slice(1,3),16),parseInt(b.color.slice(3,5),16),parseInt(b.color.slice(5,7),16)])
  for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++) {
    const raw=field.score[rows[y]*g.nx+x]
    if(raw==null||raw===ACI_MISSING||raw<2500)continue
    const b=raw>=7500?3:raw>=5000?2:1,i=(y*g.nx+x)*4
    pixels.set(colors[b],i);pixels[i+3]=166
  }
  return pixels
}
export function useKimAciOverlay({mapRef,isStyleReady,styleRevision,aci,tz}) {
  const raster=useMemo(()=>{
    if(!aci.field)return null
    const canvas=document.createElement('canvas');canvas.width=aci.field.grid.nx;canvas.height=aci.field.grid.ny
    canvas.getContext('2d').putImageData(new ImageData(aciFieldPixels(aci.field),canvas.width,canvas.height),0,0)
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
