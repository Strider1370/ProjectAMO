import { entriesLeftToRight } from './lib/legendOrder.js'
import './MapLegend.css'

// 지도 범례 한 장의 공통 틀: 제목("이름 · 단위") → 색띠 → 라벨 한 줄 → 설명 한 줄.
// 설명이 길면 note에는 한 줄만 두고 나머지는 hint(마우스를 올리면 보이는 설명)로 보낸다.
// labels: 'band' = 칸 가운데에 등급·분류 이름, 'edge' = 칸 왼쪽 경계에 그 칸이 시작하는 값.
// endLabel은 edge일 때 오른쪽 끝 경계값이다. opacity는 지도에서 그 레이어를 칠하는 불투명도(mapLayerOpacity.js)로,
// 범례 칸도 같은 비율로 비쳐 지도에서 보이는 색과 맞춘다.
// unit은 자료 시각 상자에서 제목 대신 색띠 왼쪽에 쓰는 짧은 단위·이름이다(상자 머리에 레이어 이름이 이미 있다).
export function LegendScale({ title, unit = null, entries = [], labels = 'band', endLabel = null, reverse = false, opacity = 1, note = null, hint = null, ariaLabel = null, children = null }) {
  const cells = entriesLeftToRight(entries, reverse)
  const count = cells.length
  // 라벨이 이미 듬성듬성 붙은 자료(KIM 강수 등)는 모두 보이고, 칸마다 라벨이 있으면 7개 안팎으로 솎는다.
  const step = cells.every(cell => cell.label) ? Math.max(1, Math.ceil(count / 7)) : 1
  const shown = (cell, index) => Boolean(cell.label) && index % step === 0
  return (
    <section className="hlegend" aria-label={ariaLabel ?? (typeof title === 'string' ? `${title} 범례` : undefined)} title={hint ?? undefined}>
      {unit && <span className="hlegend-unit">{unit}</span>}
      <div className="hlegend-title">{title}</div>
      {count > 0 && <>
        <div className="hlegend-bar" style={{ '--cells': count, '--cell-opacity': opacity }} aria-hidden="true">
          {cells.map((cell, index) => (
            <span key={index} className="hlegend-cell" style={{ backgroundColor: cell.background || cell.color }}>
              {cell.background && <i style={{ backgroundColor: cell.color }} />}
            </span>
          ))}
        </div>
        {labels === 'edge' ? (
          <div className="hlegend-labels is-edge" aria-hidden="true">
            {cells.map((cell, index) => shown(cell, index) && (
              <span key={index} className={`hlegend-label${index === 0 ? ' is-start' : ''}`} style={{ left: `${(index / count) * 100}%` }}>{cell.label}</span>
            ))}
            {endLabel && <span className="hlegend-label is-end" style={{ left: '100%' }}>{endLabel}</span>}
          </div>
        ) : (
          <div className="hlegend-labels" style={{ '--cells': count }} aria-hidden="true">
            {cells.map((cell, index) => <span key={index} className="hlegend-label">{shown(cell, index) ? cell.label : ''}</span>)}
          </div>
        )}
      </>}
      {children}
      {note && <div className="hlegend-note">{note}</div>}
    </section>
  )
}

// 색띠로 나타낼 수 없는 범례(무늬·선·겹친 영역): 작은 견본 + 이름을 한 줄에 늘어놓는다.
// item.swatch로 견본을 직접 넘기거나 item.style로 견본 칸의 모양을 정한다.
export function LegendKeys({ title, unit = null, items = [], note = null, hint = null, ariaLabel = null, children = null }) {
  return (
    <section className="hlegend" aria-label={ariaLabel ?? (typeof title === 'string' ? `${title} 범례` : undefined)} title={hint ?? undefined}>
      {unit && <span className="hlegend-unit">{unit}</span>}
      <div className="hlegend-title">{title}</div>
      <LegendKeyRow items={items} />
      {children}
      {note && <div className="hlegend-note">{note}</div>}
    </section>
  )
}

export function LegendKeyRow({ name = null, items = [] }) {
  return (
    <div className="hlegend-keys">
      {name && <span className="hlegend-keys__name">{name}</span>}
      {items.map(item => (
        <span key={item.key ?? item.label} className={`hlegend-key${item.separated ? ' is-separated' : ''}`}>
          {item.swatch ?? <i className={`hlegend-swatch${item.line ? ' is-line' : ''}`} style={item.style} aria-hidden="true" />}
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  )
}
