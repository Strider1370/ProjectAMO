// MET 오버레이 규약: 데이터 fetch와 sync는 weather-overlays가 소유한다.
// 기존 오버레이 훅과 같은 인자를 받는다 — { mapRef, isStyleReady, styleRevision }.
// map 인스턴스를 값으로 받으면 안 된다: mapRef.current는 첫 렌더에서 null이고
// ref 변경은 리렌더를 일으키지 않아 훅이 잡은 map이 계속 null로 남는다.
import { useCallback, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { escapeHtml } from '../../../shared/ui/escapeHtml.js'
import { intensityOf } from './typhoonListModel.js'
import { syncTyphoonLayers } from './typhoonLayers.js'

// 강도 숫자 심볼이 원형 표식 위에 놓인다. 두 레이어 모두 화면에 보이고 포인터를 받을 수
// 있으므로, 한쪽만 대상으로 삼으면 위쪽 심볼에서 hover가 끊긴다.
const POINTS_LAYERS = ['typhoon-points-strength', 'typhoon-points-circle']

export function typhoonPopupHtml(row, number, name, timeZone = 'KST') {
  const text = (value) => value == null || value === '' ? '—' : escapeHtml(String(value))
  const date = new Date(row?.validAt)
  const display = timeZone === 'KST' ? new Date(date.getTime() + 9 * 60 * 60 * 1000) : date
  const validAt = Number.isNaN(display.getTime())
    ? '—'
    : `${display.getUTCFullYear()}년 ${display.getUTCMonth() + 1}월 ${display.getUTCDate()}일 ${String(display.getUTCHours()).padStart(2, '0')}시`
  const intensity = intensityOf(row?.maxWindMs) ?? 'TD'
  return `<section class="typhoon-popup"><div class="typhoon-popup__head"><strong>${text(number)}호 태풍 ${text(name)}</strong><span>강도 ${text(intensity)}</span></div><div class="typhoon-popup__rows"><div><span>유효시각</span><span>${validAt}</span></div><div><span>최대풍속</span><span>${text(row?.maxWindMs)} m/s</span></div></div></section>`
}

export function useTyphoonOverlay({ mapRef, isStyleReady, styleRevision, visible, timeZone = 'KST', enabled = true }) {
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
    if (!enabled) return undefined
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
  }, [enabled])

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
    for (const layer of POINTS_LAYERS) {
      map.on('mouseenter', layer, onEnter)
      map.on('mouseleave', layer, onLeave)
    }
    return () => {
      for (const layer of POINTS_LAYERS) {
        map.off('mouseenter', layer, onEnter)
        map.off('mouseleave', layer, onLeave)
      }
    }
  }, [mapRef, isStyleReady, styleRevision, visible, snapshot, select])

  // 지점은 모두 동일한 강도 숫자 심볼을 쓰므로, 상세 값은 hover 팝업에서 제공한다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !visible) return undefined
    let popup = null
    let closeTimer = null
    const rows = new Map()
    const names = new Map()
    for (const typhoon of snapshot?.typhoons ?? []) {
      names.set(typhoon.number, typhoon.name)
      for (const row of typhoon.rows ?? []) rows.set(`${typhoon.number}|${row.validAt}`, row)
    }
    const cancelClose = () => {
      if (closeTimer !== null) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
    }
    const closePopup = () => {
      popup?.remove()
      popup = null
    }
    const scheduleClose = () => {
      cancelClose()
      // 지도 캔버스에서 팝업 DOM으로 가는 순간에는 레이어 leave가 먼저 발생한다.
      // 짧은 유예를 두고 팝업의 pointerenter가 이를 취소하게 한다.
      closeTimer = setTimeout(closePopup, 180)
    }
    const onEnter = (event) => {
      cancelClose()
      const props = event.features?.[0]?.properties
      if (!props) return
      const row = rows.get(`${props.number}|${props.validAt}`)
      if (!row) return
      closePopup()
      popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: '300px', className: 'typhoon-popup-wrap' })
        .setLngLat(event.lngLat)
        .setHTML(typhoonPopupHtml(row, props.number, names.get(props.number), timeZone))
        .addTo(map)
      const element = popup.getElement()
      element?.addEventListener('pointerenter', cancelClose)
      element?.addEventListener('pointerleave', scheduleClose)
    }
    const onLeave = scheduleClose
    for (const layer of POINTS_LAYERS) {
      map.on('mouseenter', layer, onEnter)
      map.on('mouseleave', layer, onLeave)
    }
    return () => {
      cancelClose()
      closePopup()
      for (const layer of POINTS_LAYERS) {
        map.off('mouseenter', layer, onEnter)
        map.off('mouseleave', layer, onLeave)
      }
    }
  }, [mapRef, isStyleReady, styleRevision, visible, snapshot, timeZone])

  return {
    snapshot,
    typhoons: snapshot?.typhoons ?? [],
    status: snapshot?.status ?? 'unknown',
    selected,
    select,
  }
}

export default { useTyphoonOverlay }
