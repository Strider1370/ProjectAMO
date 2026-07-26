import { BASEMAP_OPTIONS } from '../mapConfig.js'

function BasemapSwitcher({
  basemapId,
  isOpen,
  onOpenChange,
  onSwitchBasemap,
  atRightEdge = false,
}) {
  const current = BASEMAP_OPTIONS.find((option) => option.id === basemapId)

  return (
    <div className={`basemap-switcher${atRightEdge ? ' is-right-edge' : ''}`}>
      <button
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
      </button>
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
