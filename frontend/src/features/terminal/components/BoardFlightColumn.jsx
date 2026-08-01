import { airlineLogoFor } from './airlineLogoRegistry.js'
import { WeatherVisual } from './WeatherVisual.jsx'
import { formatArrivalKorea } from '../model/terminalDisplayModel.js'
import AnimatedValue from '../motion/AnimatedValue.jsx'

const unavailableForecast = { available: false, fallback: '예보 확인 중' }

function value(value) {
  return value == null || value === '' || value === '--' ? '정보 확인 중' : value
}

function WeatherTemperature({ weather, priority = 'ordinary', order }) {
  return weather?.available
    ? <AnimatedValue as="strong" mode="value" order={order} className="terminal-time-value" data-signage-text={priority}>{weather.temperature}℃</AnimatedValue>
    : null
}

function metric(value, unit) {
  return typeof value === 'number' ? `${value}${unit}` : value
}

function ForecastCell({ point, order }) {
  if (!point.available) return <div className="terminal-forecast-cell"><AnimatedValue mode="value" order={order} data-signage-text="ordinary">예보 확인 중</AnimatedValue></div>
  return <div className="terminal-forecast-cell">
    <AnimatedValue as="time" mode="value" order={order} className="terminal-time-value" data-signage-text="ordinary">{point.time}</AnimatedValue>
    <AnimatedValue mode="value" order={order + 1}><WeatherVisual weather={point} size="forecast" textPriority="ordinary" /></AnimatedValue>
    <WeatherTemperature weather={point} order={order + 2} />
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
        <h2 id={destinationHeadingId} className="terminal-board-city"><AnimatedValue mode="value" order={0}>{value(destination.city)}</AnimatedValue> <AnimatedValue as="b" mode="value" order={1}>{value(destination.code)}</AnimatedValue></h2>
        <AnimatedValue as="p" mode="value" order={2}>{value(destination.airportName)}</AnimatedValue>
        <div className="terminal-board-local-clock">
          <span>현지 시각</span><AnimatedValue as="strong" mode="value" order={3} className="terminal-time-value" data-signage-text="required">{value(clocks.destinationNow)}</AnimatedValue>
          <div className="terminal-board-local-date"><AnimatedValue mode="value" order={4} className="terminal-time-value" data-signage-text="required">{value(clocks.destinationDate)}</AnimatedValue><span>한국</span><AnimatedValue mode="value" order={5} className="terminal-time-value" data-signage-text="required">{value(clocks.koreaNow)}</AnimatedValue><span>KST</span></div>
        </div>
      </div>
    </div>
    <div data-section="flight" className="terminal-board-flight-id board-band" style={{ '--band': 1 }}>
      <div className="board-band-surface">
        <AnimatedValue mode="value" order={6} className="terminal-board-airline-logo"><img src={airlineLogoFor(airline.logoKey)} alt={`${airline.name} 로고`} /></AnimatedValue>
        <AnimatedValue as="strong" mode="value" order={7}>{value(airline.flightNumber)}</AnimatedValue><AnimatedValue mode="value" order={8} className={`terminal-board-operation ${operation.tone}`}>{value(operation.status)}</AnimatedValue><AnimatedValue mode="value" order={9}>{value(airline.name)}</AnimatedValue>
      </div>
    </div>
    <div data-section="departure" className="terminal-board-departure board-band" style={{ '--band': 2 }}>
      <div className="board-band-surface">
        <div><span>출발</span><AnimatedValue as="strong" mode="value" order={9} className="terminal-time-value" data-signage-text="required">{value(operation.departure)}</AnimatedValue></div>
        <div><span>탑승구</span><AnimatedValue as="strong" mode="value" order={10} className="terminal-time-value" data-signage-text="required">{value(operation.gate)}</AnimatedValue></div>
      </div>
    </div>
    <div data-section="arrival" className="terminal-arrival-surface board-band" style={{ '--band': 3 }}>
      <div className="board-band-surface">
        <div className="terminal-arrival-heading"><span>도착</span><div><small>현지</small><AnimatedValue as="strong" mode="value" order={11} className="terminal-time-value" data-signage-text="required">{value(clocks.arrivalLocal)}</AnimatedValue></div><div><small>한국</small><AnimatedValue as="strong" mode="value" order={12} className="terminal-time-value" data-signage-text="required">{formatArrivalKorea({ time: value(clocks.arrivalKorea), dayOffset: clocks.arrivalKoreaDayOffset })}</AnimatedValue></div></div>
        <div className="terminal-arrival-weather"><AnimatedValue mode="value" order={13}><WeatherVisual weather={weather.arrival} size="arrival" textPriority="required" /></AnimatedValue><WeatherTemperature weather={weather.arrival} priority="required" order={14} /></div>
      </div>
    </div>
    <div data-section="forecast" className="terminal-board-forecast board-band" style={{ '--band': 4 }}>
      <div className="board-band-surface">
        {forecast.map((point, index) => <ForecastCell point={point} order={15 + index * 3} key={`${point.time ?? 'unavailable'}-${index}`} />)}
      </div>
    </div>
    <div data-section="current-weather" className="terminal-current-weather board-band" style={{ '--band': 5 }}>
      <div className="board-band-surface">
        <p className="terminal-current-weather-heading"><AnimatedValue mode="value" order={30}>{destination.city}</AnimatedValue><span>현재 날씨</span></p>
        <div><AnimatedValue mode="value" order={31}><WeatherVisual weather={weather.current} size="current" textPriority="ordinary" /></AnimatedValue><WeatherTemperature weather={weather.current} order={32} /></div>
        {weather.current.available && <small>체감 <AnimatedValue mode="value" order={33}>{metric(weather.current.feelsLike, '℃')}</AnimatedValue> · 습도 <AnimatedValue mode="value" order={34}>{metric(weather.current.humidity, '%')}</AnimatedValue> · 바람 <AnimatedValue mode="value" order={35}>{value(weather.current.wind)}</AnimatedValue></small>}
      </div>
    </div>
  </article>
}
