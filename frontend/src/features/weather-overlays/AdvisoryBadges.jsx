import { X } from 'lucide-react'

function AdvisoryBadges({
  badgeItems,
  openPanel,
  panelItems,
  hiddenKeys,
  onTogglePanel,
  onClosePanel,
  onToggleVisibility,
}) {
  return (
    <>
      {badgeItems.length > 0 && (
        <div className="advisory-badge-bar" aria-label="Advisory badges">
          {badgeItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`advisory-badge advisory-badge--${item.tone}${openPanel === item.key ? ' is-active' : ''}`}
              onClick={() => onTogglePanel(item.key)}
            >
              <span className="advisory-badge-label">{item.label}</span>
              <span className="advisory-badge-count">{item.count}</span>
            </button>
          ))}
        </div>
      )}

      {openPanel && (
        <section className={`advisory-detail-panel advisory-detail-panel--${openPanel}`} aria-label={`${openPanel} detail panel`}>
          <div className="advisory-detail-header">
            <div className="advisory-detail-title">
              {openPanel === 'sigwxLow' ? 'SIGWX_LOW' : openPanel === 'sigmet' ? 'SIGMET' : 'AIRMET'}
            </div>
            <button type="button" className="advisory-detail-close" onClick={onClosePanel} aria-label="Close advisory detail">
              <X size={16} />
            </button>
          </div>
          <div className="advisory-detail-list">
            {panelItems.length === 0 && <div className="advisory-detail-empty">No active items</div>}
            {openPanel === 'sigwxLow' && panelItems.map((group) => {
              const visible = !hiddenKeys.sigwxLow.includes(group.mapKey)
              return (
                <label key={group.mapKey} className="advisory-detail-item">
                  <input type="checkbox" checked={visible} onChange={() => onToggleVisibility('sigwxLow', group.mapKey)} />
                  <span className="advisory-detail-line" style={{ backgroundColor: group.lineColor || '#7c3aed' }} />
                  <span className="advisory-detail-text">{group.label}</span>
                </label>
              )
            })}
            {openPanel === 'sigmet' && panelItems.map((item) => {
              const visible = !hiddenKeys.sigmet.includes(item.mapKey)
              return (
                <label key={item.mapKey} className="advisory-detail-item">
                  <input type="checkbox" checked={visible} onChange={() => onToggleVisibility('sigmet', item.mapKey)} />
                  <span className="advisory-detail-line advisory-detail-line--sigmet" />
                  <span className="advisory-detail-text">
                    {item.panelLabel}
                    {item.validLabel && <span className="advisory-detail-time">{item.validLabel}</span>}
                  </span>
                </label>
              )
            })}
            {openPanel === 'airmet' && panelItems.map((item) => {
              const visible = !hiddenKeys.airmet.includes(item.mapKey)
              return (
                <label key={item.mapKey} className="advisory-detail-item">
                  <input type="checkbox" checked={visible} onChange={() => onToggleVisibility('airmet', item.mapKey)} />
                  <span className="advisory-detail-line advisory-detail-line--airmet" />
                  <span className="advisory-detail-text">
                    {item.panelLabel}
                    {item.validLabel && <span className="advisory-detail-time">{item.validLabel}</span>}
                  </span>
                </label>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

export default AdvisoryBadges
