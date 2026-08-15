import { useEffect, useMemo, useRef, useState } from 'react'
import './RouteBriefing.css'
import { Button } from '../../shared/ui/fluent.js'
import { Route, Clock, CloudLightning, Plus, X } from 'lucide-react'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import RouteTokenField from './RouteTokenField.jsx'
import { metLabel, buildRouteAviationLayerChips } from '../map/layerActions.js'
import { hazardMapLayers } from './lib/hazardLayers.js'
import { formatRouteString } from './lib/routePlanner.js'
import { buildRouteComparison, exposureNm, mergeExposureNm, phenomenonLabelKo } from './lib/routeComparison.js'
import { computeEtaIso } from './lib/etaCalc.js'
import HazardIcon from './lib/HazardIcon.jsx'

function exposureLabel(hazard) {
  const label = phenomenonLabelKo(hazard?.label) ?? '위험기상'
  const distance = hazard?.horizontalExposure?.intervals?.reduce((total, interval) => total + Math.max(0, interval.endNm - interval.startNm), 0)
  return Number.isFinite(distance) ? `${label} 수평 교차 ${Math.round(distance)} NM` : `${label} 수평 교차`
}

function hazardChipClassName(source) {
  if (source?.includes('SIGMET')) return 'hz-chip hz-sigmet'
  if (source?.includes('AIRMET')) return 'hz-chip hz-airmet'
  if (source?.includes('TYPHOON')) return 'hz-chip hz-typhoon'
  return 'hz-chip'
}

function relatedLayerIds(routeExposure) {
  return hazardMapLayers({ sections: { adverse: { hazards: (routeExposure?.hazards ?? []).map((hazard) => ({ code: hazard.phenomenon, source: hazard.source })) } } })
}

