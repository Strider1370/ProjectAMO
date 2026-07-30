import { Layers, Cloud, Radio } from 'lucide-react'

// Mobile 지도 task: on-map layer entry points (the sidebar that normally opens
// these is hidden on mobile).
export default function MobileMapOverlay({ activePanel, onToggle, aviationCount = 0, metCount = 0, trafficCount = 0 }) {
  return (
    <>
      <div className="mobile-map-layer-btns">
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'aviation' ? ' is-active' : ''}`}
          onClick={() => onToggle('aviation')}
          aria-label="항공정보 레이어"
        >
          <Layers size={20} strokeWidth={2} />
          <span>항공</span>
          {aviationCount > 0 && <span className="mobile-map-layer-count">{aviationCount}</span>}
        </button>
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'met' ? ' is-active' : ''}`}
          onClick={() => onToggle('met')}
          aria-label="기상정보 레이어"
        >
          <Cloud size={20} strokeWidth={2} />
          <span>기상</span>
          {metCount > 0 && <span className="mobile-map-layer-count">{metCount}</span>}
        </button>
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'traffic' ? ' is-active' : ''}`}
          onClick={() => onToggle('traffic')}
          aria-label="항적"
        >
          <Radio size={20} strokeWidth={2} />
          <span>항적</span>
          {trafficCount > 0 && <span className="mobile-map-layer-count">{trafficCount}</span>}
        </button>
      </div>
    </>
  )
}
