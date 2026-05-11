import { SIGWX_LEGEND_ITEMS, sigwxAssetUrl } from './lib/sigwxData.js'

function SigwxLegendDialog({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <div className="sigwx-legend-modal" role="dialog" aria-modal="false" aria-label="SIGWX legend">
      <div className="sigwx-legend-header">
        <div className="sigwx-legend-title">SIGWX Legend</div>
        <button type="button" className="sigwx-legend-close" onClick={onClose}>×</button>
      </div>
      <div className="sigwx-legend-table">
        {SIGWX_LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="sigwx-legend-row">
            <span className="sigwx-legend-label">{item.label}</span>
            <span className="sigwx-legend-sign sigwx-legend-sign--asset" aria-hidden="true">
              <img src={sigwxAssetUrl(item.asset)} alt="" />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SigwxLegendDialog
