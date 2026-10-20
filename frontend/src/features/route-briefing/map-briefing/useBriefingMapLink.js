import { useCallback, useEffect, useMemo, useState } from 'react'
import { setAdvisoryHighlight } from '../../weather-overlays/lib/advisoryLayers.js'
import { formatPressureFlightLevel, nearestPressureLevelForAltitude } from '../../weather-overlays/lib/pressureLevelModel.js'
import { clearBriefingMapLayers, coordinatesBounds, focusCollection, hazardBandCollection, ribbonRangeCoordinates, syncBriefingMapLayers } from './briefingMapLayers.js'
import { focusTarget } from './mapBriefingModel.js'

const NO_FOCUS = { hover: null, selection: null, advisoryId: null, hiddenRows: [] }

// 지도형 브리핑 ↔ 지도 연동. MapView는 이 훅을 부르고 콜백만 MapBriefingView에 넘긴다.
// - 경로 위 위험 색 띠, 막대를 가리키거나 누른 구간 강조·이름표, 가리킨 SIGMET 면 강조
// - goTo: 팝오버 "지도·슬라이더를 이 구간으로" — 누를 때만 지도·시간·고도를 옮긴다.
// - mapStatus: 켠 레이어 안내에 쓸 지금 지도 고도(KIM 기압면)·시각
export function useBriefingMapLink({
  mapRef, isStyleReady, styleRevision, active, ribbon, routeSamples, previewGeojson, cruiseAltitudeFt,
  fitPadding, setTimelineMs, nwpSelection, setNwpSelection, sliderLevels, sliderTimes,
}) {
  const [focus, setFocus] = useState(NO_FOCUS)
  // 위험 막대와 같은 거리 축: 연직단면도 샘플(없으면 지도 경로 preview 선).
  const route = useMemo(() => ({ samples: routeSamples, previewGeojson }), [routeSamples, previewGeojson])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    if (!active) { clearBriefingMapLayers(map); return }
    const { hover, selection, hiddenRows } = focus
    // 다른 막대를 가리키는 동안은 그 구간을 미리보기로, 아니면 누른 구간을 고정 강조로.
    const target = hover && hover.id !== selection?.id ? { item: hover.item, pinned: false } : selection ? { item: selection.item, pinned: true } : null
    syncBriefingMapLayers(map, {
      bands: hazardBandCollection(ribbon, route, { hiddenRows }),
      focus: focusCollection(ribbon, route, target),
    })
  }, [mapRef, isStyleReady, styleRevision, active, ribbon, route, focus])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return
    setAdvisoryHighlight(map, active ? focus.advisoryId : null)
  }, [mapRef, isStyleReady, styleRevision, active, focus.advisoryId])

  useEffect(() => { if (!active) setFocus(NO_FOCUS) }, [active])

  const goTo = useCallback((selection) => {
    const map = mapRef.current
    const item = selection?.item
    if (!item) return
    const bounds = coordinatesBounds(ribbonRangeCoordinates(route, item.startNm, item.endNm))
    if (map && bounds) map.fitBounds(bounds, { padding: fitPadding?.(80), maxZoom: 8, duration: 600 })
    const target = focusTarget(selection, { cruiseAltitudeFt })
    if (Number.isFinite(target?.timeMs)) setTimelineMs?.(target.timeMs)
    const level = nearestPressureLevelForAltitude(sliderLevels, target?.altitudeFt)
    if (level) setNwpSelection?.((previous) => previous?.level === level.id ? previous : { ...(previous ?? {}), level: level.id })
  }, [mapRef, route, cruiseAltitudeFt, fitPadding, setTimelineMs, sliderLevels, setNwpSelection])

  // 안내 문구용: 지도 KIM 레이어가 지금 그리는 기압면(FL)과 예보 시각.
  const pressure = Number.parseFloat(nwpSelection?.level)
  const kimTime = (sliderTimes ?? []).find((time) => Number(time?.hf) === Number(nwpSelection?.hf))
  const kimTimeMs = Number.isFinite(kimTime?.ms) ? kimTime.ms : Date.parse(kimTime?.validTime)
  const mapStatus = {
    levelLabel: Number.isFinite(pressure) ? formatPressureFlightLevel(pressure) : null,
    kimTimeMs: Number.isFinite(kimTimeMs) ? kimTimeMs : null,
  }

  return { setFocus, goTo, mapStatus }
}
