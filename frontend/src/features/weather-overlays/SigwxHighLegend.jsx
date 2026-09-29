import { highLegendEntries } from './lib/sigwxHighModel.js'
import './SigwxHigh.css'

// A compact key for the HIGH polygons, separate from the bottom model scales.
export default function SigwxHighLegend({ enabled, filter, palette }) {
  if (!enabled) return null
  const rows = [
    { id: 'TURBULENCE', label: '난류' },
    { id: 'AIRFRAME_ICING', label: '착빙' },
  ].filter(row => filter[row.id])
  if (!rows.length) return null
  return <section className="sigwx-high-legend" data-palette={palette.mode}
    style={{ '--sigwx-legend-background': palette.legendBackground || palette.background, '--sigwx-legend-ink': palette.ink }}
    aria-label="SIGWX HIGH 난류·착빙 범례">
    <strong className="sigwx-high-legend__title">SIGWX HIGH</strong>
    {rows.map(row => <div className="sigwx-high-legend__row" key={row.id}>
      <span className="sigwx-high-legend__name">{row.label}</span>
      {highLegendEntries(palette, row.id).map(entry => <span className="sigwx-high-legend__item" key={entry.label}>
        <i aria-hidden="true" style={{ backgroundColor: entry.background }}><b style={{ backgroundColor: entry.color }} /></i>
        <span>{entry.label}</span>
      </span>)}
    </div>)}
    <span className="sigwx-high-legend__note">단일 영역 기준 · 겹친 영역은 색이 섞여 보입니다.</span>
  </section>
}
