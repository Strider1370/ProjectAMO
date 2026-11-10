import { BASIC_ISOTHERMS, DETAIL_ISOTHERMS, ICING_PRESENTATION, MAP_ISOTHERM_COLOR, cloudSpreadColor, icingPatternStyle } from '../../shared/weather/cloudIcingPresentation.js'
import { formatPressureFlightLevel } from './lib/pressureLevelModel.js'
import { LegendKeys, LegendScale } from './MapLegend.jsx'
import './CloudIcingLegend.css'

const minus = value => String(value).replace('-', '−')

const STATUS = { loading: '불러오는 중', refreshing: '갱신 중', error: '자료 오류', unavailable: '자료 없음', unsupported: '고정 자료 없음' }

// 범례 제목 줄의 켬/끔. 이 범례에서 무엇을 보일지 고르는 것이라 범례 옆에 둔다(데스크톱 자료 시각 카드).
function SubLayerTitle({ text, id, controls }) {
  if (!controls) return text
  const unavailable = id === 'icing' && Number.parseFloat(controls.level) < 300
  const on = Boolean(controls.visibility?.[id]) && !unavailable
  const status = unavailable ? '지원층 밖' : on ? STATUS[controls.statuses?.[id]] : null
  return <>
    <span>{text}</span>
    {status && <span className="hlegend-status" role="status">{status}</span>}
    <button type="button" className="hlegend-toggle" aria-pressed={on} disabled={unavailable}
      aria-label={`${id === 'cloud' ? '구름' : '착빙'} ${on ? '끄기' : '켜기'}`} onClick={() => controls.onToggle(id)}>{on ? '켬' : '끔'}</button>
  </>
}

// 지도 범례: 레이어마다 다른 범례와 같은 틀(제목 → 색띠/견본 → 설명)을 쓴다. 제목 끝에 고른 기압면의 FL을 적는다.
// controls가 있으면 구름·착빙 줄은 꺼져 있어도 제목과 켬/끔을 남겨 다시 켤 수 있게 한다.
function MapCloudIcingLegend({ cloud, icing, temperature, cloudEntries, compact, levelId, controls }) {
  const pressure = /^(\d+(?:\.\d+)?)hPa$/.exec(levelId ?? '')?.[1]
  const level = pressure ? ` · ${formatPressureFlightLevel(pressure)}` : ''
  const entries = cloudEntries?.length ? cloudEntries : [{ min: 0, max: 1, color: cloudSpreadColor(.5) }]
  const cloudTitle = <SubLayerTitle text={`구름 · 기온−이슬점 °C${level}`} id="cloud" controls={controls} />
  const icingTitle = <SubLayerTitle text={temperature ? `착빙·등온선${level}` : `착빙${level}`} id="icing" controls={controls} />
  return <div className={`cloud-icing-legend is-map${compact ? ' is-compact' : ''}`} aria-label="구름·착빙 범례"
    title={pressure ? `${formatPressureFlightLevel(pressure)} (${pressure} hPa) 기준` : undefined}>
    {cloud ? <LegendScale title={cloudTitle} ariaLabel="구름 범례" labels="edge"
      entries={entries.map(e => ({ color: e.color, label: String(e.min) }))} endLabel={String(entries.at(-1).max)}
      note="작을수록 포화에 가까움" hint="기온−이슬점 차(°C). 차이가 작을수록 공기가 포화에 가까워 구름이 있을 가능성이 큽니다." />
      : controls && <LegendKeys title={cloudTitle} ariaLabel="구름 범례" />}
    {/* 등온선은 착빙과 같이 읽는 선(0°C·−20°C)이라 착빙 줄 끝에 이어 붙인다. 착빙을 끄면 등온선만 남는다. */}
    {(icing || temperature || controls) && <LegendKeys title={icing || controls ? icingTitle : `등온선${level}`} ariaLabel="착빙·등온선 범례"
      hint="착빙 등급(선은 착빙 구역의 가장 바깥 경계)과 0°C·−20°C 등온선입니다."
      items={[
        ...(icing ? ICING_PRESENTATION.slice(1).map(p => ({ key: p.grade, label: ['', 'LGT', 'MOD', 'SEV'][p.grade], style: icingPatternStyle(p.grade) })) : []),
        ...(temperature ? BASIC_ISOTHERMS.map((t, index) => ({ key: `t${t}`, label: `${minus(t)}°C`, separated: icing && index === 0,
          swatch: <i className={`hlegend-swatch is-line cloud-icing-legend-line${t === 0 ? ' is-zero' : ''}`} style={{ borderColor: MAP_ISOTHERM_COLOR }} aria-hidden="true" /> })) : []),
      ]} />}
  </div>
}

export default function CloudIcingLegend({ cloud = false, icing = false, temperature = false, detail = false, cloudEntries = null, mode = 'profile', compact = false, levelId = null, controls = null }) {
  if (!cloud && !icing && !temperature && !(mode === 'map' && controls)) return null
  if (mode === 'map') return <MapCloudIcingLegend cloud={cloud} icing={icing} temperature={temperature} cloudEntries={cloudEntries} compact={compact} levelId={levelId} controls={controls} />
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
