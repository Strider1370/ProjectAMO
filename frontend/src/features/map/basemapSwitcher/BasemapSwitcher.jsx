import { BASEMAP_OPTIONS } from '../mapConfig.js'

function BasemapSwitcher({
  basemapId,
  isOpen,
  onOpenChange,
  onSwitchBasemap,
}) {
  const current = BASEMAP_OPTIONS.find((option) => option.id === basemapId)

  return (
    <div className="basemap-switcher">
      <button
        className="basemap-switcher-toggle"
        onClick={() => onOpenChange((open) => !open)}
        title="Change base map"
      >
        <img
          className="basemap-switcher-thumb"
          src={current?.thumbnail}
          alt={current?.label}
        />
      </button>
      {isOpen && (
        <ul className="basemap-switcher-menu">
          {BASEMAP_OPTIONS.map((option) => (
            <li key={option.id}>
              <button
                className={`basemap-switcher-item${option.id === basemapId ? ' is-active' : ''}`}
                onClick={() => onSwitchBasemap(option.id)}
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
