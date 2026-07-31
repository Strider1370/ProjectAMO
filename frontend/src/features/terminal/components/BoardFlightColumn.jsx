import { airlineLogoFor } from './airlineLogoRegistry.js'
import { WeatherVisual } from './WeatherVisual.jsx'
import { formatArrivalKorea } from '../model/terminalDisplayModel.js'

const unavailableForecast = { available: false, fallback: '예보 확인 중' }

function value(value) {
  return value == null || value === '' || value === '--' ? '정보 확인 중' : value
}

function WeatherTemperature({ weather, priority = 'ordinary' }) {
  return weather?.available
    ? <strong className="terminal-time-value" data-signage-text={priority}>{weather.temperature}℃</strong>
    : null
}

function metric(value, unit) {
  return typeof value === 'number' ? `${value}${unit}` : value
}

function ForecastCell({ point }) {
  if (!point.available) return <div className="terminal-forecast-cell"><span data-signage-text="ordinary">예보 확인 중</span></div>
  return <div className="terminal-forecast-cell">
    <time className="terminal-time-value" data-signage-text="ordinary">{point.time}</time>
    <WeatherVisual weather={point} size="forecast" textPriority="ordinary" />
    <WeatherTemperature weather={point} />
  </div>
}

export function BoardFlightColumn({ flight, columnIndex }) {
  const { destination, airline, operation, clocks, weather, dataState } = flight
  const destinationHeadingId = `terminal-board-destination-${flight.id}`
  const forecast = [weather.arrival, ...weather.afterArrival].slice(0, 5)
  while (forecast.length < 5) forecast.push(unavailableForecast)

  if (dataState.phase === 'loading' || dataState.phase === 'error') {
    return <article className={`terminal-board-flight terminal-data-surface terminal-data-surface--board terminal-data-surface--${dataState.phase}`}>
      {dataState.phase === 'loading' ? '운항 정보를 불러오는 중입니다' : '운항 정보를 불러오지 못했습니다'}
    </article>
  }

  return <article className="terminal-board-flight" aria-labelledby={destinationHeadingId} style={{ '--column': columnIndex }}>
    <div data-section="identity" className="terminal-board-identity board-band" style={{ '--band': 0 }}>
      <div className="board-band-surface">
        <h2 id={destinationHeadingId} className="terminal-board-city"><span className="roll-unit flap-unit">{value(destination.city)}</span> <b className="roll-unit flap-unit">{value(destination.code)}</b></h2>
        <p className="roll-unit flap-unit">{value(destination.airportName)}</p>
        <div className="terminal-board-local-clock">
          <span>현지 시각</span><strong className="terminal-time-value roll-unit flap-unit" data-signage-text="required">{value(clocks.destinationNow)}</strong>
          <small><span className="terminal-time-value" data-signage-text="required">{value(clocks.destinationDate)}</span> · 한국 <span className="terminal-time-value" data-signage-text="required">{value(clocks.koreaNow)}</span> KST</small>
        </div>
      </div>
    </div>
    <div data-section="flight" className="terminal-board-flight-id board-band" style={{ '--band': 1 }}>
      <div className="board-band-surface">
        <img src={airlineLogoFor(airline.logoKey)} alt={`${airline.name} 로고`} />
        <strong className="roll-unit flap-unit">{value(airline.flightNumber)}</strong><span className={`terminal-board-operation ${operation.tone}`}>{value(operation.status)}</span><span>{value(airline.name)}</span>
      </div>
    </div>
    <div data-section="departure" className="terminal-board-departure board-band" style={{ '--band': 2 }}>
      <div className="board-band-surface">
        <div><span>출발</span><strong className="terminal-time-value roll-unit flap-unit" data-signage-text="required">{value(operation.departure)}</strong></div>
        <div><span>탑승구</span><strong className="terminal-time-value roll-unit flap-unit" data-signage-text="required">{value(operation.gate)}</strong></div>
      </div>
    </div>
    <div data-section="arrival" className="terminal-arrival-surface board-band" style={{ '--band': 3 }}>
      <div className="board-band-surface">
        <div className="terminal-arrival-heading"><span>도착</span><div><small>현지</small><strong className="terminal-time-value" data-signage-text="required">{value(clocks.arrivalLocal)}</strong></div><div><small>한국</small><strong className="terminal-time-value" data-signage-text="required">{formatArrivalKorea({ time: value(clocks.arrivalKorea), dayOffset: clocks.arrivalKoreaDayOffset })}</strong></div></div>
        <div className="terminal-arrival-weather"><WeatherVisual weather={weather.arrival} size="arrival" textPriority="required" /><WeatherTemperature weather={weather.arrival} priority="required" /></div>
      </div>
    </div>
    <div data-section="forecast" className="terminal-board-forecast board-band" style={{ '--band': 4 }}>
      <div className="board-band-surface">
        {forecast.map((point, index) => <ForecastCell point={point} key={`${point.time ?? 'unavailable'}-${index}`} />)}
      </div>
    </div>
    <div data-section="current-weather" className="terminal-current-weather board-band" style={{ '--band': 5 }}>
      <div className="board-band-surface">
        <p>{destination.city} 현재 날씨</p>
        <div><WeatherVisual weather={weather.current} size="current" textPriority="ordinary" /><WeatherTemperature weather={weather.current} /></div>
        {weather.current.available && <small>체감 {metric(weather.current.feelsLike, '℃')} · 습도 {metric(weather.current.humidity, '%')} · 바람 {value(weather.current.wind)}</small>}
      </div>
    </div>
  </article>
}
