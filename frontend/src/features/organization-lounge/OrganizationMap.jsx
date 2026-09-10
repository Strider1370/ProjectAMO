import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cloud, Layers, Map } from 'lucide-react'
import MapView from '../map/MapView.jsx'
import useLinkedItemSelection from './hooks/useLinkedItemSelection.js'
import useOrganizationMapAdapter from './hooks/useOrganizationMapAdapter.js'
import { getOrganizationRouteGeometry, organizationLinkedItems } from './lib/organizationMapModel.js'
import { linkedItemKey } from './lib/linkedSelection.js'
import { pinnedFrameStatus, pinnedModelStatus } from './lib/pinnedMapDataSelection.js'
import { presentationMapDataSelection } from './lib/presentationModel.js'
import { organizationMapWeatherProps } from './lib/organizationMapWeather.js'
import useOrganizationMapLayers from './hooks/useOrganizationMapLayers.js'
import './OrganizationMap.css'

const EMPTY_ANNOTATIONS = Object.freeze([])


export default function OrganizationMap({
  orgId,
  bundle = null,
  situation = null,
  dataMode = 'live',
  selectedItemId = null,
  onSelectItem,
  annotations = EMPTY_ANNOTATIONS,
  onMapClick,
  drawing = false,
  showControls = true,
  className = '',
  style,
}) {
  const [mapLifecycle, setMapLifecycle] = useState({ map: null, styleRevision: 0 })
  const [frameFailures, setFrameFailures] = useState({})
  const [activePanel, setActivePanel] = useState(null)
  const [layerCounts, setLayerCounts] = useState({})
  const live = dataMode === 'live'
  const layerWeather = useOrganizationMapLayers(live)
  const flightId = bundle?.flight?.id || bundle?.flightId || null
  const selection = useLinkedItemSelection({ flightId, selectedItemId, onSelectItem })
  const linkedItems = useMemo(
    () => organizationLinkedItems({ bundle, situation, annotations }),
    [bundle, situation, annotations],
  )
  const handleMapLifecycle = useCallback((next) => {
    if (!next?.map) return
    setMapLifecycle({ map: next.map, styleRevision: Number(next.styleRevision) || 0 })
  }, [])
  useEffect(() => { setFrameFailures({}) }, [bundle?.bundleId])

  useOrganizationMapAdapter({
    ...mapLifecycle,
    bundle,
    situation,
    annotations,
    activeItemId: selection.activeItemId,
    pinnedItemId: selection.pinnedItemId,
    onPreviewItem: selection.preview,
    onClearPreview: selection.clearPreview,
    onPinItem: selection.pin,
    onMapClick,
    drawing,
    onFrameError: (kind, reason) => setFrameFailures((current) => {
      const failure = reason || 'load_failed'
      return current[kind] === failure ? current : { ...current, [kind]: failure }
    }),
  })

  const selected = linkedItems.find((item) => {
    const key = linkedItemKey(item)
    return key === selection.activeItemId || String(item.id ?? item.itemId) === String(selection.activeItemId)
  })
  const selectedAltitude = selected?.altitude || (selected?.altitudeRangeFt ? {
    minFt: selected.altitudeRangeFt.from,
    maxFt: selected.altitudeRangeFt.to,
  } : null)
  const hasPinnedSelection = Boolean(selection.pinnedItemId)
  const pinnedSelection = presentationMapDataSelection(bundle)
  const pinnedStatuses = dataMode === 'pinned' && pinnedSelection
    ? [pinnedModelStatus(pinnedSelection, 'kim'), pinnedModelStatus(pinnedSelection, 'ktg')]
    : []
  const unsupportedModels = pinnedStatuses.filter((item) => item.status === 'unsupported').length
  const unavailableFrames = dataMode === 'pinned' && pinnedSelection
    ? ['radar', 'satellite'].map((kind) => [kind, pinnedFrameStatus(pinnedSelection, kind)])
      .filter(([kind, status]) => status.status !== 'available' || frameFailures[kind])
    : []
  const routeAvailable = Boolean(getOrganizationRouteGeometry(bundle))

  return <div
    className={`organization-map ${className}`.trim()}
    style={style}
    data-org-id={orgId}
    data-data-mode={dataMode}
    data-controls={showControls ? 'visible' : 'hidden'}
    data-route={routeAvailable ? 'available' : 'empty'}
  >
    <MapView
      activePanel={live ? activePanel : null}
      {...organizationMapWeatherProps({ bundle, situation, dataMode, layerWeather })}
      onClosePanel={() => setActivePanel(null)}
      onOpenNotamPanel={() => setActivePanel('notam')}
      onOpenMetPanel={() => setActivePanel('met')}
      onLayerCountsChange={setLayerCounts}
      enableRouteBriefing={false}
      enableFlightCategory={live}
      enableTyphoonOverlay={live}
      showMapTools={false}
      showAdvisoryBadges={false}
      showWeatherLegends={live}
      showGeolocateControl={false}
      showRadarWindControl={live}
      initialMetVisibility={dataMode === 'pinned' ? { radarHsr: false, wind: true } : undefined}
      dataMode={dataMode}
      mapDataSelection={pinnedSelection}
      onMapLifecycle={handleMapLifecycle}
    />
    {live && <div className="organization-map__layer-buttons" role="group" aria-label="지도 패널">
      {[
        { id: 'aviation', label: '항공정보', Icon: Layers },
        { id: 'met', label: '기상정보', Icon: Cloud },
        { id: 'my-map', label: '내 지도', Icon: Map },
      ].map(({ id, label, Icon }) => <button key={id} type="button"
        aria-label={label} aria-expanded={activePanel === id}
        onClick={() => setActivePanel((current) => current === id ? null : id)}>
        <Icon size={18} aria-hidden="true" /><span>{label}</span>
        {layerCounts[id] > 0 && <small aria-label={`${layerCounts[id]}개 켜짐`}>{layerCounts[id]}</small>}
      </button>)}
    </div>}
    {dataMode === 'pinned' && !pinnedSelection && <div className="organization-map__status" role="status">
      고정할 지도 자료 식별자가 없어 기상 레이어를 표시하지 않습니다.
    </div>}
    {dataMode === 'pinned' && pinnedSelection && (unsupportedModels > 0 || unavailableFrames.length > 0) && <div className="organization-map__status" role="status">
      {unsupportedModels > 0 && `불변 revision이 없는 모델 ${unsupportedModels}개는 표시하지 않습니다. `}
      {unavailableFrames.length > 0 && `${unavailableFrames.map(([kind]) => kind === 'radar' ? '레이더' : '위성').join('·')} frame은 고정 자료가 없거나 만료·로드 실패로 표시하지 않습니다.`}
    </div>}
    {selected && <div className="organization-map__selection" aria-live="polite">
      <span><strong>{hasPinnedSelection ? '선택 고정' : '미리보기'} · {selected.title || selected.summary || '연결 항목'}</strong>
        <small>{selectedAltitude ? `${selectedAltitude.minFt?.toLocaleString()}–${selectedAltitude.maxFt?.toLocaleString()} ft AMSL` : '위치만 연결 · 고도 미지정'}</small></span>
      {hasPinnedSelection && <button type="button" onClick={selection.clear}>선택 해제</button>}
    </div>}
  </div>
}
