import { useEffect, useState } from 'react'
import { GROUND_FORECAST_CYCLE_MS, GROUND_FORECAST_FADE_MS, GROUND_FORECAST_VIEW, formatGroundForecastMeta, nextGroundForecastView } from '../utils/groundForecastViewModel.js'
import { scheduleGroundForecastAdvance } from '../utils/groundForecastTimer.js'
import GroundHourlyStrip from './GroundHourlyStrip.jsx'
import GroundForecastPanel from './GroundForecastPanel.jsx'

export default function GroundForecastViewport({ groundForecastData, icao }) {
  const [activeView, setActiveView] = useState(GROUND_FORECAST_VIEW.HOURLY)
  const airport = groundForecastData?.airports?.[icao] || null
  useEffect(() => scheduleGroundForecastAdvance(() => setActiveView((view) => nextGroundForecastView(view)), window), [activeView])
  const active = (view) => activeView === view
  const title = activeView === GROUND_FORECAST_VIEW.HOURLY ? '시간별 예보' : '주간 예보'
  return <section className="ground-forecast-viewport panel" role="region" aria-label="지상 예보" style={{ '--ground-forecast-cycle-ms': `${GROUND_FORECAST_CYCLE_MS}ms`, '--ground-forecast-fade-ms': `${GROUND_FORECAST_FADE_MS}ms` }}>
    <header className="ground-forecast-viewport-header">
      <span className="ground-forecast-title is-active" data-forecast-title={activeView} aria-current="true">{title}</span>
      <span data-forecast-metadata>{formatGroundForecastMeta(airport, icao, activeView)}</span>
    </header>
    <div className="ground-forecast-progress-track"><span key={activeView} data-forecast-progress /></div>
    <div className={`ground-forecast-layer${active('hourly') ? ' is-active' : ''}`} data-forecast-view="hourly" aria-hidden={active('hourly') ? 'false' : 'true'} inert={active('hourly') ? undefined : 'true'}><GroundHourlyStrip airport={airport} /></div>
    <div className={`ground-forecast-layer${active('weekly') ? ' is-active' : ''}`} data-forecast-view="weekly" aria-hidden={active('weekly') ? 'false' : 'true'} inert={active('weekly') ? undefined : 'true'}><GroundForecastPanel airport={airport} /></div>
  </section>
}
