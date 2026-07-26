// MET 오버레이 규약: 데이터 fetch와 sync는 weather-overlays가 소유한다.
// 기존 오버레이 훅과 같은 인자를 받는다 — { mapRef, isStyleReady, styleRevision }.
// map 인스턴스를 값으로 받으면 안 된다: mapRef.current는 첫 렌더에서 null이고
// ref 변경은 리렌더를 일으키지 않아 훅이 잡은 map이 계속 null로 남는다.
import { useCallback, useEffect, useState } from 'react'
import { syncTyphoonLayers } from './typhoonLayers.js'

const POINTS_LAYER = 'typhoon-points-circle'

export function useTyphoonOverlay({ mapRef, isStyleReady, styleRevision, visible }) {
  const [snapshot, setSnapshot] = useState(null)
  // 패널의 시각 행과 지도 지점을 잇는 선택 상태. 어느 쪽에서 골라도 같은 값이 된다.
  // pinned = 클릭으로 고정한 것. 마우스가 떠나도 풀리지 않는다.
  const [selected, setSelected] = useState(null)

  const select = useCallback((next) => {
    setSelected((prev) => {
      if (next === null) return prev?.pinned ? prev : null
      return next
    })
  }, [])

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
    if (map && isStyleReady) syncTyphoonLayers(map, { typhoons: snapshot?.typhoons ?? [], visible, selected })
  }, [mapRef, isStyleReady, styleRevision, snapshot, visible, selected])

  // 지도 → 패널. 경로 지점에 마우스를 올리면 패널의 해당 시각 행이 밝아진다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !visible) return undefined
    const rows = new Map()
    for (const typhoon of snapshot?.typhoons ?? []) {
      for (const row of typhoon.rows ?? []) rows.set(`${typhoon.number}|${row.validAt}`, row)
    }
    const onEnter = (event) => {
      const props = event.features?.[0]?.properties
      if (!props) return
      map.getCanvas().style.cursor = 'pointer'
      select({ number: props.number, validAt: props.validAt, row: rows.get(`${props.number}|${props.validAt}`) })
    }
    const onLeave = () => { map.getCanvas().style.cursor = ''; select(null) }
    map.on('mouseenter', POINTS_LAYER, onEnter)
    map.on('mouseleave', POINTS_LAYER, onLeave)
    return () => {
      map.off('mouseenter', POINTS_LAYER, onEnter)
      map.off('mouseleave', POINTS_LAYER, onLeave)
    }
  }, [mapRef, isStyleReady, styleRevision, visible, snapshot, select])

  return {
    snapshot,
    typhoons: snapshot?.typhoons ?? [],
    status: snapshot?.status ?? 'unknown',
    selected,
    select,
  }
}

export default { useTyphoonOverlay }
