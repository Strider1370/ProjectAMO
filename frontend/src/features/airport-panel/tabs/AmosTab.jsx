import { buildAmosConsoleModel } from '../../../shared/weather/amosViewModel.js'
import { useTimeZone } from '../../../shared/timezone/TimeZoneContext.jsx'

const BEARINGS = [
  ['36', 0],
  ['3', 30],
  ['6', 60],
  ['9', 90],
  ['12', 120],
  ['15', 150],
  ['18', 180],
  ['21', 210],
  ['24', 240],
  ['27', 270],
  ['30', 300],
  ['33', 330],
]

function WindMetricColumn({ group, side }) {
  return (
    <aside className={`ap-amos-console-wind-metrics ap-amos-console-wind-metrics--${side}`} aria-label={`${group.label} 바람`}>
      <div className="ap-amos-console-wind-group-title">{group.label} 바람</div>
      {group.rows.map((row) => (
        <div className="ap-amos-console-metric-band" key={`${group.key}-${row.speedLabel}`}>
          <div className="ap-amos-console-metric">
            <div className="ap-amos-console-label">{row.speedLabel}</div>
            <div className="ap-amos-console-value">{row.speedValue}</div>
          </div>
          <div className="ap-amos-console-metric">
            <div className="ap-amos-console-label">{row.directionLabel}</div>
            <div className="ap-amos-console-value">{row.directionValue}</div>
          </div>
        </div>
      ))}
    </aside>
  )
}

function WindDial({ dial, activeRunwayIndex }) {
  const arcStart = Number.isFinite(dial.arcStartDeg) ? dial.arcStartDeg : 310
  const arcEnd = Number.isFinite(dial.arcEndDeg) ? dial.arcEndDeg : 350
  const dialStyle = {
    '--ap-amos-runway-rotation': `${dial.runwayRotationDeg}deg`,
    '--ap-amos-wind-from': `${dial.windFromDeg ?? 0}deg`,
    '--ap-amos-arc-start': `${arcStart}deg`,
    '--ap-amos-arc-end': `${arcEnd}deg`,
  }

  return (
    <section className="ap-amos-console-dial-panel">
      <div className="ap-amos-console-component-stack">
        <div className={`ap-amos-console-dial${dial.arcWrapsNorth ? ' is-arc-wrapped' : ''}`} style={dialStyle} aria-label="active runway wind component">
          <div className="ap-amos-console-major-ticks" aria-hidden="true" />
          <div className="ap-amos-console-ticks" aria-hidden="true" />
          {BEARINGS.map(([label, angle]) => (
            <span className="ap-amos-console-bearing" style={{ '--angle': `${angle}deg` }} key={label}>
              {label}
            </span>
          ))}
          {Number.isFinite(dial.windFromDeg) ? <div className="ap-amos-console-wind-arrow" aria-hidden="true" /> : null}
          <div className="ap-amos-console-runway-strip" aria-hidden="true">
            <span className={`ap-amos-console-active-end ap-amos-console-active-end--${activeRunwayIndex === 1 ? 'end' : 'start'}`} />
          </div>
        </div>
        <div className="ap-amos-console-components">
          <div className="ap-amos-console-component">
            <span>H/T-WS(kt)</span>
            <strong>{dial.headTailLabel} {dial.headTailValue}</strong>
          </div>
          <div className="ap-amos-console-component">
            <span>CROSS-WS(kt)</span>
            <strong>{dial.crossLabel} {dial.crossValue}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}

function PrioritySummary({ items }) {
  return (
    <section className="ap-amos-priority-summary" aria-label="AMOS 핵심 상태">
      {items.map((item) => (
        <div className={`ap-amos-priority-card ap-amos-priority-card--${item.key}`} key={item.key}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  )
}

export default function AmosBoardTab({ amos, metar, airportMeta }) {
  const { tz } = useTimeZone()
  if (!amos) return <div className="ap-empty">AMOS 데이터 없음</div>

  const model = buildAmosConsoleModel(amos, metar, airportMeta, tz)

  return (
    <div className="ap-amos ap-amos-console-wrap">
      <PrioritySummary items={model.prioritySummary} />

      <section className="ap-amos-console-board" tabIndex={0} aria-label="AMOS layout, 가로 스크롤 가능">
        <header className="ap-amos-console-top">
          {model.runwayLabels.map((label) => (
            <div className={`ap-amos-console-runway-id${label === model.activeRunwayLabel ? ' is-active' : ''}`} key={label}>
              {label === model.activeRunwayLabel ? `${label} IN USE` : label}
            </div>
          ))}
        </header>

        <section className="ap-amos-console-wind-row">
          <WindMetricColumn group={model.windGroups[0]} side="left" />
          <WindDial dial={model.dial} activeRunwayIndex={model.activeRunwayIndex} />
          <WindMetricColumn group={model.windGroups[1]} side="right" />
        </section>

        <section className="ap-amos-console-rvr-row" aria-label="visibility and rvr">
          {model.visibilityRows.map((row) => (
            <div className="ap-amos-console-rvr-cell" key={row.label}>
              <div className="ap-amos-console-label">{row.label}</div>
              <div className="ap-amos-console-rvr-value">
                <span className={row.isRvrGood ? 'is-good' : undefined}>{row.rvrValue}</span>/{row.morValue}
              </div>
            </div>
          ))}
        </section>

        <section className="ap-amos-console-common-grid" aria-label="common weather">
          {model.commonCells.map((cell) => (
            <div className="ap-amos-console-bottom-cell" key={cell.label}>
              <div className="ap-amos-console-label">{cell.label}</div>
              <div className="ap-amos-console-bottom-value">{cell.value}</div>
            </div>
          ))}
        </section>
      </section>
    </div>
  )
}
