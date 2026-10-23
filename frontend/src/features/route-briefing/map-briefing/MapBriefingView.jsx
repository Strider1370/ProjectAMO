import { useCallback, useEffect, useState } from 'react'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'
import { formatBriefingTime } from '../lib/briefingTime.js'
import { ribbonItemLayers } from '../lib/hazardLayers.js'
import MapBriefingPanel from './MapBriefingPanel.jsx'
import BriefingDock from './BriefingDock.jsx'
import HazardPopover from './HazardPopover.jsx'
import AirportCards from './AirportCards.jsx'
import { frameAdvisoryId, layerToastText, selectionDetail } from './mapBriefingModel.js'
import { readCollapsedRoles, writeCollapsedRoles } from './airportCardModel.js'
import './MapBriefing.css'

const TOAST_MS = 8000

// 지도형 브리핑: 지도 왼쪽 위 패널(브리핑 버튼으로 켜고 끔) + 지도 아래 독(위험 막대·연직단면도).
// 패널을 닫아도 독은 남는다. 끝내려면 패널의 "브리핑 종료".
// 막대·틀을 가리키면 지도 경로 미리보기, 누르면 구간 강조·팝오버·관련 레이어 켜기(꺼져 있을 때만, 고도·시간은 그대로).
// 지도 쪽 그리기는 MapView의 useBriefingMapLink가 맡고, 여기서는 무엇을 가리키고 눌렀는지만 알린다(onMapFocus).
export default function MapBriefingView({ briefing, panelOpen, distanceNm, tasKt, verticalProfile, crossSection, advisories,
  nwpTimeSelection, onSetWaypointNwpOffset, onSelectForecastHour, crossSectionHourLoading,
  onClosePanel, onDocumentView, onSave, onEdit, onEnd, onDockHeightChange,
  metVisibility = {}, mapStatus = null, timelineMs = null, onLayersOn, onLayersOff, onMapFocus, onGoTo,
  mapRef = null, airports = [], onOpenAirport }) {
  const { tz } = useTimeZone()
  const [selection, setSelection] = useState(null)
  const [hover, setHover] = useState(null)
  const [profileAdvisoryId, setProfileAdvisoryId] = useState(null)
  const [hiddenRows, setHiddenRows] = useState([])
  const [toast, setToast] = useState(null) // { ids, at }
  const [collapsedRoles, setCollapsedRoles] = useState(readCollapsedRoles)
  useEffect(() => { writeCollapsedRoles(collapsedRoles) }, [collapsedRoles])
  // 이 브리핑에 있는 공항 역할(교체공항이 없으면 출발·도착만) — "모두 접기/펼치기" 기준.
  const cardRoles = [...new Set((briefing?.sections?.current?.airports ?? []).map((airport) => airport.role))]
  const cardsAllCollapsed = cardRoles.length > 0 && cardRoles.every((role) => collapsedRoles.includes(role))
  const toggleCollapse = (role) => setCollapsedRoles((roles) => roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role])
  const toggleAllCards = () => setCollapsedRoles((roles) => cardsAllCollapsed ? roles.filter((role) => !cardRoles.includes(role)) : [...new Set([...roles, ...cardRoles])])
  const ribbon = briefing?.sections?.enroute?.ribbon ?? null
  const hhmm = (iso) => formatBriefingTime(iso, tz).replace(` ${tz}`, '').replace('Z', '')

  // 단면 상자 ↔ 위험 막대 틀 ↔ 지도 면: 단면에서 가리킨 발표 > 가리킨 틀 > 누른 틀.
  const advisoryId = profileAdvisoryId ?? frameAdvisoryId(hover?.kind === 'frame' ? hover.item : null)
    ?? frameAdvisoryId(selection?.kind === 'frame' ? selection.item : null)

  useEffect(() => { onMapFocus?.({ hover, selection, advisoryId, hiddenRows }) }, [onMapFocus, hover, selection, advisoryId, hiddenRows])
  // 독 높이를 앱 전체에 알린다 — 지도 영역 밖(앱 최상위)에 있는 공항 패널이 브리핑 중 독 위까지만 뜨도록(MapBriefing.css).
  const handleDockHeight = useCallback((height) => {
    document.documentElement.style.setProperty('--mb-dock-h-app', `${Math.round(height)}px`)
    onDockHeightChange?.(height)
  }, [onDockHeightChange])
  useEffect(() => () => document.documentElement.style.removeProperty('--mb-dock-h-app'), [])
  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  // 누르면 선택(같은 것을 다시 누르면 해제). 관련 레이어가 꺼져 있으면 켜고 안내한다 — 켠 레이어는 선택을 풀어도 둔다.
  const select = (next) => {
    if (selection?.id === next.id) { setSelection(null); return }
    setSelection(next)
    const off = ribbonItemLayers(next.row.key, next.kind, next.item).filter((id) => !metVisibility[id])
    if (off.length) {
      onLayersOn?.(off)
      setToast({ ids: off, at: Date.now() })
    }
  }
  const closePopover = useCallback(() => setSelection(null), [])

  // 요약 칸에서 누른 위험(지금 보이는 줄)을 위험 막대에서 고른다.
  const selectSummary = (top) => {
    if (!top) return
    const row = ribbon.rows.find((candidate) => candidate.key === top.row)
    const list = top.kind === 'model' ? row?.model : row?.frames
    const index = (list ?? []).findIndex((item) => item.startNm === top.startNm && item.endNm === top.endNm)
    if (row && index >= 0) select({ id: `${row.key}:${top.kind}:${index}`, row, kind: top.kind, item: list[index] })
  }

  const detail = selection ? selectionDetail(selection, { runs: ribbon?.runs, formatTime: hhmm, tzLabel: tz === 'KST' ? 'KST' : 'UTC' }) : null
  const toastText = toast ? layerToastText(toast.ids, {
    levelLabel: mapStatus?.levelLabel ?? null,
    timeLabel: formatBriefingTime(new Date(mapStatus?.kimTimeMs ?? timelineMs ?? toast.at).toISOString(), tz),
  }) : null

  return (
    <>
      <AirportCards briefing={briefing} mapRef={mapRef} airports={airports} routeSamples={verticalProfile?.axis?.samples ?? null} onOpenAirport={onOpenAirport}
        collapsedRoles={collapsedRoles} onToggleCollapse={toggleCollapse} />
      {panelOpen && (
        <MapBriefingPanel briefing={briefing} distanceNm={distanceNm} tasKt={tasKt} onClose={onClosePanel}
          onDocumentView={onDocumentView} onSave={onSave} onEdit={onEdit} onEnd={onEnd} onSelectSummary={selectSummary}
          cardsAllCollapsed={cardsAllCollapsed} onToggleAllCards={cardRoles.length ? toggleAllCards : null} />
      )}
      {toastText && (
        <div className={`mb-toast${panelOpen ? ' is-beside-panel' : ''}`} role="status">
          <span><b>{toastText.layers}</b> 레이어를 켰습니다{toastText.detail ? ` · ${toastText.detail}` : ''}</span>
          <button type="button" onClick={() => { onLayersOff?.(toast.ids); setToast(null) }}>끄기</button>
        </div>
      )}
      <BriefingDock ribbon={ribbon} verticalProfile={verticalProfile} crossSection={crossSection} advisories={advisories}
        nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset} onSelectForecastHour={onSelectForecastHour}
        crossSectionHourLoading={crossSectionHourLoading} selectedId={selection?.id ?? null}
        onSelect={select} onHover={setHover} highlightAdvisoryId={advisoryId} onHoverAdvisory={setProfileAdvisoryId}
        hiddenRows={hiddenRows} onToggleRow={(key) => setHiddenRows((rows) => rows.includes(key) ? rows.filter((r) => r !== key) : [...rows, key])}
        onHeightChange={handleDockHeight} />
      {selection && <HazardPopover selection={selection} detail={detail} onClose={closePopover} onGoTo={(target) => onGoTo?.(target)} />}
    </>
  )
}
