import { airlineLogoFor } from './airlineLogoRegistry.js'
import { WeatherVisual } from './WeatherVisual.jsx'
import { formatArrivalKorea } from '../model/terminalDisplayModel.js'

const unavailableForecast = { available: false, fallback: '예보 확인 중' }

function value(raw) {
  return raw == null || raw === '' || raw === '--' ? '정보 확인 중' : raw
}

function WeatherTemperature({ weather }) {
  return weather?.available
    ? <strong className="terminal-time-value" data-signage-text="ordinary">{weather.temperature}℃</strong>
    : <span data-signage-text="ordinary">예보 확인 중</span>
}

function Forecast({ point, className = '', motionItem = 12 }) {
  if (!point.available) return <span className="rail-forecast-unavailable rail-forecast-content rail-motion-unit" data-signage-text="ordinary" style={{ '--rail-item': motionItem }}>예보 확인 중</span>
  return <div className={`rail-forecast-content rail-motion-unit ${className}`.trim()} style={{ '--rail-item': motionItem }}>
    <time className="terminal-time-value" data-signage-text="ordinary">{point.time}</time>
    <WeatherVisual weather={point} size="forecast" textPriority="ordinary" />
    <WeatherTemperature weather={point} />
  </div>
}

function RailFlightInfo({ flight }) {
  const { destination, airline, operation, clocks } = flight
  return <section className="rail-flight-info" data-region="flight-info">
    <div className="rail-destination">
      <h2 className="rail-motion-unit" style={{ '--rail-item': 0 }}>{value(destination.city)} <span>{value(destination.code)}</span></h2>
      <p className="rail-motion-unit" style={{ '--rail-item': 1 }}>{value(destination.airportName)}</p>
    </div>
    <div className="rail-local-clock">
      <span>현지 시각</span><strong className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 2 }}>{value(clocks.destinationNow)}</strong><b className="rail-motion-unit" style={{ '--rail-item': 3 }}>{value(destination.timezone)}</b>
      <small><span className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 4 }}>{value(clocks.destinationDate)}</span> · 한국 <span className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 5 }}>{value(clocks.koreaNow)}</span></small>
    </div>
    <div className="rail-flight-status">
      <span className="rail-flight-number rail-motion-unit" style={{ '--rail-item': 6 }}><img src={airlineLogoFor(airline.logoKey)} alt={`${airline.name} 로고`} /><strong>{value(airline.flightNumber)}</strong></span>
      <span className={operation.tone}><span className="rail-motion-unit" style={{ '--rail-item': 7 }}>{value(operation.status)}</span></span>
    </div>
    <div className="rail-stats">
      <div><span>출발</span><strong className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 8 }}>{value(operation.departure)}</strong>{operation.revisedDeparture && <em className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 9 }}>{operation.revisedDeparture}</em>}</div>
      <div><span>비행시간</span><strong className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 10 }}>{value(operation.duration)}</strong></div>
      <div><span>탑승구</span><strong className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 11 }}>{value(operation.gate)}</strong></div>
    </div>
  </section>
}

function ArrivalWeather({ flight }) {
  const future = [...flight.weather.afterArrival].slice(0, 4)
  while (future.length < 4) future.push(unavailableForecast)

  return <section className="rail-arrival-weather" data-region="arrival-weather">
    <div className="terminal-arrival-clocks">
      <span>도착</span>
      <div><span>현지</span><strong className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 12 }}>{value(flight.clocks.arrivalLocal)}</strong></div>
      <div><span>한국</span><strong className="terminal-time-value rail-motion-unit" data-signage-text="required" style={{ '--rail-item': 13 }}>{formatArrivalKorea({ time: value(flight.clocks.arrivalKorea), dayOffset: flight.clocks.arrivalKoreaDayOffset })}</strong></div>
    </div>
    <div className="rail-forecast-grid">
      <div className="rail-arrival-forecast" data-section="arrival"><Forecast point={flight.weather.arrival} motionItem={14} /></div>
      <div className="rail-future-forecast" data-section="future-forecast">{future.map((point, index) => <Forecast point={point} motionItem={15 + index} key={`${point.time ?? 'unavailable'}-${index}`} />)}</div>
      <div className="rail-pre-arrival-forecast" data-section="pre-arrival"><span>도착 1시간 전</span><Forecast point={flight.weather.preArrival} motionItem={19} /></div>
    </div>
  </section>
}

export function RailFlightRow({ flight, rowIndex }) {
  if (flight.dataState.phase === 'loading' || flight.dataState.phase === 'error') {
    return <article className={`rail-flight-row terminal-data-surface terminal-data-surface--rail terminal-data-surface--${flight.dataState.phase}`} style={{ '--order': rowIndex }}>
      <span className="rail-motion-unit" style={{ '--rail-item': 0 }}>{flight.dataState.phase === 'loading' ? '운항 정보를 불러오는 중입니다' : '운항 정보를 불러오지 못했습니다'}</span>
    </article>
  }

  return <article className="rail-flight-row" style={{ '--order': rowIndex }}>
    {flight.dataState.phase === 'partial' && <p className="terminal-data-surface terminal-data-surface--rail terminal-data-surface--partial">일부 정보 확인 중</p>}
    <RailFlightInfo flight={flight} />
    <ArrivalWeather flight={flight} />
  </article>
}
