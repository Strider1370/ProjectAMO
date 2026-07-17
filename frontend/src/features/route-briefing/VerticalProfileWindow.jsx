import VerticalProfileChart from './VerticalProfileChart.jsx'
import { useCrossSectionLayers, CrossSectionToggles } from './crossSectionLayers.jsx'

export default function VerticalProfileWindow({
  profile,
  crossSection,
  isOpen,
  onClose,
  advisories = [],
  selectedCandidateAltitudeFt = null,
  placement = 'bottom',
}) {
  const [layers, toggle] = useCrossSectionLayers()
  if (!profile || !isOpen) return null

  return (
    <div className={`vertical-profile-window-backdrop is-${placement}`} role="presentation">
      <section className={`vertical-profile-window is-${placement}`} role="dialog" aria-modal="false" aria-label={'연직단면도'}>
        <div className="vertical-profile-window-header">
          <div>
            <div className="vertical-profile-window-eyebrow">Vertical Profile</div>
            <div className="vertical-profile-window-title">{'연직단면도'}</div>
          </div>
          <button type="button" className="vertical-profile-window-close" onClick={onClose} aria-label="연직단면도 숨기고 지도 보기">{'지도 보기'}</button>
        </div>
        <CrossSectionToggles layers={layers} onToggle={toggle} />
        <VerticalProfileChart
          profile={profile}
          crossSection={crossSection}
          layers={layers}
          advisories={advisories}
          selectedCandidateAltitudeFt={selectedCandidateAltitudeFt}
        />
      </section>
    </div>
  )
}
