import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { formatBriefingTime } from '../lib/briefingTime.js'
import { setAdvisoryHighlight } from '../../weather-overlays/lib/advisoryLayers.js'
import { KIM_PRESSURE_LEVELS, formatPressureFlightLevel, nearestPressureLevelForAltitude } from '../../weather-overlays/lib/pressureLevelModel.js'
import { altitudeBubbleNote, briefingAltitudeMarks } from './briefingAltitudeModel.js'
import { clearBriefingMapLayers, coordinatesBounds, focusCollection, hazardBandCollection, ribbonRangeCoordinates, syncBriefingMapLayers } from './briefingMapLayers.js'
import { focusTarget } from './mapBriefingModel.js'

const NO_FOCUS = { hover: null, selection: null, advisoryId: null, hiddenRows: [] }

// 지도형 브리핑 ↔ 지도 연동. MapView는 이 훅을 부르고 콜백만 MapBriefingView에 넘긴다.
// - 경로 위 위험 색 띠, 막대를 가리키거나 누른 구간 강조·이름표, 가리킨 SIGMET 면 강조
// - goTo: 팝오버 "지도·슬라이더를 이 구간으로" — 누를 때만 지도·시간·고도를 옮긴다.
// - mapStatus: 켠 레이어 안내에 쓸 지금 지도 고도(KIM 기압면)·시각
// - 5단계: 브리핑을 열 때 한 번 고도 손잡이 = 순항고도에 가장 가까운 기압면, 시간 손잡이 = ETD(지났으면 지금 시각).
//   그 뒤로는 사용자가 움직일 때만 바뀐다. altitudeMarks(고도 슬라이더 표시)·flightWindow(시간 막대 ETD~ETA 창).
export function useBriefingMapLink({
  mapRef, isStyleReady, styleRevision, active, ribbon, routeSamples, previewGeojson, cruiseAltitudeFt, etd = null, eta = null, nowMs = null,
  fitPadding, setTimelineMs, nwpSelection, setNwpSelection, sliderLevels, sliderTimes,
}) {
  const { tz } = useTimeZone()
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

  // 새 브리핑을 열 때 한 번만(같은 브리핑에서는 다시 맞추지 않는다 — 화면이 스스로 움직이지 않는다).
  const levels = sliderLevels?.length ? sliderLevels : KIM_PRESSURE_LEVELS
  const appliedRef = useRef(null)
  useEffect(() => {
    if (!active || !ribbon || appliedRef.current === ribbon) return
    appliedRef.current = ribbon
    const level = nearestPressureLevelForAltitude(levels, cruiseAltitudeFt)
    if (level) setNwpSelection?.((previous) => previous?.level === level.id ? previous : { ...(previous ?? {}), level: level.id })
    const etdMs = Date.parse(etd)
    const now = Number.isFinite(nowMs) ? nowMs : Date.now()
    // 지났으면 "지금"을 시각으로 넣는다(실시간 null로 두면 손잡이가 마지막 관측 프레임에 붙어, 관측이 늦거나 오래된 자료에서 창이 화면 밖에 있었다).
    if (Number.isFinite(etdMs)) setTimelineMs?.(Math.max(etdMs, now))
  }, [active, ribbon, levels, cruiseAltitudeFt, etd, nowMs, setNwpSelection, setTimelineMs])

  const marks = useMemo(() => {
    if (!active || !ribbon) return null
    const base = briefingAltitudeMarks(ribbon, { cruiseAltitudeFt })
    return { ...base, noteFor: (altitudeFt, mapLabel) => altitudeBubbleNote(base, { mapAltitudeFt: altitudeFt, mapLabel }) }
  }, [active, ribbon, cruiseAltitudeFt])
  const flightWindow = useMemo(() => {
    const startMs = Date.parse(etd), endMs = Date.parse(eta)
    if (!active || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
    const hhmm = (iso) => formatBriefingTime(iso, tz).replace(` ${tz}`, '').replace('Z', '')
    return { startMs, endMs, label: `ETD ${hhmm(etd)} → ETA ${hhmm(eta)}`, etdLabel: `ETD ${hhmm(etd)}`, etaLabel: `ETA ${hhmm(eta)}` }
  }, [active, etd, eta, tz])

  const goTo = useCallback((selection) => {
    const map = mapRef.current
    const item = selection?.item
    if (!item) return
    const bounds = coordinatesBounds(ribbonRangeCoordinates(route, item.startNm, item.endNm))
    if (map && bounds) map.fitBounds(bounds, { padding: fitPadding?.(80), maxZoom: 8, duration: 600 })
    const target = focusTarget(selection, { cruiseAltitudeFt })
    if (Number.isFinite(target?.timeMs)) setTimelineMs?.(target.timeMs)
    const level = nearestPressureLevelForAltitude(levels, target?.altitudeFt)
    if (level) setNwpSelection?.((previous) => previous?.level === level.id ? previous : { ...(previous ?? {}), level: level.id })
  }, [mapRef, route, cruiseAltitudeFt, fitPadding, setTimelineMs, levels, setNwpSelection])

  // 안내 문구용: 지도 KIM 레이어가 지금 그리는 기압면(FL)과 예보 시각.
  const pressure = Number.parseFloat(nwpSelection?.level)
  const kimTime = (sliderTimes ?? []).find((time) => Number(time?.hf) === Number(nwpSelection?.hf))
  const kimTimeMs = Number.isFinite(kimTime?.ms) ? kimTime.ms : Date.parse(kimTime?.validTime)
  const mapStatus = {
    levelLabel: Number.isFinite(pressure) ? formatPressureFlightLevel(pressure) : null,
    kimTimeMs: Number.isFinite(kimTimeMs) ? kimTimeMs : null,
  }

  return { setFocus, goTo, mapStatus, altitudeMarks: marks, flightWindow }
}
