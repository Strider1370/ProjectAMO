import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchKimAciPoint } from '../../../api/weatherApi.js'
import { aciSelectionKey } from './useKimAci.js'
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
export function useKimAciOverlay({mapRef,isStyleReady,styleRevision,aci,tz,canPick,priorityLayers=[]}) {
  const [selected,setSelected]=useState(null),[pointProblem,setPointProblem]=useState(null),pending=useRef(null)
  const canPickRef = useRef(canPick)
  canPickRef.current = canPick
  const key=aciSelectionKey(aci.time)
  const raster=useMemo(()=>{
    if(!aci.field)return null
    const canvas=document.createElement('canvas');canvas.width=aci.field.grid.nx;canvas.height=aci.field.grid.ny
    canvas.getContext('2d').putImageData(new ImageData(aciFieldPixels(aci.field),canvas.width,canvas.height),0,0)
    return {url:canvas.toDataURL('image/png'),coordinates:cellCoordinatesForGrid(aci.field.grid)}
  },[aci.field])
  useEffect(()=>{setSelected(null);setPointProblem(null);pending.current?.abort();return ()=>pending.current?.abort()},[key,aci.enabled])
  useEffect(()=>{
    const map=mapRef.current;if(!map||!isStyleReady)return
    if(!aci.enabled||!raster){removeAciLayer(map);return}
    syncAciRaster(map,raster,true)
    return ()=>removeAciLayer(map)
  },[mapRef,isStyleReady,styleRevision,aci.enabled,raster])
  useEffect(()=>{
    const map=mapRef.current;if(!map||!aci.enabled||!aci.field||!isStyleReady)return
    const click=e=>{
      if(canPickRef.current&&!canPickRef.current())return
      const active=priorityLayers.filter(id=>map.getLayer(id))
      if(active.length&&map.queryRenderedFeatures(e.point,{layers:active}).length)return
      pending.current?.abort();const controller=new AbortController();pending.current=controller
      setSelected(null);setPointProblem(null)
      fetchKimAciPoint(aci.time,{lon:e.lngLat.lng,lat:e.lngLat.lat},{signal:controller.signal}).then(p=>{
        if(!controller.signal.aborted){setSelected(p.score==null?null:{...p,capeContribution:p.contributions[0],rainContribution:p.contributions[1],olrContribution:p.contributions[2]});if(p.score==null)setPointProblem('이 격자는 계산 자료가 부족합니다')}
      }).catch(error=>{if(!controller.signal.aborted&&!/404/.test(error.message))setPointProblem('지점 값을 불러오지 못했습니다')})
    }
    map.on('click',click);return()=>{map.off('click',click);pending.current?.abort()}
  },[mapRef,isStyleReady,aci.enabled,aci.field,key,priorityLayers])
  const timestamp=aci.enabled?{key:'aci',label:'대류영역',issueLabel:aci.time?formatUtcTmfcStamp(aci.time.tmfc,tz):'-',validLabel:aci.time?formatSigwxStamp(aci.time.validTime,tz):'-',note:aci.problem,noteTone:aci.problem?'warning':undefined}:null
  return {enabled:aci.enabled,selected,problem:pointProblem||aci.problem,timestamp,count:aci.field?.validCount??0,caseLabel:aci.time?`${formatUtcTmfcStamp(aci.time.tmfc,tz)} 발표 · ${formatSigwxStamp(aci.time.validTime,tz)} 유효`:'자료 준비 중'}
}
