function WeatherOverlayPanel({
  layers,
  visibility,
  blinkLightning,
  onToggle,
  onBlinkLightningChange,
  isLayerDisabled,
  getLayerBadge,
}) {
  const groups = [
    { id: 'weather', title: '기상', ids: ['radar', 'satellite', 'lightning'] },
    { id: 'hazards', title: '위험기상', ids: ['sigmet', 'airmet', 'sigwx'] },
    { id: 'traffic', title: '항적', ids: ['adsb'] },
  ]
  const layerLabels = {
    radar: '레이더',
    satellite: '위성',
    lightning: '낙뢰',
    sigmet: 'SIGMET',
    airmet: 'AIRMET',
    sigwx: 'SIGWX',
    adsb: 'ADS-B',
  }
  const activeCount = layers.filter((layer) => visibility[layer.id] && !isLayerDisabled(layer.id)).length
  const layerById = new Map(layers.map((layer) => [layer.id, layer]))
  const activeCountForGroup = (group) => (
    group.ids.filter((id) => visibility[id] && !isLayerDisabled(id)).length
  )

  const body = (
    <div className="layer-drawer-body">
      {groups.map((group) => (
        <details key={group.title} className="layer-drawer-group" open>
          <summary className="layer-drawer-group-title">
            <span>{group.title}</span>
            <span className="layer-drawer-group-count">{activeCountForGroup(group)}개 활성</span>
          </summary>
          <div className="layer-drawer-group-body">
            {group.ids.map((id) => {
              const layer = layerById.get(id)
              if (!layer) return null
              const disabled = isLayerDisabled(layer.id)
              const badge = getLayerBadge(layer.id)
              return (
                <label key={layer.id} className={`layer-toggle-row${disabled ? ' is-disabled' : ''}`}>
                  <input
                    className="layer-toggle-input"
                    type="checkbox"
                    checked={visibility[layer.id]}
                    disabled={disabled}
                    onChange={() => onToggle(layer.id)}
                  />
                  <span className="layer-toggle-switch" aria-hidden="true" />
                  <span className="layer-toggle-swatch" style={{ background: layer.color }} />
                  <span className="layer-toggle-label">{layerLabels[layer.id] || layer.label}</span>
                  {badge != null && <span className="layer-toggle-badge">{badge}</span>}
                </label>
              )
            })}
            {group.id === 'weather' && visibility.lightning && !isLayerDisabled('lightning') && (
              <label className="layer-toggle-row layer-toggle-row--sub">
                <input
                  className="layer-toggle-input"
                  type="checkbox"
                  checked={blinkLightning}
                  onChange={() => onBlinkLightningChange((prev) => !prev)}
                />
                <span className="layer-toggle-switch" aria-hidden="true" />
                <span className="layer-toggle-label">낙뢰 깜빡임</span>
              </label>
            )}
          </div>
        </details>
      ))}
    </div>
  )

  return (
    <div className="dev-layer-panel layer-drawer" aria-label="기상 레이어 토글">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">기상정보</div>
          <div className="layer-drawer-title">기상 레이어</div>
        </div>
        <span className="layer-drawer-status">{activeCount}개 켜짐</span>
      </div>
      {body}
    </div>
  )
}

export default WeatherOverlayPanel
