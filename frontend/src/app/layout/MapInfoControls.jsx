import { Layers, Cloud, ChartSpline } from 'lucide-react'

// 지도 위 정보·단면도 진입점. 데스크톱과 모바일에서 같은 순서로 표시한다.
export default function MapInfoControls({ activePanel, onToggle, aviationCount = 0, metCount = 0, mobile = false }) {
  return (
    <>
      <div className="mobile-map-layer-btns">
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'aviation' ? ' is-active' : ''}`}
          onClick={() => onToggle('aviation')}
          aria-label={mobile ? '항공정보 레이어' : '항공정보'}
        >
          <Layers size={20} strokeWidth={2} />
          <span>{mobile ? '항공정보' : '항공'}</span>
          {aviationCount > 0 && <span className="mobile-map-layer-count">{aviationCount}</span>}
        </button>
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'met' ? ' is-active' : ''}`}
          onClick={() => onToggle('met')}
          aria-label={mobile ? '기상정보 레이어' : '기상정보'}
        >
          <Cloud size={20} strokeWidth={2} />
          <span>{mobile ? '기상정보' : '기상'}</span>
          {metCount > 0 && <span className="mobile-map-layer-count">{metCount}</span>}
        </button>
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'map-profile' ? ' is-active' : ''}`}
          onClick={() => onToggle('map-profile')}
          aria-label="연직단면도"
        >
          <ChartSpline size={20} strokeWidth={2} />
          <span>{mobile ? '연직단면도' : '단면도'}</span>
        </button>
      </div>
    </>
  )
}
