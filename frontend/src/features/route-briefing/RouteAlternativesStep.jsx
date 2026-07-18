import { useEffect, useRef, useState } from 'react'
import './RouteBriefing.css'
import { Button, Input } from '../../shared/ui/fluent.js'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import { metLabel } from '../map/layerActions.js'
import { hazardMapLayers } from './lib/hazardLayers.js'
import { formatRouteString } from './lib/routePlanner.js'

function exposureLabel(hazard) {
  const distance = hazard?.horizontalExposure?.intervals?.reduce((total, interval) => total + Math.max(0, interval.endNm - interval.startNm), 0)
  return Number.isFinite(distance) ? `${hazard.label} 수평 교차 ${Math.round(distance)} NM` : `${hazard?.label ?? '위험기상'} 수평 교차`
}

function relatedLayerIds(routeExposure) {
  return hazardMapLayers({ sections: { adverse: { hazards: (routeExposure?.hazards ?? []).map((hazard) => ({ code: hazard.phenomenon, source: hazard.source })) } } })
}

export default function RouteDesignStep({ designs = [], selectedDesignId, routeExposure, metVisibility = {}, onToggleMet, onSelect, onDuplicate, onRename, onRemove, mapInteractionMode, onSetMapInteractionMode, onApplyRouteString, onUndo, routeError, onBack, onContinue }) {
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [routeString, setRouteString] = useState('')
  const [changedTokens, setChangedTokens] = useState([])
  const previousRouteStringRef = useRef('')
  const selectedDesign = designs.find((design) => design.id === selectedDesignId)
  useEffect(() => {
    const next = selectedDesign?.routeString || formatRouteString(selectedDesign?.routeResult)
    const previous = previousRouteStringRef.current
    setRouteString(next)
    setChangedTokens(previous ? next.split(' ').filter((token, index) => token !== previous.split(' ')[index]) : [])
    previousRouteStringRef.current = next
  }, [selectedDesign])
  const status = routeExposure?.trigger
  const message = status === 'time_unknown'
    ? '수평 노출은 있으나 시간 판단 불가'
    : status === 'unavailable'
      ? '경로 기상 자료를 확인할 수 없습니다'
      : null
  const layerIds = relatedLayerIds(routeExposure)
  const beginRename = () => {
    setNameDraft(selectedDesign?.name ?? '')
    setRenaming(true)
  }
  const cancelRename = () => setRenaming(false)
  const saveRename = () => {
    if (selectedDesign) onRename(selectedDesign.id, nameDraft)
    setRenaming(false)
  }

  return (
    <div className="rb-alternatives">
      {message && <p className="rb-alternatives-status">{message}</p>}
      {routeExposure?.hazards?.map((hazard) => <p key={hazard.sourceId} className="rb-alternatives-reason">{exposureLabel(hazard)}</p>)}
      {layerIds.length > 0 && onToggleMet && <LayerToggleChips ariaLabel="경로 관련 기상 레이어" items={layerIds.map((id) => ({ key: id, label: metLabel(id), on: !!metVisibility[id], onToggle: () => onToggleMet(id) }))} />}
      {designs.map((design) => {
        const selected = design.id === selectedDesignId
        const distance = design.routeResult?.totalDistanceNm ?? design.routeResult?.distanceNm
        return (
          <button key={design.id} type="button" className={`rb-alternative-card${selected ? ' is-selected' : ''}`} onClick={() => onSelect(design.id)}>
            <strong>{design.name}</strong>
            <span>{Number.isFinite(distance) ? `${Math.round(distance)} NM` : '거리 자료 없음'}</span>
            {design.routeExposure?.hazards?.slice(0, 2).map((hazard) => <span key={hazard.sourceId} className="rb-card-hazard">{exposureLabel(hazard)}</span>)}
            {selected && <span>선택됨</span>}
          </button>
        )
      })}
      {selectedDesign && (
        renaming ? (
          <div className="rb-design-rename">
            <Input aria-label="설계안 이름" value={nameDraft} onChange={(_, data) => setNameDraft(data.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); saveRename() }
              if (event.key === 'Escape') cancelRename()
            }} />
            <Button appearance="primary" type="button" onClick={saveRename}>저장</Button>
            <Button appearance="secondary" type="button" onClick={cancelRename}>취소</Button>
          </div>
        ) : (
          <div className="rb-design-actions">
            <Button appearance="secondary" type="button" onClick={onDuplicate} disabled={designs.length >= 4}>복제</Button>
            <Button appearance="secondary" type="button" onClick={() => onSetMapInteractionMode?.(mapInteractionMode === 'click-add' ? null : 'click-add')}>{mapInteractionMode === 'click-add' ? '클릭 추가 종료' : '지도 클릭 추가'}</Button>
            <Button appearance="secondary" type="button" onClick={() => onSetMapInteractionMode?.(mapInteractionMode === 'draw' ? null : 'draw')}>{mapInteractionMode === 'draw' ? '그리기 종료' : '그리기'}</Button>
            <Button appearance="secondary" type="button" onClick={() => onSetMapInteractionMode?.(mapInteractionMode === 'segment-detour' ? null : 'segment-detour')}>{mapInteractionMode === 'segment-detour' ? '구간 우회 종료' : '구간 우회'}</Button>
            <Button appearance="secondary" type="button" onClick={onUndo} disabled={!selectedDesign.undoStack?.length}>되돌리기</Button>
            <Button appearance="secondary" type="button" onClick={beginRename}>이름 변경</Button>
            <Button appearance="secondary" type="button" onClick={onRemove} disabled={designs.length <= 1}>삭제</Button>
          </div>
        )
      )}
      {selectedDesign?.routeForm?.flightRule === 'IFR' && <div className="rb-design-route-string">
        <label htmlFor="rb-compatible-route">호환 경로 문자열</label>
        <Input id="rb-compatible-route" value={routeString} onChange={(_, data) => setRouteString(data.value)} />
        <Button appearance="secondary" type="button" onClick={() => onApplyRouteString?.(routeString)}>적용</Button>
      </div>}
      {changedTokens.length > 0 && <p className="rb-route-string-change">지도 수정 반영: {routeString.split(' ').map((token, index) => <span key={`${token}-${index}`} className={changedTokens.includes(token) ? 'is-changed' : ''}>{token} </span>)}</p>}
      {routeError && <p className="rb-alternatives-status" role="alert">{routeError}</p>}
      <p className="rb-alternatives-note">기상 레이어는 지도 표시용이며 설계안을 바꾸지 않습니다.</p>
      <div className="rb-step-actions">
        <Button appearance="secondary" type="button" onClick={onBack}>이전 단계</Button>
        <Button appearance="primary" type="button" disabled={!selectedDesignId} onClick={onContinue}>고도 비교로</Button>
      </div>
    </div>
  )
}
