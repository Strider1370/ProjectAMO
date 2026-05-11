function WeatherOverlayPanel({
  layers,
  visibility,
  blinkLightning,
  onToggle,
  onBlinkLightningChange,
  isLayerDisabled,
  getLayerBadge,
}) {
  return (
    <div className="dev-layer-panel" aria-label="MET layer toggles">
      <div className="dev-layer-panel-title">MET</div>
      {layers.map((layer) => {
        const disabled = isLayerDisabled(layer.id)
        const badge = getLayerBadge(layer.id)
        return (
          <label key={layer.id} className={`dev-layer-toggle${disabled ? ' is-disabled' : ''}`}>
            <input
              type="checkbox"
              checked={visibility[layer.id]}
              disabled={disabled}
              onChange={() => onToggle(layer.id)}
            />
            <span className="dev-layer-swatch" style={{ background: layer.color }} />
            <span>{layer.label}</span>
            {badge != null && <span className="dev-layer-count">{badge}</span>}
          </label>
        )
      })}
      {visibility.lightning && !isLayerDisabled('lightning') && (
        <label className="dev-layer-subtoggle">
          <input
            type="checkbox"
            checked={blinkLightning}
            onChange={() => onBlinkLightningChange((prev) => !prev)}
          />
          <span>Blink</span>
        </label>
      )}
    </div>
  )
}

export default WeatherOverlayPanel
