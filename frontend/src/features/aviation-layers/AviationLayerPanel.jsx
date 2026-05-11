import { AVIATION_WFS_LAYERS } from './aviationWfsLayers.js'

function AviationLayerPanel({ visibility, onToggle }) {
  const groups = [
    { title: '공역', ids: ['fir', 'sector', 'ctr', 'tma', 'restricted', 'prohibited', 'danger'] },
    { title: '항행시설', ids: ['waypoint', 'navaid', 'airport'] },
    { title: '항공로', ids: ['ats-route', 'rnav-route'] },
  ]
  const layerLabels = {
    fir: '비행정보구역',
    sector: '관제섹터',
    ctr: '관제권',
    tma: '접근관제구역',
    restricted: '제한구역',
    prohibited: '금지구역',
    danger: '위험구역',
    waypoint: '웨이포인트',
    navaid: '항행안전시설',
    airport: '공항',
    'ats-route': 'ATS 항공로',
    'rnav-route': 'RNAV 항공로',
  }
  const layerById = new Map(AVIATION_WFS_LAYERS.map((layer) => [layer.id, layer]))
  const activeCount = AVIATION_WFS_LAYERS.filter((layer) => visibility[layer.id]).length
  const activeCountForGroup = (group) => (
    group.ids.filter((id) => visibility[id]).length
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
              return (
                <label key={layer.id} className="layer-toggle-row">
                  <input
                    className="layer-toggle-input"
                    type="checkbox"
                    checked={visibility[layer.id]}
                    onChange={() => onToggle(layer.id)}
                  />
                  <span className="layer-toggle-switch" aria-hidden="true" />
                  <span className="layer-toggle-swatch" style={{ background: layer.color }} />
                  <span className="layer-toggle-label">{layerLabels[layer.id] || layer.nameEn}</span>
                </label>
              )
            })}
          </div>
        </details>
      ))}
    </div>
  )

  return (
    <div className="dev-layer-panel layer-drawer" aria-label="항공 레이어 토글">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">항공정보</div>
          <div className="layer-drawer-title">항공 레이어</div>
        </div>
        <span className="layer-drawer-status">{activeCount}개 켜짐</span>
      </div>
      {body}
    </div>
  )
}

export default AviationLayerPanel
