import VerticalProfileChart from './VerticalProfileChart.jsx'
import { useCrossSectionLayers, CrossSectionToggles, ForecastHourNav } from './crossSectionLayers.jsx'
import './RouteBriefing.css'

function formatFlightLevel(value) {
  return value >= 10000 ? `FL${Math.round(value / 100)}` : `${Math.round(value).toLocaleString()} ft`
}

export default function VerticalProfileWindow({
  profile,
  referenceAltitudeFt = null,
  crossSection,
  isOpen,
  onClose,
  advisories = [],
  selectedCandidateAltitudeFt = null,
  candidateAltitudes = [],
  onSelectCandidateAltitude,
  onSelectForecastHour,
  crossSectionHourLoading = false,
  nwpTimeSelection = null,
  onSetWaypointNwpOffset,
  statusMessage = null,
  allowMissingTerrain = false,
  placement = 'bottom',
}) {
  const [layers, toggle] = useCrossSectionLayers()
  if (!profile || !isOpen) return null
  const selectableAltitudes = [...new Set(candidateAltitudes.filter(Number.isFinite))].sort((a, b) => a - b)
  const selectedAltitudeIndex = selectableAltitudes.indexOf(selectedCandidateAltitudeFt)
  const previousAltitude = selectableAltitudes[selectedAltitudeIndex - 1]
  const nextAltitude = selectableAltitudes[selectedAltitudeIndex + 1]
  const forecastHourNav = <ForecastHourNav crossSection={crossSection} onSelect={onSelectForecastHour} loading={crossSectionHourLoading} />
  const altitudeNav = onSelectCandidateAltitude && selectableAltitudes.length > 1 && <span className="vertical-profile-altitude-nav" aria-label="비교 고도 선택"><button type="button" onClick={() => onSelectCandidateAltitude(previousAltitude)} disabled={!Number.isFinite(previousAltitude)} aria-label="이전 비교 고도">‹</button><strong>{formatFlightLevel(selectedCandidateAltitudeFt)}</strong><button type="button" onClick={() => onSelectCandidateAltitude(nextAltitude)} disabled={!Number.isFinite(nextAltitude)} aria-label="다음 비교 고도">›</button></span>

  return (
    <div className={`vertical-profile-window-backdrop is-${placement}`} role="presentation">
      <section className={`vertical-profile-window is-${placement}`} role="dialog" aria-modal="false" aria-label={'연직단면도'}>
        {placement === 'mobile-full' ? (
          <div className="vertical-profile-mobile-toolbar">
            <div className="vertical-profile-mobile-toolbar-main">
              <span className="vertical-profile-mobile-title">연직단면도</span>
              <CrossSectionToggles layers={layers} onToggle={toggle} compact inline />
              {altitudeNav}
              <button type="button" className="vertical-profile-mobile-close" onClick={onClose} aria-label="닫기">×</button>
            </div>
          </div>
        ) : <>
          <div className="vertical-profile-window-header">
            <div>
              <div className="vertical-profile-window-eyebrow">Vertical Profile</div>
              <div className="vertical-profile-window-title">{'연직단면도'}</div>
            </div>
            {forecastHourNav}
            <button type="button" className="vertical-profile-window-close" onClick={onClose} aria-label="연직단면도 숨기고 지도 보기">{'지도 보기'}</button>
          </div>
          <CrossSectionToggles layers={layers} onToggle={toggle} legend />
        </>}
        {statusMessage && <p className="vertical-profile-window-status" role="status">{statusMessage}</p>}
        <VerticalProfileChart
          profile={profile}
          referenceAltitudeFt={referenceAltitudeFt}
          crossSection={crossSection}
          layers={layers}
          legendInToolbar={placement !== 'mobile-full'}
          advisories={advisories}
          selectedCandidateAltitudeFt={selectedCandidateAltitudeFt}
          candidateAltitudes={candidateAltitudes}
          onSelectCandidateAltitude={placement === 'mobile-full' ? undefined : onSelectCandidateAltitude}
          enableDragScroll={placement === 'mobile-full'}
          fitHeight={placement === 'mobile-full'}
          metaTrailing={placement === 'mobile-full' ? forecastHourNav : null}
          nwpTimeSelection={nwpTimeSelection}
          onSetWaypointNwpOffset={onSetWaypointNwpOffset}
          allowMissingTerrain={allowMissingTerrain}
        />
      </section>
    </div>
  )
}
