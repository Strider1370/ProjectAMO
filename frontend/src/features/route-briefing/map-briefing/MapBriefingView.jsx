import { useState } from 'react'
import MapBriefingPanel from './MapBriefingPanel.jsx'
import BriefingDock from './BriefingDock.jsx'
import './MapBriefing.css'

// 지도형 브리핑: 지도 왼쪽 위 패널(브리핑 버튼으로 켜고 끔) + 지도 아래 독(위험 막대·연직단면도).
// 패널을 닫아도 독은 남는다. 끝내려면 패널의 "브리핑 종료".
export default function MapBriefingView({ briefing, panelOpen, distanceNm, tasKt, verticalProfile, crossSection, advisories,
  nwpTimeSelection, onSetWaypointNwpOffset, onSelectForecastHour, crossSectionHourLoading,
  onClosePanel, onDocumentView, onSave, onEdit, onEnd, onDockHeightChange }) {
  const [selection, setSelection] = useState(null)
  const ribbon = briefing?.sections?.enroute?.ribbon ?? null

  const selectSummary = () => {
    const top = ribbon?.summary?.top
    if (!top) return
    const row = ribbon.rows.find((candidate) => candidate.key === top.row)
    const list = top.kind === 'model' ? row?.model : row?.frames
    const index = (list ?? []).findIndex((item) => item.startNm === top.startNm && item.endNm === top.endNm)
    if (row && index >= 0) setSelection({ id: `${row.key}:${top.kind}:${index}`, row, kind: top.kind, item: list[index] })
  }

  return (
    <>
      {panelOpen && (
        <MapBriefingPanel briefing={briefing} distanceNm={distanceNm} tasKt={tasKt} onClose={onClosePanel}
          onDocumentView={onDocumentView} onSave={onSave} onEdit={onEdit} onEnd={onEnd} onSelectSummary={selectSummary} />
      )}
      <BriefingDock ribbon={ribbon} verticalProfile={verticalProfile} crossSection={crossSection} advisories={advisories}
        nwpTimeSelection={nwpTimeSelection} onSetWaypointNwpOffset={onSetWaypointNwpOffset} onSelectForecastHour={onSelectForecastHour}
        crossSectionHourLoading={crossSectionHourLoading} selectedId={selection?.id ?? null}
        onSelect={(next) => setSelection((current) => current?.id === next.id ? null : next)} onHeightChange={onDockHeightChange} />
    </>
  )
}
