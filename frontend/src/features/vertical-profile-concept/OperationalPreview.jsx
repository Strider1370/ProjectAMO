import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCrossSection, fetchVerticalProfile } from '../../api/briefingApi.js'
import { setWaypointNwpOffset } from '../route-briefing/lib/nwpTimeSelection.js'
import OperationalProfileWindow from './OperationalProfileWindow.jsx'

// This is an example geometry, not a cleared or recommended route.
const routeGeometry = { type:'LineString', coordinates:[[126.45,37.46],[125.8,36.5],[126.49,33.51]] }
const routeMarkers = [{id:'preview-rksi',label:'RKSI',lon:126.45,lat:37.46},{id:'preview-mid',label:'예시 경유점',lon:125.8,lat:36.5},{id:'preview-rkpc',label:'RKPC',lon:126.49,lat:33.51}]
const candidateAltitudes = [10000,15000,25000,35000,45000,55000]
export default function OperationalPreview() {
  const [snapshot,setSnapshot]=useState(null), [error,setError]=useState(null), [loading,setLoading]=useState(false), [open,setOpen]=useState(true)
  const controller=useRef(null), latest=useRef(null), attempted=useRef(null)
  const load=useCallback(async (options={})=>{
    controller.current?.abort()
    const request=new AbortController();controller.current=request
    attempted.current=options;setLoading(true);setError(null)
    const previous=latest.current
    const altitude=options.altitude ?? previous?.altitude ?? 35000
    const selection=options.selection ?? previous?.selection
    try {
      const [profile,crossSection]=await Promise.all([
        previous && altitude===previous.altitude ? previous.profile : fetchVerticalProfile({routeGeometry,routeMarkers,plannedCruiseAltitudeFt:altitude,candidateCruiseAltitudesFt:candidateAltitudes,sampleSpacingMeters:1000},{signal:request.signal}),
        fetchCrossSection({routeGeometry,routeMarkers,...(previous?.crossSection?.run ? {tmfc:previous.crossSection.run.tmfc,hf:options.hf ?? previous.crossSection.run.hf,domain:previous.crossSection.run.domain} : {}),...(selection ? {nwpTimeSelection:selection}: {})},{signal:request.signal}),
      ])
      if(request.signal.aborted)return
      const value={profile,crossSection,altitude,selection:selection ?? {baseTime:crossSection.run?.validTime,waypointOverrides:[]}}
      latest.current=value;setSnapshot(value)
    } catch(e) {if(!request.signal.aborted)setError(`자료 갱신 실패: ${e.message}${previous ? ' · 이전 수신 자료를 유지합니다.' : ''}`)}
    finally {if(!request.signal.aborted)setLoading(false)}
  },[])
  useEffect(()=>{load();return()=>controller.current?.abort()},[load])
  const changeHour=hf=>load({hf,selection:{...snapshot.selection,baseTime:snapshot.crossSection.availableTimes.find(t=>t.hf===hf)?.validTime ?? snapshot.selection.baseTime}})
  const changeWaypoint=(id,offset)=>load({selection:setWaypointNwpOffset(snapshot.selection,id,offset,snapshot.profile.markers.map(m=>m.id))})
  if(!open)return <button className="vpc-reopen" onClick={()=>setOpen(true)}>연직단면도 다시 열기</button>
  if(!snapshot)return <div className="vpc-preview-loading" role="status">{error ?? '운영 API의 저장자료를 불러오는 중…'}{error && <button onClick={()=>load(attempted.current ?? {})}>다시 시도</button>}</div>
  return <OperationalProfileWindow isOpen profile={snapshot.profile} crossSection={snapshot.crossSection} referenceAltitudeFt={snapshot.altitude}
    selectedCandidateAltitudeFt={snapshot.altitude} candidateAltitudes={candidateAltitudes} onSelectCandidateAltitude={altitude=>load({altitude})}
    onClose={()=>setOpen(false)} onSelectForecastHour={changeHour} crossSectionHourLoading={loading}
    nwpTimeSelection={snapshot.selection} onSetWaypointNwpOffset={changeWaypoint}
    statusMessage={error}
    sourceNote="예시 경로 · 로컬에 저장된 수집자료이며 현재 실황·예보가 아닙니다." allowMissingTerrain
    retry={error ? ()=>load(attempted.current ?? {}) : null} previewLabel="운영 자료 연결 시안" />
}
