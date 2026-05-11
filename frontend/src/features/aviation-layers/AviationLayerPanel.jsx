import { AVIATION_WFS_LAYERS } from './aviationWfsLayers.js'

function AviationLayerPanel({ visibility, onToggle }) {
  return (
    <div className="dev-layer-panel" aria-label="Aviation layer toggles">
      <div className="dev-layer-panel-title">Aviation</div>
      {AVIATION_WFS_LAYERS.map((layer) => (
        <label key={layer.id} className="dev-layer-toggle">
          <input
            type="checkbox"
            checked={visibility[layer.id]}
            onChange={() => onToggle(layer.id)}
          />
          <span className="dev-layer-swatch" style={{ background: layer.color }} />
          <span>{layer.nameEn}</span>
        </label>
      ))}
    </div>
  )
}

export default AviationLayerPanel
