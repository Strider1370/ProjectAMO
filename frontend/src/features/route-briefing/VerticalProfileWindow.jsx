import VerticalProfileChart from './VerticalProfileChart.jsx'
import { useCrossSectionLayers, CrossSectionToggles } from './crossSectionLayers.jsx'
import { formatNwpTimeTick } from '../weather-overlays/NwpSliderBarModel.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

function formatFlightLevel(value) {
  return value >= 10000 ? `FL${Math.round(value / 100)}` : `${Math.round(value).toLocaleString()} ft`
}

export default function VerticalProfileWindow({
  profile,
  crossSection,
  isOpen,
  onClose,
  advisories = [],
  selectedCandidateAltitudeFt = null,
  candidateAltitudes = [],
  onSelectCandidateAltitude,
  onSelectForecastHour,
  crossSectionHourLoading = false,
  placement = 'bottom',
}) {
  const [layers, toggle] = useCrossSectionLayers()
  const { tz } = useTimeZone()
  if (!profile || !isOpen) return null
  const availableTimes = crossSection?.availableTimes ?? []
  const currentHf = crossSection?.run?.hf
  const timeIndex = availableTimes.findIndex((t) => Number(t.hf) === Number(currentHf))
  const previousTime = timeIndex > 0 ? availableTimes[timeIndex - 1] : null
  const nextTime = timeIndex >= 0 && timeIndex < availableTimes.length - 1 ? availableTimes[timeIndex + 1] : null
  const currentTimeLabel = timeIndex >= 0
    ? formatNwpTimeTick(availableTimes[timeIndex], null, tz)
    : (Number.isFinite(currentHf) ? `+${currentHf}h` : null)
  const terrainMaxFt = Math.max(0, ...(profile.terrain?.values ?? []).map((value) => Number(value.elevationM) * 3.28084).filter(Number.isFinite))
  const tod = profile.flightPlan?.profile?.tod
  const todText = tod && Number.isFinite(tod.distanceFromEnrouteEndNm)
    ? `TOD: ${tod.referenceFixLabel ?? 'ENROUTE'} ${Math.abs(tod.distanceFromEnrouteEndNm).toFixed(1)}NM ${tod.distanceFromEnrouteEndNm >= 0 ? '전' : '후'}`
    : null
  const selectableAltitudes = [...new Set(candidateAltitudes.filter(Number.isFinite))].sort((a, b) => a - b)
  const selectedAltitudeIndex = selectableAltitudes.indexOf(selectedCandidateAltitudeFt)
  const previousAltitude = selectableAltitudes[selectedAltitudeIndex - 1]
  const nextAltitude = selectableAltitudes[selectedAltitudeIndex + 1]
  const model = profile.flightPlan?.profile?.model
  const forecastHourNav = onSelectForecastHour && availableTimes.length > 1 ? (
    <span className="vertical-profile-hour-nav" aria-label="예보시간 선택">
      <button type="button" onClick={() => onSelectForecastHour(previousTime.hf)} disabled={!previousTime || crossSectionHourLoading} aria-label="이전 예보시간">‹</button>
      <strong>{crossSectionHourLoading ? '…' : currentTimeLabel}</strong>
      <button type="button" onClick={() => onSelectForecastHour(nextTime.hf)} disabled={!nextTime || crossSectionHourLoading} aria-label="다음 예보시간">›</button>
    </span>
  ) : null
  const mobileToolbar = placement === 'mobile-full' ? <>
    <span className="vertical-profile-toolbar-group">
      <span className="vertical-profile-toolbar-terrain">지형 {Math.round(terrainMaxFt).toLocaleString()} ft</span>
      {todText && <span className="vertical-profile-tod-summary">{todText}</span>}
      {Number.isFinite(model?.climbGradientFtPerNm) && Number.isFinite(model?.descentGradientFtPerNm) && <details className="vertical-profile-model-info"><summary aria-label="고도 프로파일 계산 기준">i</summary><div><strong>계산 기준</strong><span>{`상승 ${model.climbGradientFtPerNm} ft/NM, 하강 ${model.descentGradientFtPerNm} ft/NM 기준의 단순 선형 프로파일입니다.`}</span><span>SID 상한고도와 STAR/IAP 하한고도를 반영한 기술실증용 계획선입니다.</span></div></details>}
    </span>
    <span className="vertical-profile-toolbar-actions">
      {forecastHourNav}
      {onSelectCandidateAltitude && selectableAltitudes.length > 1 && <span className="vertical-profile-altitude-nav" aria-label="비교 고도 선택"><button type="button" onClick={() => onSelectCandidateAltitude(previousAltitude)} disabled={!Number.isFinite(previousAltitude)} aria-label="이전 비교 고도">‹</button><strong>{formatFlightLevel(selectedCandidateAltitudeFt)}</strong><button type="button" onClick={() => onSelectCandidateAltitude(nextAltitude)} disabled={!Number.isFinite(nextAltitude)} aria-label="다음 비교 고도">›</button></span>}
      <button type="button" className="vertical-profile-inline-close" onClick={onClose} aria-label="연직단면도 숨기고 지도 보기">지도 보기</button>
    </span>
  </> : null

  return (
    <div className={`vertical-profile-window-backdrop is-${placement}`} role="presentation">
      <section className={`vertical-profile-window is-${placement}`} role="dialog" aria-modal="false" aria-label={'연직단면도'}>
        {placement !== 'mobile-full' && <div className="vertical-profile-window-header">
          <div>
            <div className="vertical-profile-window-eyebrow">Vertical Profile</div>
            <div className="vertical-profile-window-title">{'연직단면도'}</div>
          </div>
          {forecastHourNav}
          <button type="button" className="vertical-profile-window-close" onClick={onClose} aria-label="연직단면도 숨기고 지도 보기">{'지도 보기'}</button>
        </div>}
        <CrossSectionToggles layers={layers} onToggle={toggle} trailing={mobileToolbar} />
        <VerticalProfileChart
          profile={profile}
          crossSection={crossSection}
          layers={layers}
          advisories={advisories}
          selectedCandidateAltitudeFt={selectedCandidateAltitudeFt}
          candidateAltitudes={candidateAltitudes}
          onSelectCandidateAltitude={onSelectCandidateAltitude}
          enableDragScroll={placement === 'mobile-full'}
          hideMeta={placement === 'mobile-full'}
        />
      </section>
    </div>
  )
}
