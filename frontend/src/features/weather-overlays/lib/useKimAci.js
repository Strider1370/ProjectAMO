import { useEffect, useMemo, useState } from 'react'
import { fetchKimAciIndex, fetchKimAciField } from '../../../api/weatherApi.js'
import { useKimSnapshotMeta } from './useKimSnapshotMeta.js'
import { kimFieldCache } from './kimFieldCache.js'
export function pickAciTime(index,selection,{commonActive=false,selectedMs=null,now=Date.now()}={}) {
  if(!index?.times?.length)return null
  if(commonActive) {
    if(!selection||selection.tmfc!==index.latestRun||(selection.domain||'kr')!==index.domain)return null
    return index.times.find(t=>Number(t.hf)===Number(selection.hf))??null
  }
  const target=Number.isFinite(selectedMs)?selectedMs:now
  return index.times.reduce((best,t)=>Math.abs(Date.parse(t.validTime)-target)<Math.abs(Date.parse(best.validTime)-target)?t:best)
}
export const aciSelectionKey = t => t ? `${t.domain}:${t.tmfc}:${t.hf}:${t.revision}:aci` : null
export function useKimAci(enabled,selection,{commonActive=false,selectedMs=null,pinned=false}={}) {
  const [index,setIndex]=useState(null),[field,setField]=useState(null),[problem,setProblem]=useState(null)
  const snapshot=useKimSnapshotMeta(enabled&&!pinned)
  const hash=`${snapshot?.kimNwp?.domain||''}:${snapshot?.kimNwp?.tmfc||''}:${snapshot?.kimNwp?.variables?.aci?.hash||''}`
  useEffect(()=>{
    if(!enabled||pinned)return
    const controller=new AbortController()
    fetchKimAciIndex({signal:controller.signal}).then(v=>{if(!controller.signal.aborted){setIndex(v);setProblem(null)}}).catch(e=>{if(!controller.signal.aborted){setProblem(/503/.test(e.message)?'ACI 자료 준비 중':'ACI 목록을 불러오지 못했습니다')}})
    return ()=>controller.abort()
  },[enabled,pinned,hash])
  const picked=useMemo(()=>pickAciTime(index,selection,{commonActive,selectedMs}),[index,selection?.domain,selection?.tmfc,selection?.hf,commonActive,selectedMs])
  const time=enabled&&!pinned&&picked?{...picked,domain:index.domain,tmfc:index.latestRun}:null,key=aciSelectionKey(time)
  useEffect(()=>{
    if(!key)return
    const cache=kimFieldCache.view('aci')
    if(cache.has(key)){setField(cache.get(key));setProblem(null);return}
    const controller=new AbortController()
    fetchKimAciField(time,{signal:controller.signal}).then(value=>{
      if(controller.signal.aborted)return
      if(aciSelectionKey({domain:value.domain,...value.time,revision:value.revision})!==key)throw new Error('ACI 선택과 응답이 다릅니다')
      cache.set(key,value);setField(value);setProblem(null)
    }).catch(error=>{if(!controller.signal.aborted)setProblem('해당 시각 ACI 자료를 불러오지 못했습니다')})
    return ()=>controller.abort()
  },[key])
  const current=field&&aciSelectionKey({domain:field.domain,...field.time,revision:field.revision})===key?field:null
  return {enabled,index,time,field:current,times:enabled&&!pinned?index?.times||[]:[],problem:pinned?'고정 브리핑에는 ACI가 포함되지 않았습니다':problem||(!picked&&index?'해당 시각 ACI 자료 준비 중':!current?'불러오는 중':null)}
}
