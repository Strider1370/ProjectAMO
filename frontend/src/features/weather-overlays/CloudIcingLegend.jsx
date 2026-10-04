import { BASIC_ISOTHERMS, DETAIL_ISOTHERMS, ICING_PRESENTATION, MAP_ISOTHERM_COLOR, cloudSpreadColor, icingPatternStyle } from '../../shared/weather/cloudIcingPresentation.js'
import { formatPressureFlightLevel } from './lib/pressureLevelModel.js'
import './CloudIcingLegend.css'

const minus = value => String(value).replace('-', '−')

// 지도 범례: 레이어 하나에 한 줄, 아래 레이더 범례와 같은 색 막대 형식. 맨 위에 고른 기압면의 FL을 적는다.
function MapCloudIcingLegend({ cloud, icing, temperature, cloudEntries, compact, levelId }) {
  const pressure = /^(\d+(?:\.\d+)?)hPa$/.exec(levelId ?? '')?.[1]
  const entries = cloudEntries?.length ? cloudEntries : [{ min: 0, max: 1, color: cloudSpreadColor(.5) }]
  return <div className={`cloud-icing-legend is-map${compact ? ' is-compact' : ''}`} aria-label="구름·착빙 범례">
    <div className="cil-title">구름·착빙{pressure ? ` · ${formatPressureFlightLevel(pressure)} (${pressure} hPa)` : ''}</div>
    {cloud && <div className="cil-row" title="기온−이슬점 차(°C). 차이가 작을수록 공기가 포화에 가까워 구름이 있을 가능성이 큽니다.">
      <span className="cil-name">구름</span>
      <span className="cil-scale">
        <span className="cil-bar" aria-hidden="true">{entries.map(e => <span key={e.min} style={{ backgroundColor: e.color }} />)}</span>
        <span className="cil-ticks" aria-hidden="true">{[entries[0].min, ...entries.map(e => e.max)].map((v, i, all) => <span key={v}>{i === all.length - 1 ? `${v}°C` : v}</span>)}</span>
      </span>
      <small>작을수록 포화</small>
    </div>}
    {icing && <div className="cil-row" title="착빙 등급. 선은 착빙 구역의 가장 바깥 경계입니다.">
      <span className="cil-name">착빙</span>
      {ICING_PRESENTATION.slice(1).map(p => <span key={p.grade} className="cil-item"><i style={icingPatternStyle(p.grade)} />{['', 'LGT', 'MOD', 'SEV'][p.grade]}</span>)}
    </div>}
    {temperature && <div className="cil-row">
      <span className="cil-name">등온선</span>
      {BASIC_ISOTHERMS.map(t => <span key={t} className="cil-item"><i className={`cloud-icing-legend-line${t === 0 ? ' is-zero' : ''}`} style={{ borderColor: MAP_ISOTHERM_COLOR }} />{minus(t)}°C</span>)}
    </div>}
  </div>
}

export default function CloudIcingLegend({ cloud = false, icing = false, temperature = false, detail = false, cloudEntries = null, mode = 'profile', compact = false, levelId = null }) {
  if (!cloud && !icing && !temperature) return null
  if (mode === 'map') return <MapCloudIcingLegend cloud={cloud} icing={icing} temperature={temperature} cloudEntries={cloudEntries} compact={compact} levelId={levelId} />
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
