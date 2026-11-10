import { BASEMAP_OPTIONS } from '../mapConfig.js'

function BasemapSwitcher({
  basemapId,
  isOpen,
  onOpenChange,
  onSwitchBasemap,
  atRightEdge = false,
  pill = false,
}) {
  const current = BASEMAP_OPTIONS.find((option) => option.id === basemapId)

  return (
    <div className={`basemap-switcher${atRightEdge ? ' is-right-edge' : ''}${pill ? ' is-pill' : ''}`}>
      {pill ? (
        // 데스크톱 오른쪽 위 도구 알약. 지금 바탕 지도를 동그랗게 보여 주고, 메뉴는 아래로 펼친다.
        <button type="button" className={`map-tool-pill basemap-switcher-pill${isOpen ? ' is-active' : ''}`}
          onClick={() => onOpenChange((open) => !open)}
          aria-label={`${current?.label || '기본'} 지도 선택`} aria-expanded={isOpen} aria-controls="basemap-options">
          <img className="map-tool-pill__thumb" src={current?.thumbnail} alt="" />
          <span>지도</span>
        </button>
      ) : <button
        type="button"
        className="basemap-switcher-toggle"
        onClick={() => onOpenChange((open) => !open)}
        title="Change base map"
        aria-label={`${current?.label || '기본'} 지도 선택`}
        aria-expanded={isOpen}
        aria-controls="basemap-options"
      >
        <img
          className="basemap-switcher-thumb"
          src={current?.thumbnail}
          alt={current?.label}
        />
      </button>}
      {isOpen && (
        <ul id="basemap-options" className="basemap-switcher-menu" role="menu" aria-label="지도 선택">
          {BASEMAP_OPTIONS.map((option) => (
            <li key={option.id}>
              <button
                className={`basemap-switcher-item${option.id === basemapId ? ' is-active' : ''}`}
                onClick={() => onSwitchBasemap(option.id)}
                role="menuitemradio"
                aria-checked={option.id === basemapId}
              >
                <img
                  className="basemap-switcher-thumb"
                  src={option.thumbnail}
                  alt={option.label}
                />
                <span>{option.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default BasemapSwitcher
