import { useState } from 'react'
import { usePolygonDraw } from '../custom-area/usePolygonDraw.js'
import { useMeasureOverlay } from './useMeasureOverlay.js'

// 지도 도구함 컨트롤러. activeTool 하나만 활성. 폴리곤은 기존 usePolygonDraw,
// 나머지 측정 도구는 useMeasureOverlay가 담당. MapView는 이 훅만 호출한다(ADR-0001).
// mapRef/isStyleReady는 다른 오버레이 훅과 동일 규약 — basemap 전환 시 map이 null↔real로 바뀌며
// 두 하위 오버레이가 알아서 정리/재설치된다.
export function useMapTools(mapRef, isStyleReady, { panelOpen, onFeatureSelect } = {}) {
  const map = isStyleReady ? mapRef.current : null
  const [activeTool, setActiveTool] = useState('polygon')

  // 폴리곤 도구가 실제 활성일 때만 MapboxDraw를 마운트한다. 상주시키면 지도 터치/클릭을 가로채
  // 모바일에서 공항 마커 탭 등 다른 레이어 클릭이 막힌다(회귀 버그 원인). 비활성 시 완성 폴리곤은
  // usePolygonDraw 내부에서 저장→재활성 시 복원.
  const polygon = usePolygonDraw(map, {
    enabled: panelOpen && activeTool === 'polygon',
    onFeatureSelect,
  })
  const measure = useMeasureOverlay(map, activeTool, panelOpen)

  return { activeTool, setActiveTool, polygon, measure }
}
