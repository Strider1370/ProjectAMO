import { useState } from 'react'
import { AIRPORT_NAME_KO } from '../../api/weatherApi.js'
import MetarTab from './tabs/MetarTab.jsx'
import EnhancedTafTab from './tabs/TafTab.jsx'
import AmosBoardTab from './tabs/AmosTab.jsx'
import WarningTab from './tabs/WarningTab.jsx'
import AirportInfoTab from './tabs/AirportInfoTab.jsx'
import './AirportPanel.css'

const AIRPORT_HEADER_NAME_KO = {
  RKSI: '인천국제공항',
  RKSS: '김포국제공항',
  RKPC: '제주국제공항',
  RKPK: '김해국제공항',
  RKJB: '무안국제공항',
  RKNY: '양양국제공항',
  RKPU: '울산공항',
  RKJY: '여수공항',
}

const TABS = [
  { id: 'metar', label: 'METAR' },
  { id: 'taf',   label: 'TAF' },
  { id: 'amos',  label: 'AMOS' },
  { id: 'warn',  label: '공항경보' },
  { id: 'info',  label: '기상정보' },
]


function AirportPanel({ airport, weatherData, onClose }) {
  const [tab, setTab] = useState('metar')

  if (!airport) return null

  const icao = airport.icao
  const headerNameKo = AIRPORT_HEADER_NAME_KO[icao] || airport.nameKo || airport.name || icao
  const headerNameEn = airport.name || AIRPORT_NAME_KO[icao] || icao
  const headerImageSrc = `/images/${String(icao || 'RKSI').toLowerCase()}_banner.webp`

  const metar      = weatherData?.metar?.airports?.[icao] || null
  const taf        = weatherData?.taf?.airports?.[icao] || null
  const amos       = weatherData?.amos?.airports?.[icao] || null
  const warning    = weatherData?.warning?.airports?.[icao] || null
  const airportInfo = weatherData?.airportInfo?.airports?.[icao] || null
  const warnCount  = warning?.warnings?.length || 0

  return (
    <aside className="airport-panel">
      <header className="airport-panel-head">
        <img
          className="airport-panel-head-image"
          src={headerImageSrc}
          alt=""
          aria-hidden="true"
        />
        <div className="airport-panel-head-overlay" aria-hidden="true" />
        <div className="airport-panel-info">
          <span className="airport-panel-title">
            {headerNameKo}
            <span className="airport-panel-title-code"> · {icao}</span>
          </span>
          <span className="airport-panel-name">{headerNameEn}</span>
        </div>
        <button className="airport-panel-close" onClick={onClose} aria-label="닫기">×</button>
      </header>

      <div className="airport-panel-main">
        <nav className="airport-panel-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`airport-panel-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'warn' && warnCount > 0 && (
                <span className="ap-tab-badge">{warnCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="airport-panel-body">
          {tab === 'metar' && <MetarTab metar={metar} amosData={amos} icao={icao} airportMeta={airport} />}
          {tab === 'taf'   && <EnhancedTafTab taf={taf} icao={icao} />}
          {tab === 'amos'  && <AmosBoardTab amos={amos} metar={metar} airportMeta={airport} />}
          {tab === 'warn'  && <WarningTab warning={warning} />}
          {tab === 'info'  && <AirportInfoTab info={airportInfo} />}
        </div>
      </div>
    </aside>
  )
}

export default AirportPanel