export default function RouteDesignStep({ designs = [], selectedDesignId, routeExposure, etd, tasKt, metVisibility = {}, onToggleMet, aviationVisibility = {}, onToggleAviation, onSelect, onDuplicate, onRemove, onStartDraft, onUpdateDraft, onPreviewDraft, onApplyDraft, onUndo, routeError, classifyRouteTexts, onBack, onContinue, hideStepActions = false }) {
  const [routeString, setRouteString] = useState('')
  const [changedTokens, setChangedTokens] = useState([])
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [expandedHazardIds, setExpandedHazardIds] = useState(() => new Set())
  const toggleExpandedHazards = (designId) => setExpandedHazardIds((prev) => {
    const next = new Set(prev)
    if (next.has(designId)) next.delete(designId)
    else next.add(designId)
    return next
  })
  const previousRouteStringRef = useRef('')
  // 판정은 비행 설정 단계와 같은 함수를 쓴다 — 자료를 복사해 오면 두 화면이 어긋난다.
  const draftTokens = useMemo(
    () => (classifyRouteTexts ? classifyRouteTexts(routeString.trim() ? routeString.trim().split(/\s+/) : []) : []),
    [classifyRouteTexts, routeString],
  )
  const draftTokenErrors = useMemo(
    () => draftTokens.filter((token) => token.reason).map((token) => token.reason),
    [draftTokens],
  )
  const selectedDesign = designs.find((design) => design.id === selectedDesignId)
  const appliedRouteString = selectedDesign?.routeString || formatRouteString(selectedDesign?.routeResult) || ''
  const baseDesign = designs.find((design) => design.kind === 'base' || design.id === 'base')
  const baseDistance = Number(baseDesign?.routeResult?.totalDistanceNm ?? baseDesign?.routeResult?.distanceNm)
  const baseEta = computeEtaIso(etd, baseDistance, tasKt)
  const baseHazards = routeExposure?.hazards ?? []
  const baseTotalHazardExposureNm = Math.round(mergeExposureNm(baseHazards))
  const comparisonById = new Map(buildRouteComparison(baseDesign, designs.filter((design) => design.kind === 'alternative'), { etd, tasKt, weatherSnapshot: baseDesign?.routeExposure?.snapshot }).map((row) => [row.id, row]))
  useEffect(() => {
    const next = (selectedDesign?.draftEditor?.rawText ?? selectedDesign?.routeString) || formatRouteString(selectedDesign?.routeResult)
    const previous = previousRouteStringRef.current
    setRouteString(next)
    setChangedTokens(previous ? next.split(' ').filter((token, index) => token !== previous.split(' ')[index]) : [])
    previousRouteStringRef.current = next
    setDeleteArmed(false)
  }, [selectedDesign])
  // 우회안을 선택하면(주로 방금 복제해서 자동 선택된 직후) 항로 문자열 편집칸이 바로 뜨게 한다 —
  // 지도 드래그를 먼저 해야만 편집칸이 나타나던 방식 대신, 선택 자체가 진입점이 되도록.
  // selectedDesignId에만 반응해야 한다 — selectedDesign 전체에 반응하면 타이핑할 때마다(=매번
  // draftEditor가 바뀌어 selectedDesign 참조가 바뀔 때마다) 다시 실행돼 입력 중이던 걸 덮어쓴다.
  useEffect(() => {
    if (selectedDesign?.kind === 'alternative' && !selectedDesign.draftEditor) onStartDraft?.(selectedDesign.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDesignId])
  const status = routeExposure?.trigger
  const message = status === 'time_unknown'
    ? '수평 노출은 있으나 시간 판단 불가'
    : status === 'unavailable'
      ? '경로 기상 자료를 확인할 수 없습니다'
      : null
  const layerIds = relatedLayerIds(routeExposure)

  return (
    <div className="rb-alternatives">
      {baseDesign && <div className={`rb-comparison-summary${selectedDesignId === baseDesign.id ? ' is-selected' : ''}`}>
        <button type="button" className="rb-comparison-summary-select" aria-selected={selectedDesignId === baseDesign.id} onClick={() => onSelect(baseDesign.id)}>
          <strong>{baseDesign.name}</strong>
          <span className="rb-route-stats">
            <span className="rb-route-stat">
              <span className="rb-route-stat-label"><Route size={16} />총 거리</span>
              <span className="rb-route-stat-value">{Number.isFinite(baseDistance) ? `${Math.round(baseDistance)} NM` : <span className="rb-stat-muted">거리 자료 없음</span>}</span>
            </span>
            {baseEta && (
              <span className="rb-route-stat">
                <span className="rb-route-stat-label"><Clock size={16} />시간</span>
                <span className="rb-route-stat-value">{baseEta.slice(11, 16)} UTC</span>
              </span>
            )}
            <span className={`rb-route-stat rb-card-total-exposure${baseHazards.length === 0 ? ' is-zero' : ''}`}>
              <span className="rb-route-stat-label" title="겹치는 구간은 한 번만 계산합니다"><CloudLightning size={16} />위험기상</span>
              <span className="rb-route-stat-value">{baseTotalHazardExposureNm} NM · {baseHazards.length}건</span>
            </span>
          </span>
          {baseHazards.length > 0 && (
            <span className="rb-card-hazard">
              {baseHazards.map((hazard) => (
                <span key={hazard.sourceId} className={hazardChipClassName(hazard.source)}><HazardIcon source={hazard.source} />{exposureLabel(hazard)}</span>
              ))}
            </span>
          )}
        </button>
      </div>}
      {message && <p className="rb-alternatives-status">{message}</p>}
      <div className="rb-section-label-row">
        <p className="rb-section-label">대안 경로</p>
        <p className="rb-drag-tip">우회안을 선택한 상태에서 지도의 경로 선을 드래그하면 그 위치에 경유점이 추가됩니다</p>
      </div>
      {onToggleAviation && <div className="vfr-layer-toggles">
        <span className="vfr-fix-search-title">지도 레이어</span>
        <LayerToggleChips ariaLabel="대안 경로 항법 레이어" items={buildRouteAviationLayerChips(aviationVisibility, onToggleAviation)} />
      </div>}
      {designs.filter((design) => design.kind === 'alternative').map((design) => {
        const selected = design.id === selectedDesignId
        const distance = design.routeResult?.totalDistanceNm ?? design.routeResult?.distanceNm
        const comparison = comparisonById.get(design.id)
        const hazards = [...(design.routeExposure?.hazards ?? [])].sort((a, b) => exposureNm(b) - exposureNm(a))
        const expanded = expandedHazardIds.has(design.id)
        const visibleHazards = expanded ? hazards : hazards.slice(0, 3)
        const hiddenCount = hazards.length - visibleHazards.length
        const totalHazardExposureNm = Math.round(mergeExposureNm(hazards))
        return (
          <button key={design.id} type="button" aria-selected={selected} className={`rb-alternative-card${selected ? ' is-selected' : ''}`} onClick={() => onSelect(design.id)}>
            {selected && (
              <span
                role="button"
                tabIndex={0}
                aria-label={deleteArmed ? `${design.name} 삭제 확정` : `${design.name} 삭제`}
                className={`rb-card-remove${deleteArmed ? ' rb-danger-btn' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (deleteArmed) { onRemove(); setDeleteArmed(false) } else setDeleteArmed(true)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  event.stopPropagation()
                  if (deleteArmed) { onRemove(); setDeleteArmed(false) } else setDeleteArmed(true)
                }}
              >
                <X size={16} aria-hidden="true" />
              </span>
            )}
            <strong>{design.name}</strong>
            <span className="rb-route-stats">
              <span className="rb-route-stat">
                <span className="rb-route-stat-label"><Route size={16} />총 거리</span>
                <span className="rb-route-stat-value">
                  {Number.isFinite(distance) ? `${Math.round(distance)} NM` : <span className="rb-stat-muted">거리 자료 없음</span>}
                  {comparison?.distanceDeltaNm ? <span className="rb-route-stat-delta"> ({comparison.distanceDeltaNm > 0 ? '+' : ''}{comparison.distanceDeltaNm})</span> : null}
                </span>
              </span>
              <span className="rb-route-stat">
                <span className="rb-route-stat-label"><Clock size={16} />시간</span>
                <span className="rb-route-stat-value">
                  {comparison?.eta ? `${comparison.eta.slice(11, 16)} UTC` : <span className="rb-stat-muted">시간 자료 없음</span>}
                  {comparison?.etaDeltaMinutes ? <span className="rb-route-stat-delta"> ({comparison.etaDeltaMinutes > 0 ? '+' : ''}{comparison.etaDeltaMinutes}분)</span> : null}
                </span>
              </span>
              <span className={`rb-route-stat rb-card-total-exposure${hazards.length === 0 ? ' is-zero' : ''}`}>
                <span className="rb-route-stat-label" title="겹치는 구간은 한 번만 계산합니다"><CloudLightning size={16} />위험기상</span>
                <span className="rb-route-stat-value">{totalHazardExposureNm} NM · {hazards.length}건</span>
              </span>
            </span>
            {comparison?.comparisonUnavailable && <span className="rb-alternatives-status">위험 노출 비교 자료 없음</span>}
            {hazards.length > 0 && (
              <span className="rb-card-hazard">
                {visibleHazards.map((hazard) => <span key={hazard.sourceId} className={hazardChipClassName(hazard.source)}><HazardIcon source={hazard.source} />{exposureLabel(hazard)}</span>)}
              </span>
            )}
            {hazards.length > 3 && (
              <span
                role="button"
                tabIndex={0}
                className="rb-card-more"
                onClick={(event) => { event.stopPropagation(); toggleExpandedHazards(design.id) }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleExpandedHazards(design.id) } }}
              >
                {expanded ? '접기' : `${hiddenCount}건 더 보기`}
              </span>
            )}
          </button>
        )
      })}
      {designs.length < 4 && (
        <button type="button" className="rb-alternative-card rb-add-alternative-card" onClick={onDuplicate}>
          <Plus size={20} aria-hidden="true" />
          우회안 만들기
        </button>
      )}
      {selectedDesign?.kind === 'alternative' && <div className="rb-design-route-string">
        {/* 비행 설정 단계와 같은 입력칸을 쓴다. 같은 일을 두 화면에서 다르게 하면 배울 것이
            두 가지가 된다. 토큰이 확정될 때 반영되므로 적용 버튼은 없다. */}
        <RouteTokenField
          label="항로 문자열 직접 편집"
          placeholder="예: BULTI Y711 MEKIL"
          tokens={draftTokens}
          onChange={(texts) => {
            const text = texts.join(' ')
            setRouteString(text)
            onUpdateDraft?.(text)
            onApplyDraft?.(text)
          }}
        />
        {draftTokenErrors.length > 0 && (
          <ul className="rtf-error-list">
            {draftTokenErrors.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        )}
        {selectedDesign.undoStack?.length > 0 && <div className="rb-design-route-actions">
          <Button appearance="secondary" type="button" onClick={onUndo}>되돌리기</Button>
        </div>}
        {selectedDesign.draftEditor?.error && <p role="alert">{selectedDesign.draftEditor.error}</p>}
      </div>}
      {changedTokens.length > 0 && <p className="rb-route-string-change">지도 수정 반영: {routeString.split(' ').map((token, index) => <span key={`${token}-${index}`} className={changedTokens.includes(token) ? 'is-changed' : ''}>{token} </span>)}</p>}
      {routeError && <p className="rb-alternatives-status" role="alert">{routeError}</p>}
      {layerIds.length > 0 && onToggleMet && <details className="rb-hazard-disclosure"><summary>위험 표시</summary><LayerToggleChips ariaLabel="경로 관련 기상 레이어" items={layerIds.map((id) => ({ key: id, label: metLabel(id), on: !!metVisibility[id], onToggle: () => onToggleMet(id) }))} /></details>}
      <p className="rb-alternatives-note">지도: 경로마다 고유 색 · 선택한 경로는 굵고 진하게, 나머지는 가늘고 흐리게 · 위험 영역은 음영으로 표시</p>
      {!hideStepActions && <div className="rb-step-actions">
        <Button appearance="secondary" type="button" onClick={onBack}>이전 단계</Button>
        <Button appearance="primary" type="button" disabled={!selectedDesignId} onClick={onContinue}>{selectedDesign?.kind === 'alternative' ? '이 우회안으로 고도 비교' : '고도 비교로'}</Button>
      </div>}
    </div>
  )
}
