import { useState } from 'react'
import { AIRPORT_NAME_KO } from '../../api/weatherApi.js'
import MetarTab from './tabs/MetarTab.jsx'
import EnhancedTafTab from './tabs/TafTab.jsx'
import AmosBoardTab from './tabs/AmosTab.jsx'
import WarningTab from './tabs/WarningTab.jsx'
import AirportInfoTab from './tabs/AirportInfoTab.jsx'
import './AirportPanel.css'

const TABS = [
  { id: 'metar', label: 'METAR' },
  { id: 'taf',   label: 'TAF' },
  { id: 'amos',  label: 'AMOS' },
  { id: 'warn',  label: 'WARNING' },
  { id: 'info',  label: '기상정보' },
]


function AirportPanel({ airport, weatherData, onClose }) {
  const [tab, setTab] = useState('metar')

  if (!airport) return null

  const icao = airport.icao
  const name = airport.nameKo || AIRPORT_NAME_KO[icao] || airport.name || icao

  const metar      = weatherData?.metar?.airports?.[icao] || null
  const taf        = weatherData?.taf?.airports?.[icao] || null
  const amos       = weatherData?.amos?.airports?.[icao] || null
  const warning    = weatherData?.warning?.airports?.[icao] || null
  const airportInfo = weatherData?.airportInfo?.airports?.[icao] || null
  const warnCount  = warning?.warnings?.length || 0

  return (
    <aside className="airport-panel">
      <header className="airport-panel-head">
        <div className="airport-panel-info">
          <span className="airport-panel-icao">{icao}</span>
          <span className="airport-panel-name">{name}</span>
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
