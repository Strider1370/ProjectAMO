import { Layers, Cloud, ChartSpline } from 'lucide-react'

// 지도 위 정보·단면도 진입점. 데스크톱과 모바일에서 같은 순서로 표시한다.
// 이 버튼들이 여는 레이어 패널은 버튼 아래에 붙는다. 그 밖의 패널(비행 전 브리핑·내 지도·NOTAM·ADS-B 등)은
// 지도 왼쪽 위를 차지하므로, 열려 있는 동안 버튼을 패널 아래 층으로 내려 패널 제목을 가리지 않게 한다.
const OWN_PANELS = ['aviation', 'met', 'map-profile']

export default function MapInfoControls({ activePanel, onToggle, aviationCount = 0, metCount = 0, mobile = false }) {
  return (
    <>
      <div className={`mobile-map-layer-btns${activePanel && !OWN_PANELS.includes(activePanel) ? ' is-below-panel' : ''}`}>
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'aviation' ? ' is-active' : ''}`}
          onClick={() => onToggle('aviation')}
          aria-label={mobile ? '항공정보 레이어' : '항공정보'}
        >
          <Layers size={20} strokeWidth={2} />
          <span>항공정보</span>
          {aviationCount > 0 && <span className="mobile-map-layer-count">{aviationCount}</span>}
        </button>
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'met' ? ' is-active' : ''}`}
          onClick={() => onToggle('met')}
          aria-label={mobile ? '기상정보 레이어' : '기상정보'}
        >
          <Cloud size={20} strokeWidth={2} />
          <span>기상정보</span>
          {metCount > 0 && <span className="mobile-map-layer-count">{metCount}</span>}
        </button>
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'map-profile' ? ' is-active' : ''}`}
          onClick={() => onToggle('map-profile')}
          aria-label="연직단면도"
        >
          <ChartSpline size={20} strokeWidth={2} />
          <span>연직단면도</span>
        </button>
      </div>
    </>
  )
}
