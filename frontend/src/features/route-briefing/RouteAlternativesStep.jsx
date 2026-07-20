import { useEffect, useRef, useState } from 'react'
import './RouteBriefing.css'
import { Button, Input } from '../../shared/ui/fluent.js'
import { ChevronUp, ChevronDown } from 'lucide-react'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import { metLabel } from '../map/layerActions.js'
import { hazardMapLayers } from './lib/hazardLayers.js'
import { formatRouteString } from './lib/routePlanner.js'
import { buildRouteComparison, exposureNm } from './lib/routeComparison.js'
import { computeEtaIso } from './lib/etaCalc.js'

function exposureLabel(hazard) {
  const distance = hazard?.horizontalExposure?.intervals?.reduce((total, interval) => total + Math.max(0, interval.endNm - interval.startNm), 0)
  return Number.isFinite(distance) ? `${hazard.label} 수평 교차 ${Math.round(distance)} NM` : `${hazard?.label ?? '위험기상'} 수평 교차`
}

function relatedLayerIds(routeExposure) {
  return hazardMapLayers({ sections: { adverse: { hazards: (routeExposure?.hazards ?? []).map((hazard) => ({ code: hazard.phenomenon, source: hazard.source })) } } })
}

export default function RouteDesignStep({ designs = [], selectedDesignId, routeExposure, etd, tasKt, metVisibility = {}, onToggleMet, onSelect, onDuplicate, onRename, onRemove, onStartDraft, onUpdateDraft, onPreviewDraft, onCancelDraft, onApplyDraft, onUndo, routeError, onBack, onContinue, hideStepActions = false }) {
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [routeString, setRouteString] = useState('')
  const [changedTokens, setChangedTokens] = useState([])
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [expandedHazardIds, setExpandedHazardIds] = useState(() => new Set())
  const previousRouteStringRef = useRef('')
  const selectedDesign = designs.find((design) => design.id === selectedDesignId)
  const baseDesign = designs.find((design) => design.kind === 'base' || design.id === 'base')
  const baseDistance = Number(baseDesign?.routeResult?.totalDistanceNm ?? baseDesign?.routeResult?.distanceNm)
  const baseEta = computeEtaIso(etd, baseDistance, tasKt)
  const comparisonById = new Map(buildRouteComparison(baseDesign, designs.filter((design) => design.kind === 'alternative'), { etd, tasKt, weatherSnapshot: baseDesign?.routeExposure?.snapshot }).map((row) => [row.id, row]))
  useEffect(() => {
    const next = (selectedDesign?.draftEditor?.rawText ?? selectedDesign?.routeString) || formatRouteString(selectedDesign?.routeResult)
    const previous = previousRouteStringRef.current
    setRouteString(next)
    setChangedTokens(previous ? next.split(' ').filter((token, index) => token !== previous.split(' ')[index]) : [])
    previousRouteStringRef.current = next
    setDeleteArmed(false)
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
      {baseDesign && <div className="rb-comparison-summary">
        <strong>{baseDesign.name}</strong>
        <span>{Number.isFinite(baseDistance) ? `${Math.round(baseDistance)} NM` : '거리 자료 없음'}</span>
        {baseEta && <span>ETA {baseEta.slice(11, 16)} UTC</span>}
        <Button appearance="primary" type="button" onClick={onDuplicate} disabled={designs.length >= 4}>이 경로에서 우회안 만들기</Button>
      </div>}
      {message && <p className="rb-alternatives-status">{message}</p>}
      {routeExposure?.hazards?.map((hazard) => <p key={hazard.sourceId} className="rb-alternatives-reason">{exposureLabel(hazard)}</p>)}
      {layerIds.length > 0 && onToggleMet && <details className="rb-hazard-disclosure"><summary>위험 표시</summary><LayerToggleChips ariaLabel="경로 관련 기상 레이어" items={layerIds.map((id) => ({ key: id, label: metLabel(id), on: !!metVisibility[id], onToggle: () => onToggleMet(id) }))} /></details>}
      {designs.filter((design) => design.kind === 'alternative').map((design) => {
        const selected = design.id === selectedDesignId
        const distance = design.routeResult?.totalDistanceNm ?? design.routeResult?.distanceNm
        const comparison = comparisonById.get(design.id)
        const hazards = [...(design.routeExposure?.hazards ?? [])].sort((a, b) => exposureNm(b) - exposureNm(a))
        const expanded = expandedHazardIds.has(design.id)
        const visibleHazards = expanded ? hazards : hazards.slice(0, 3)
        const hiddenCount = hazards.length - visibleHazards.length
        const totalHazardExposureNm = Math.round(hazards.reduce((sum, hazard) => sum + exposureNm(hazard), 0))
        return (
          <button key={design.id} type="button" aria-selected={selected} className={`rb-alternative-card${selected ? ' is-selected' : ''}`} onClick={() => onSelect(design.id)}>
            <strong>{design.name}</strong>
            <span>{Number.isFinite(distance) ? `${Math.round(distance)} NM` : '거리 자료 없음'}</span>
            {comparison?.eta && <span>ETA {comparison.eta.slice(11, 16)} UTC</span>}
            {comparison?.distanceDeltaNm != null && <span>기준 대비 {comparison.distanceDeltaNm > 0 ? '+' : ''}{comparison.distanceDeltaNm} NM · {comparison.etaDeltaMinutes > 0 ? '+' : ''}{comparison.etaDeltaMinutes}분</span>}
            {comparison?.comparisonUnavailable && <span>위험 노출 비교 자료 없음</span>}
            <span className={`rb-card-total-exposure${hazards.length === 0 ? ' is-zero' : ''}`}>위험기상 노출 합계 {totalHazardExposureNm} NM · {hazards.length}건</span>
            <span className="rb-card-hazard">
              {hazards.length > 0
                ? visibleHazards.map((hazard) => <span key={hazard.sourceId} className="hz-chip">{exposureLabel(hazard)}</span>)
                : <span className="hz-chip">그 외 보고 없음</span>}
            </span>
            {hiddenCount > 0 && (
              <span
                role="button"
                tabIndex={0}
                className="rb-card-more"
                onClick={(event) => { event.stopPropagation(); setExpandedHazardIds((prev) => new Set(prev).add(design.id)) }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setExpandedHazardIds((prev) => new Set(prev).add(design.id)) } }}
              >
                {hiddenCount}건 더 보기
              </span>
            )}
            {selected && <span>선택됨</span>}
          </button>
        )
      })}
      {selectedDesign?.kind === 'alternative' && (
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
            <Button appearance="secondary" type="button" onClick={() => onStartDraft?.(selectedDesign.id)}>항로 문자열 직접 편집</Button>
            {selectedDesign.undoStack?.length > 0 && <Button appearance="secondary" type="button" onClick={onUndo}>되돌리기</Button>}
            <Button appearance="secondary" type="button" onClick={onDuplicate} disabled={designs.length >= 4}>우회안 복제</Button>
            <Button appearance="secondary" type="button" onClick={beginRename}>이름 변경</Button>
            <Button appearance="secondary" type="button" onClick={() => {
              if (deleteArmed) { onRemove(); setDeleteArmed(false) } else setDeleteArmed(true)
            }}>{deleteArmed ? `${selectedDesign.name} 삭제` : '삭제'}</Button>
          </div>
        )
      )}
      {selectedDesign?.kind === 'alternative' && selectedDesign.draftEditor && <div className="rb-design-route-string">
        <label htmlFor="rb-compatible-route">항로 문자열 직접 편집</label>
        <textarea id="rb-compatible-route" value={routeString} onChange={(event) => { setRouteString(event.target.value); onUpdateDraft?.(event.target.value) }} onKeyDown={(event) => { if (event.ctrlKey && event.key === 'Enter') onApplyDraft?.() }} />
        <div className="rb-design-route-actions">
          <Button appearance="primary" type="button" onClick={() => onApplyDraft?.()} disabled={!routeString.trim()}>적용</Button>
          <Button appearance="secondary" type="button" onClick={onCancelDraft}>취소</Button>
        </div>
        {selectedDesign.draftEditor.error && <p role="alert">{selectedDesign.draftEditor.error}</p>}
      </div>}
      {selectedDesign?.kind === 'alternative' && comparisonById.get(selectedDesign.id)?.exposures?.length > 0 && <div className="rb-comparison-detail">
        <p>기준 대비 위험 노출</p>
        {comparisonById.get(selectedDesign.id).exposures.map((exposure) => (
          <p key={exposure.key}>
            {exposure.label}: {exposure.unavailable ? '비교 자료 없음' : (
              <>
                {exposure.baseNm} NM → {exposure.alternativeNm} NM
                {exposure.deltaNm !== 0 && (exposure.deltaNm > 0 ? <ChevronUp size={14} style={{ verticalAlign: 'middle', opacity: 0.6 }} /> : <ChevronDown size={14} style={{ verticalAlign: 'middle', opacity: 0.6 }} />)}
                {' '}({exposure.deltaNm > 0 ? '+' : ''}{exposure.deltaNm} NM)
              </>
            )}
          </p>
        ))}
      </div>}
      {changedTokens.length > 0 && <p className="rb-route-string-change">지도 수정 반영: {routeString.split(' ').map((token, index) => <span key={`${token}-${index}`} className={changedTokens.includes(token) ? 'is-changed' : ''}>{token} </span>)}</p>}
      {routeError && <p className="rb-alternatives-status" role="alert">{routeError}</p>}
      <p className="rb-alternatives-note">지도: 기준 점선 · 선택 우회안 실선 · 다른 우회안 보조선 · 초안 점선 · 위험 영역</p>
      {!hideStepActions && <div className="rb-step-actions">
        <Button appearance="secondary" type="button" onClick={onBack}>이전 단계</Button>
        <Button appearance="primary" type="button" disabled={!selectedDesignId} onClick={onContinue}>{selectedDesign?.kind === 'alternative' ? '이 우회안으로 고도 비교' : '고도 비교로'}</Button>
      </div>}
    </div>
  )
}
