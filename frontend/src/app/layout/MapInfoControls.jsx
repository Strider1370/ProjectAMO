import { Layers, Cloud, ChartSpline, FileText } from 'lucide-react'

// 지도 위 정보·단면도 진입점. 데스크톱과 모바일에서 같은 순서로 표시한다.
// 이 버튼들이 여는 레이어 패널은 버튼 아래에 붙는다. 그 밖의 패널(비행 전 브리핑·내 지도·NOTAM·ADS-B 등)은
// 지도 왼쪽 위를 차지하므로, 열려 있는 동안 버튼을 패널 아래 층으로 내려 패널 제목을 가리지 않게 한다.
const OWN_PANELS = ['aviation', 'met', 'map-profile']

// 지도형 브리핑 중(mapBriefing)에는 연직단면도 버튼 대신 브리핑 버튼(브리핑 패널 켜기/끄기)을 둔다.
// 단면도는 지도 아래 독에 이미 있고, 브리핑 패널은 이 버튼들 아래에 열린다.
// metNewCount: 위험 막대를 눌러 새로 켠 기상 레이어 수 — 기상정보를 열어 볼 때까지 개수 배지를 강조한다.
export default function MapInfoControls({ activePanel, onToggle, aviationCount = 0, metCount = 0, metNewCount = 0, mobile = false, mapBriefing = false }) {
  const ownPanels = mapBriefing ? [...OWN_PANELS, 'route-check'] : OWN_PANELS
  return (
    <>
      <div className={`mobile-map-layer-btns${activePanel && !ownPanels.includes(activePanel) ? ' is-below-panel' : ''}`}>
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
          {metCount > 0 && (
            <span className={`mobile-map-layer-count${metNewCount > 0 ? ' is-new' : ''}`} title={metNewCount > 0 ? `브리핑에서 새로 켠 레이어 ${metNewCount}개` : undefined}>{metCount}</span>
          )}
        </button>
        {mapBriefing ? (
          <button
            type="button"
            className={`mobile-map-layer-btn${activePanel === 'route-check' ? ' is-active' : ''}`}
            onClick={() => onToggle('route-check')}
            aria-label="브리핑 패널"
            aria-pressed={activePanel === 'route-check'}
          >
            <FileText size={20} strokeWidth={2} />
            <span>브리핑</span>
          </button>
        ) : (
          <button
            type="button"
            className={`mobile-map-layer-btn${activePanel === 'map-profile' ? ' is-active' : ''}`}
            onClick={() => onToggle('map-profile')}
            aria-label="연직단면도"
          >
            <ChartSpline size={20} strokeWidth={2} />
            <span>연직단면도</span>
          </button>
        )}
      </div>
    </>
  )
}
