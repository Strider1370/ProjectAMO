import { Pencil } from 'lucide-react'
import { AVIATION_WFS_LAYERS } from './aviationWfsLayers.js'
import { AVIATION_TILE_META } from './lib/aviationLayerTiles.js'
import useIsMobile from '../../shared/ui/useIsMobile.js'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'

const GROUPS = [
  { title: '항공로', ids: ['ats-route', 'rnav-route', 'overseas-route'] },
  { title: '항행시설', ids: ['waypoint', 'overseas-waypoint', 'navaid', 'overseas-navaid', 'airport'] },
  { title: '공역', ids: ['fir', 'sector', 'ctr', 'tma', 'restricted', 'prohibited', 'danger'] },
]
// 국내/해외 타일을 하나로 합쳐 보여줌 — 클릭 한 번으로 둘 다 같은 상태로 맞춘다.
const MERGE_GROUPS = {
  airport: ['airport', 'overseas-airport'],
  fir: ['fir', 'overseas-fir'],
}
const LAYER_LABELS = {
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
  'overseas-route': '국제 항공로',
  'overseas-waypoint': '해외 웨이포인트',
  'overseas-navaid': '해외 항행안전시설',
  'overseas-airport': '해외 공항',
  'overseas-fir': '해외 FIR',
}

function AviationTileVisual({ id }) {
  const meta = AVIATION_TILE_META[id]
  if (!meta) return null
  if (meta.kind === 'symbol') {
    return <img className="layer-tile-symbol" src={meta.symbolUrl} alt="" aria-hidden="true" />
  }
  if (meta.kind === 'line') {
    return (
      <span
        className="layer-tile-line"
        style={{ borderTopColor: meta.color, borderTopStyle: meta.dashed ? 'dashed' : 'solid' }}
        aria-hidden="true"
      />
    )
  }
  return (
    <span
      className="layer-tile-square"
      style={{ borderColor: meta.color, background: `${meta.color}1f`, borderStyle: meta.dashed ? 'dashed' : 'solid' }}
      aria-hidden="true"
    />
  )
}

function AviationLayerPanel({ visibility, onToggle, onClose, onClearAll, onOpenCustomArea }) {
  const isMobile = useIsMobile()
  const layerById = new Map(AVIATION_WFS_LAYERS.map((layer) => [layer.id, layer]))
  const activeCount = AVIATION_WFS_LAYERS.filter((layer) => visibility[layer.id]).length

  function handleToggle(id) {
    const group = MERGE_GROUPS[id]
    if (!group) { onToggle(id); return }
    const next = !group.some((gid) => visibility[gid])
    group.forEach((gid) => { if (!!visibility[gid] !== next) onToggle(gid) })
  }

  // 데스크톱·모바일 공통 타일 그리드 (버튼식 토글).
  const tileGroups = (
    <div className="layer-tile-groups">
      {GROUPS.map((group) => (
        <section key={group.title} className="layer-tile-group">
          <div className="layer-tile-group-title">{group.title}</div>
          <div className="layer-tile-grid">
            {group.ids.map((id) => {
              if (!layerById.has(id)) return null
              const mergeIds = MERGE_GROUPS[id]
              const active = mergeIds ? mergeIds.some((gid) => visibility[gid]) : !!visibility[id]
              return (
                <button
                  key={id}
                  type="button"
                  className={`layer-tile${active ? ' is-active' : ''}`}
                  onClick={() => handleToggle(id)}
                  aria-pressed={active}
                >
                  <span className="layer-tile-visual"><AviationTileVisual id={id} /></span>
                  <span className="layer-tile-label">{LAYER_LABELS[id]}</span>
                  {active && <span className="layer-tile-check" aria-hidden="true">✓</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {/* 공역 섹션(최하단) 바로 아래 — 토글 레이어가 아니라 그리기 모드를 여는 독립 액션 섹션. */}
      <section className="layer-tile-group">
        <div className="layer-tile-group-title">임의 구역 설정</div>
        <div className="layer-tile-grid">
          <button
            type="button"
            className="layer-tile"
            onClick={onOpenCustomArea}
          >
            <span className="layer-tile-visual"><Pencil size={22} /></span>
            <span className="layer-tile-label">임의 구역 설정하기</span>
          </button>
        </div>
      </section>
    </div>
  )

  if (isMobile) {
    return (
      <MobileSheet
        open
        eyebrow="항공정보"
        title="항공 레이어"
        onClose={onClose}
        headerExtra={(
          <>
            <button
              type="button"
              className="layer-sheet-clear"
              onClick={onClearAll}
              disabled={activeCount === 0}
            >
              전체 끄기
            </button>
            <span className="layer-drawer-status">{activeCount}개 켜짐</span>
          </>
        )}
      >
        {tileGroups}
      </MobileSheet>
    )
  }

  return (
    <div className="dev-layer-panel layer-drawer" aria-label="항공 레이어 토글">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">항공정보</div>
          <div className="layer-drawer-title">항공 레이어</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="layer-sheet-clear"
            onClick={onClearAll}
            disabled={activeCount === 0}
          >
            전체 끄기
          </button>
          <span className="layer-drawer-status">{activeCount}개 켜짐</span>
        </div>
      </div>
      <div className="layer-drawer-body">
        {tileGroups}
      </div>
    </div>
  )
}

export default AviationLayerPanel
