import './RouteBriefing.css'
import LayerToggleChips from '../map/LayerToggleChips.jsx'
import { metLabel } from '../map/layerActions.js'
import { hazardMapLayers } from './lib/hazardLayers.js'

function exposureLabel(hazard) {
  const distance = hazard?.horizontalExposure?.intervals?.reduce((total, interval) => total + Math.max(0, interval.endNm - interval.startNm), 0)
  return Number.isFinite(distance) ? `${hazard.label} 수평 교차 ${Math.round(distance)} NM` : `${hazard?.label ?? '위험기상'} 수평 교차`
}

function relatedLayerIds(routeExposure) {
  return hazardMapLayers({ sections: { adverse: { hazards: (routeExposure?.hazards ?? []).map((hazard) => ({ code: hazard.phenomenon, source: hazard.source })) } } })
}

export default function RouteAlternativesStep({ candidates = [], selectedCandidateId, routeExposure, metVisibility = {}, onToggleMet, onSelect, onBack, onContinue }) {
  const status = routeExposure?.trigger
  const message = status === 'none'
    ? '대안 비교 대상 위험기상 노출 없음'
    : status === 'time_unknown'
      ? '수평 노출은 있으나 시간 판단 불가'
      : status === 'unavailable'
        ? '경로 비교 자료를 확인할 수 없습니다'
      : null
  const layerIds = relatedLayerIds(routeExposure)

  return (
    <div className="rb-alternatives">
      {message && <p className="rb-alternatives-status">{message}</p>}
      {routeExposure?.hazards?.map((hazard) => <p key={hazard.sourceId} className="rb-alternatives-reason">{exposureLabel(hazard)}</p>)}
      {layerIds.length > 0 && onToggleMet && <LayerToggleChips ariaLabel="경로 관련 기상 레이어" items={layerIds.map((id) => ({ key: id, label: metLabel(id), on: !!metVisibility[id], onToggle: () => onToggleMet(id) }))} />}
      {status === 'ready' && candidates.length === 1 && <p className="rb-alternatives-status">공표 항로망에서 제한 내 우회 후보를 만들지 못함</p>}
      {candidates.map((candidate, index) => {
        const selected = candidate.id === selectedCandidateId
        const distance = candidate.routeResult?.distanceNm
        return (
          <button key={candidate.id} type="button" className={`rb-alternative-card${selected ? ' is-selected' : ''}`} onClick={() => onSelect(candidate.id)}>
            <strong>{index === 0 ? '기본 경로' : `대안 ${String.fromCharCode(64 + index)}`}</strong>
            <span>{Number.isFinite(distance) ? `${Math.round(distance)} NM` : '거리 자료 없음'}</span>
            {index > 0 && <span>{`기본 경로 대비 ${Math.round(candidate.addedDistanceNm ?? 0) > 0 ? '+' : ''}${Math.round(candidate.addedDistanceNm ?? 0)} NM`}</span>}
            {candidate.routeExposure?.hazards?.slice(0, 2).map((hazard) => <span key={hazard.sourceId}>{exposureLabel(hazard)}</span>)}
            {selected && <span>선택됨</span>}
          </button>
        )
      })}
      <p className="rb-alternatives-note">후보는 거리순 비교이며 안전 또는 추천 순위가 아닙니다.</p>
      <div className="rb-step-actions">
        <button type="button" className="route-check-secondary-button" onClick={onBack}>이전 단계</button>
        <button type="button" className="route-check-search-button" disabled={!selectedCandidateId} onClick={onContinue}>고도 비교로</button>
      </div>
    </div>
  )
}
