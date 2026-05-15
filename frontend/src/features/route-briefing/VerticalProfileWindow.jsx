import VerticalProfileChart from './VerticalProfileChart.jsx'

export default function VerticalProfileWindow({ profile, isOpen, onClose }) {
  if (!profile || !isOpen) return null

  return (
    <div className="vertical-profile-window-backdrop" role="presentation">
      <section className="vertical-profile-window" role="dialog" aria-modal="true" aria-label={'\uc5f0\uc9c1\ub2e8\uba74\ub3c4'}>
        <div className="vertical-profile-window-header">
          <div>
            <div className="vertical-profile-window-eyebrow">Vertical Profile</div>
            <div className="vertical-profile-window-title">{'\uc5f0\uc9c1\ub2e8\uba74\ub3c4'}</div>
          </div>
          <button type="button" className="vertical-profile-window-close" onClick={onClose}>
            {'\ub2eb\uae30'}
          </button>
        </div>
        <VerticalProfileChart profile={profile} />
      </section>
    </div>
  )
}
