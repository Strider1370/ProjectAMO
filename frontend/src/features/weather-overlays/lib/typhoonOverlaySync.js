// MET 오버레이 규약: 데이터 fetch와 sync는 weather-overlays가 소유한다.
// 기존 오버레이 훅과 같은 인자를 받는다 — { mapRef, isStyleReady, styleRevision }.
// map 인스턴스를 값으로 받으면 안 된다: mapRef.current는 첫 렌더에서 null이고
// ref 변경은 리렌더를 일으키지 않아 훅이 잡은 map이 계속 null로 남는다.
import { useEffect, useState } from 'react'
import { syncTyphoonLayers } from './typhoonLayers.js'

export function useTyphoonOverlay({ mapRef, isStyleReady, styleRevision, visible }) {
  const [snapshot, setSnapshot] = useState(null)

  // 레이어를 켜기 전에도 받아둔다. 타일 배지가 활성 태풍 수를 보여줘야 하기 때문이다(스펙 §9.2).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/typhoon')
        if (!response.ok) throw new Error(`typhoon_${response.status}`)
        const data = await response.json()
        if (!cancelled) setSnapshot(data)
      } catch {
        // 수집 실패를 "태풍 없음"으로 바꾸지 않는다. 상태를 알 수 없음으로 남긴다.
        if (!cancelled) setSnapshot((previous) => previous ?? { status: 'unavailable', typhoons: [] })
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // useEchoTopOverlay.js:9-12와 같은 형태다. MapView 지역 헬퍼(useStyleSyncedEffect)를
  // 끌어다 쓰지 않는다 — 기존 오버레이 훅은 전부 이렇게 직접 가드한다.
  useEffect(() => {
    const map = mapRef.current
    if (map && isStyleReady) syncTyphoonLayers(map, { typhoons: snapshot?.typhoons ?? [], visible })
  }, [mapRef, isStyleReady, styleRevision, snapshot, visible])

  return { snapshot, typhoons: snapshot?.typhoons ?? [], status: snapshot?.status ?? 'unknown' }
}

export default { useTyphoonOverlay }
