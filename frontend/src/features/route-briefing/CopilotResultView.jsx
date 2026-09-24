import { useState } from 'react'
// This entry can open before the lazily loaded route editor owns these styles.
import './RouteBriefing.css'
import BriefingView from './BriefingView.jsx'
import VerticalProfileWindow from './VerticalProfileWindow.jsx'
import AltitudeComparisonCard from '../copilot/AltitudeComparisonCard.jsx'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { formatBriefingTime } from './lib/briefingTime.js'

export default function CopilotResultView({ bundle, onClose, onPreviewEdit, onApplyEdit }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [edit, setEdit] = useState(null)
  const { tz } = useTimeZone()
  async function prepareEdit() {
    setEdit({ stage: 'loading' })
    try { setEdit({ stage: 'confirm', prepared: await onPreviewEdit(bundle) }) }
    catch (error) { setEdit({ stage: 'error', error: error.code ?? error.message }) }
  }
  function applyEdit() {
    try { onApplyEdit(edit.prepared) }
    catch (error) { setEdit({ stage: 'error', error: error.code ?? error.message }) }
  }
  const notice = <section className="bv-frozen-notice" aria-label="챗봇 보관 결과" data-result-ref={bundle.reference.briefingRef}
    data-result-hash={bundle.resultHash}>
    <strong>답변에 사용한 보관 결과 · 읽기 전용</strong>
    <p>자료 기준 {formatBriefingTime(bundle.reference.effectiveNow, tz, { withDate: true })}. 최신 조회가 아닙니다.</p>
    {bundle.savedRouteOrigin && <p>저장 입력 출처: {bundle.savedRouteOrigin.savedRoute.name} · #{bundle.savedRouteOrigin.savedRoute.id}.
      {' '}이 결과는 질문 당시 수집 자료로 새로 계산했으며, 경로를 저장했던 당시의 기상 결과가 아닙니다.</p>}
    {bundle.reference.modelTimeCoverage?.selectedKimRun && <p>KIM 유효 {formatBriefingTime(bundle.reference.modelTimeCoverage.selectedKimRun.validTime, tz, { withDate: true })}
      {' · '}run {bundle.reference.modelTimeCoverage.selectedKimRun.tmfc}</p>}
    {bundle.reference.modelTimeCoverage?.status === 'outside_available_frames' && <p>요청 시각이 보관된 KIM 예보시각 범위를 벗어납니다. 요청 시각의 예보로 해석하지 마세요.</p>}
    <p>기존 경로·초안은 변경하지 않았습니다. 지도 배경의 다른 기상 레이어는 이 결과와 시각이 다를 수 있습니다.</p>
    {bundle.plan?.origin === 'server-planner' && onPreviewEdit && onApplyEdit && <>
      <p>챗봇에서 계산한 경로 · {bundle.plan.flight.cruiseAltitudeFt.toLocaleString()} ft · TAS {bundle.plan.flight.tasKt} kt.</p>
      <button type="button" disabled={edit?.stage === 'loading'} onClick={() => void prepareEdit()}>이 경로를 편집기로 가져오기</button>
      {edit?.stage === 'confirm' && <section aria-label="계산 경로 가져오기 확인">
        <p>{edit.prepared.replacesExisting ? '기존 초안·적용·대체 경로를 지우고 이 경로로 바꿉니다.' : '계산된 경로와 비행 조건을 편집기에 넣습니다.'} 저장된 경로 목록은 변경하지 않습니다.</p>
        <p>출발 {formatBriefingTime(bundle.request.etd, tz, { withDate: true })} · 도착 {formatBriefingTime(bundle.request.eta, tz, { withDate: true })}.
          {' '}보관된 기상 평가는 새 편집 화면으로 옮기지 않으며, 수정 후 브리핑을 다시 요청해야 합니다.</p>
        <button type="button" onClick={applyEdit}>확인하고 경로 가져오기</button>
        <button type="button" onClick={() => setEdit(null)}>가져오기 취소</button>
      </section>}
      {edit?.stage === 'error' && <p role="alert">경로를 변경하지 못했어요. ({edit.error}) 항공로 자료와 현재 편집 상태를 확인한 뒤 다시 시도해 주세요.</p>}
    </>}
    {bundle.issues?.length > 0 && <p>미확인·누락 {bundle.issues.length}개. 경보 없음이나 안전 확인이 아닙니다.</p>}
    {!bundle.verticalProfile && <p>보관된 연직단면 프로파일이 없습니다. 새 자료로 대체하지 않습니다.</p>}
    {bundle.altitudeComparison && <AltitudeComparisonCard result={{ data: bundle.altitudeComparison }} />}
  </section>
  return <>
    <BriefingView briefing={bundle.briefing} verticalProfile={bundle.verticalProfile} crossSection={bundle.crossSection}
      advisories={bundle.advisories} nwpTimeSelection={bundle.request.nwpTimeSelection} frozenNotice={notice}
      onClose={onClose} onOpenProfile={bundle.verticalProfile ? () => setProfileOpen(true) : undefined} />
    <VerticalProfileWindow profile={bundle.verticalProfile} crossSection={bundle.crossSection} advisories={bundle.advisories}
      nwpTimeSelection={bundle.request.nwpTimeSelection} isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
  </>
}
