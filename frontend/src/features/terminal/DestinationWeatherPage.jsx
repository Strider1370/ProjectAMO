import { MdChevronRight, MdInfoOutline } from 'react-icons/md'
import { airlineLogoFor } from './components/airlineLogoRegistry.js'
import { TerminalHeader } from './components/TerminalHeader.jsx'
import { WeatherVisual } from './components/WeatherVisual.jsx'
import { formatArrivalKorea } from './model/terminalDisplayModel.js'

function FlightDataSurface({ flight, children }) {
  const { phase } = flight.dataState
  if (phase === 'loading' || phase === 'error') {
    return <article className={`rail-flight-row terminal-data-surface terminal-data-surface--rail terminal-data-surface--${phase}`}>
      {phase === 'loading' ? '운항 정보를 불러오는 중입니다' : '운항 정보를 불러오지 못했습니다'}
    </article>
  }
  return children
}

function weatherValue(point, property) {
  return point.available ? point[property] : '예보 확인 중'
}

function RailStats({ flight }) {
  return <div className="rail-stats">
    <div><span>출발</span><div className="rail-motion-unit" style={{ '--rail-item': 6 }}><strong className="terminal-time-value" data-signage-text="required">{flight.operation.departure}</strong>{flight.operation.revisedDeparture && <em className="terminal-time-value" data-signage-text="required">{flight.operation.revisedDeparture}</em>}</div></div>
    <div><span>예상 비행시간</span><div className="rail-motion-unit" style={{ '--rail-item': 7 }}><strong className="terminal-time-value" data-signage-text="required">{flight.operation.duration}</strong></div></div>
    <div><span>탑승구</span><div className="rail-motion-unit" style={{ '--rail-item': 8 }}><strong className="terminal-time-value" data-signage-text="required">{flight.operation.gate}</strong></div></div>
  </div>
}

function WeatherValue({ point }) {
  return point.available
    ? <strong className="terminal-time-value" data-signage-text="ordinary">{point.temperature}℃</strong>
    : <span data-signage-text="ordinary">예보 확인 중</span>
}

function ForecastTimeline({ flight }) {
  return <div className="timeline">
    <div className="timeline-arrival-grid"><div className="progress-label progress-label--arrival"><span className="progress-label__title">도착</span><div className="arrival-clocks"><div className="progress-clock"><span>현지</span><strong className="rail-motion-unit terminal-time-value" data-signage-text="required" style={{ '--rail-item': 9 }}>{flight.clocks.arrivalLocal}</strong></div><div className="progress-clock"><span>한국</span><strong className="rail-motion-unit terminal-time-value" data-signage-text="required" style={{ '--rail-item': 10 }}>{formatArrivalKorea({ time: flight.clocks.arrivalKorea, dayOffset: flight.clocks.arrivalKoreaDayOffset })}</strong><small>KST</small></div></div></div></div>
    <div className="flight-progress"><i className="progress-dots" /><i className="progress-line" /><b /><MdChevronRight className="progress-arrow" /></div>
    <div className="pre-arrival-forecast"><span>도착 1시간 전</span><div className="pre-arrival-values rail-motion-unit" style={{ '--rail-item': 11 }}><time className="terminal-time-value" data-signage-text="ordinary">{weatherValue(flight.weather.preArrival, 'time')}</time><WeatherVisual weather={flight.weather.preArrival} size="forecast" textPriority="ordinary" /><WeatherValue point={flight.weather.preArrival} /></div></div>
    <div className="timeline-forecast">{[flight.weather.arrival, ...flight.weather.afterArrival].map((point, index) => <div className={index === 0 ? 'is-arrival' : ''} key={point.time ?? index}><div className="rail-forecast-content rail-motion-unit" style={{ '--rail-item': 12 + index }}><time className="terminal-time-value" data-signage-text="ordinary">{weatherValue(point, 'time')}</time><WeatherVisual weather={point} size="forecast" textPriority="ordinary" /><WeatherValue point={point} /></div></div>)}</div>
  </div>
}

function RailRow({ flight, index }) {
  return <FlightDataSurface flight={flight}><article className="rail-flight-row" style={{ '--order': index }}>
    {flight.dataState.phase === 'partial' && <p className="terminal-data-surface terminal-data-surface--rail terminal-data-surface--partial">일부 정보 확인 중</p>}
    <div className="rail-flight-info">
      <h2 className="rail-motion-unit" style={{ '--rail-item': 0 }}>{flight.destination.displayName} <span>{flight.destination.code}</span></h2>
      <div className="rail-local-clock"><span>현지 시각</span><strong className="rail-motion-unit terminal-time-value" data-signage-text="required" style={{ '--rail-item': 1 }}>{flight.clocks.destinationNow}</strong><b className="rail-motion-unit" style={{ '--rail-item': 2 }}>{flight.destination.timezone}</b><small className="rail-motion-unit" style={{ '--rail-item': 3 }}><span className="terminal-time-value" data-signage-text="required">{flight.clocks.destinationDate}</span> · 한국 <span className="terminal-time-value" data-signage-text="required">{flight.clocks.koreaNow}</span> KST</small></div>
      <div className="rail-flight-status"><span className="rail-flight-number rail-motion-unit" style={{ '--rail-item': 4 }}><img src={airlineLogoFor(flight.airline.logoKey)} alt={`${flight.airline.name} 로고`} /><strong>{flight.airline.flightNumber}</strong></span><span className={`${flight.operation.tone} rail-motion-unit`} style={{ '--rail-item': 5 }}>{flight.operation.status}</span></div>
      <RailStats flight={flight} />
    </div>
    <ForecastTimeline flight={flight} />
  </article></FlightDataSurface>
}

function RailScreen({ transitioning, activeFlights, pendingFlights, currentPage, pageCount, motionMode, onReplay, onSelectMotion, onSelectView }) {
  return <section className={`exact-screen exact-rail rail-motion-${motionMode}`} data-testid="option-three">
    <TerminalHeader view="rail" motionMode={motionMode} page={currentPage} pageCount={pageCount} onViewChange={onSelectView} onMotionChange={onSelectMotion} onAdvance={onReplay} />
    <div className="rail-viewport"><div className={`rail-page ${transitioning ? 'is-leaving' : ''}`}>{activeFlights.map((flight, index) => <RailRow flight={flight} index={index} key={flight.id} />)}</div>{transitioning && <div className="rail-page is-entering" aria-hidden="true">{pendingFlights.map((flight, index) => <RailRow flight={flight} index={index} key={flight.id} />)}</div>}</div>
    <footer><MdInfoOutline /><span>도착 현지 시간 기준 · 예보는 참고용이며, 실제 날씨와 다를 수 있습니다.</span><b>다음 업데이트 <strong className="terminal-time-value" data-signage-text="required">09:30</strong> KST</b></footer>
  </section>
}

export function DestinationWeatherPage({ groups, pager, motionMode, onViewChange, onMotionChange }) {
  const activeFlights = groups[pager.currentPage]
  const pendingFlights = groups[pager.pendingPage]
  return <main className="prototype-shell"><RailScreen transitioning={pager.transitioning} activeFlights={activeFlights} pendingFlights={pendingFlights} currentPage={pager.currentPage} pageCount={groups.length} motionMode={motionMode} onReplay={pager.advance} onSelectMotion={onMotionChange} onSelectView={onViewChange} /></main>
}

export const App = DestinationWeatherPage
