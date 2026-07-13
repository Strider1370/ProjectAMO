import { usePolygonDraw } from './usePolygonDraw.js'

// MapView의 다른 지도 오버레이 훅(예: useFirTickOverlay)과 동일하게 mapRef/isStyleReady를 받는다.
// basemap 전환 시 MapView가 isStyleReady를 false→true로 순간 내렸다 올리므로, 아래에서 파생하는
// map 값도 real→null→real로 바뀌며 usePolygonDraw의 내부 effect(map을 dep으로 가짐)가 자동으로
// 이전 draw control/preview 레이어를 정리하고 새 스타일 위에 재설치한다.
export function useCustomAreaOverlay(mapRef, isStyleReady, options) {
  const map = isStyleReady ? mapRef.current : null
  return usePolygonDraw(map, options)
}
