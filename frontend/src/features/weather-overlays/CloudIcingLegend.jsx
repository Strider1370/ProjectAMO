import { BASIC_ISOTHERMS, DETAIL_ISOTHERMS, ICING_PRESENTATION, MAP_ISOTHERM_COLOR, cloudSpreadColor, icingPatternStyle } from '../../shared/weather/cloudIcingPresentation.js'
import './CloudIcingLegend.css'

export default function CloudIcingLegend({ cloud = false, icing = false, temperature = false, detail = false, cloudEntries = null, mode = 'profile', compact = false }) {
  if (!cloud && !icing && !temperature) return null
  return <div className={`cloud-icing-legend${compact ? ' is-compact' : ''}${mode === 'map' ? ' is-map' : ''}`} aria-label="구름·착빙 범례">
    {cloud && <div className="cloud-icing-legend-section">
      <strong>구름층 추정 · T−Td</strong>
      {cloudEntries ? cloudEntries.map(entry => <span key={entry.label}><i style={{ backgroundColor: entry.color }} />{entry.label}</span>) : <span><i style={{ backgroundColor: cloudSpreadColor(1.5) }} />포화에 가까운 층</span>}
    </div>}
    {icing && <div className="cloud-icing-legend-section">
      <strong>착빙</strong>
      {ICING_PRESENTATION.slice(1).map(p => <span key={p.grade}><i style={icingPatternStyle(p.grade)} />{mode === 'map' ? ['','LGT','MOD','SEV'][p.grade] : p.label}</span>)}
      <small>전 등급의 최외곽만 윤곽 표시</small>
    </div>}
    {temperature && <div className="cloud-icing-legend-section">
      <strong>등온선</strong>
      {(mode !== 'map' && detail ? DETAIL_ISOTHERMS : BASIC_ISOTHERMS).map(t => <span key={t}><i className={`cloud-icing-legend-line${t === 0 ? ' is-zero' : ''}`} style={{ borderColor: MAP_ISOTHERM_COLOR }} />{t}°C</span>)}
    </div>}
  </div>
}
