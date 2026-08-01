import { airlineLogoFor } from './airlineLogoRegistry.js'
import { WeatherVisual } from './WeatherVisual.jsx'
import { formatArrivalKorea } from '../model/terminalDisplayModel.js'
import AnimatedValue from '../motion/AnimatedValue.jsx'

const unavailableForecast = { available: false, fallback: '예보 확인 중' }
const RAIL_MOTION_ITEMS_PER_ROW = 32

function value(raw) {
  return raw == null || raw === '' || raw === '--' ? '정보 확인 중' : raw
}

function WeatherTemperature({ weather, order }) {
  return weather?.available
    ? <AnimatedValue as="strong" mode="value" order={order} className="terminal-time-value" data-signage-text="ordinary">{weather.temperature}℃</AnimatedValue>
    : <AnimatedValue mode="value" order={order} data-signage-text="ordinary">예보 확인 중</AnimatedValue>
}

function Forecast({ point, className = '', order }) {
  if (!point.available) return <AnimatedValue mode="value" order={order} className="rail-forecast-unavailable rail-forecast-content" data-signage-text="ordinary">예보 확인 중</AnimatedValue>
  return <div className={`rail-forecast-content ${className}`.trim()}>
    <AnimatedValue as="time" mode="value" order={order} className="terminal-time-value" data-signage-text="ordinary">{point.time}</AnimatedValue>
    <AnimatedValue mode="value" order={order + 1}><WeatherVisual weather={point} size="forecast" textPriority="ordinary" /></AnimatedValue>
    <WeatherTemperature weather={point} order={order + 2} />
  </div>
}

function motionOrder(rowIndex, item) {
  return rowIndex * RAIL_MOTION_ITEMS_PER_ROW + item
}

function RailFlightInfo({ flight, rowIndex }) {
  const { destination, airline, operation, clocks } = flight
  return <section className="rail-flight-info" data-region="flight-info">
    <div className="rail-destination">
      <h2><AnimatedValue mode="value" order={motionOrder(rowIndex, 0)} className="rail-destination-city">{value(destination.city)}</AnimatedValue> <AnimatedValue mode="value" order={motionOrder(rowIndex, 1)} className="rail-destination-code">{value(destination.code)}</AnimatedValue></h2>
      <AnimatedValue as="p" mode="value" order={motionOrder(rowIndex, 2)}>{value(destination.airportName)}</AnimatedValue>
    </div>
    <div className="rail-local-clock">
      <span data-fixed-label>현지 시각</span><AnimatedValue as="strong" mode="value" order={motionOrder(rowIndex, 3)} className="terminal-time-value" data-signage-text="required">{value(clocks.destinationNow)}</AnimatedValue><AnimatedValue as="b" mode="value" order={motionOrder(rowIndex, 4)}>{value(destination.timezone)}</AnimatedValue>
      <div className="rail-local-date"><AnimatedValue mode="value" order={motionOrder(rowIndex, 5)} className="terminal-time-value" data-signage-text="required">{value(clocks.destinationDate)}</AnimatedValue><span data-fixed-label>한국</span><AnimatedValue mode="value" order={motionOrder(rowIndex, 6)} className="terminal-time-value" data-signage-text="required">{value(clocks.koreaNow)}</AnimatedValue><span data-fixed-label>KST</span></div>
    </div>
    <div className="rail-flight-status">
      <AnimatedValue mode="value" order={motionOrder(rowIndex, 7)} className="rail-flight-number"><img src={airlineLogoFor(airline.logoKey)} alt={`${airline.name} 로고`} /><strong>{value(airline.flightNumber)}</strong></AnimatedValue>
      <span className={operation.tone}><AnimatedValue mode="value" order={motionOrder(rowIndex, 8)}>{value(operation.status)}</AnimatedValue></span>
    </div>
    <div className="rail-stats">
      <div><span data-fixed-label>출발</span><AnimatedValue as="strong" mode="value" order={motionOrder(rowIndex, 9)} className="terminal-time-value" data-signage-text="required">{value(operation.departure)}</AnimatedValue>{operation.revisedDeparture && <AnimatedValue as="em" mode="value" order={motionOrder(rowIndex, 10)} className="terminal-time-value" data-signage-text="required">{operation.revisedDeparture}</AnimatedValue>}</div>
      <div><span data-fixed-label>비행시간</span><AnimatedValue as="strong" mode="value" order={motionOrder(rowIndex, 11)} className="terminal-time-value" data-signage-text="required">{value(operation.duration)}</AnimatedValue></div>
      <div><span data-fixed-label>탑승구</span><AnimatedValue as="strong" mode="value" order={motionOrder(rowIndex, 12)} className="terminal-time-value" data-signage-text="required">{value(operation.gate)}</AnimatedValue></div>
    </div>
  </section>
}

function ArrivalWeather({ flight, rowIndex }) {
  const future = [...flight.weather.afterArrival].slice(0, 4)
  while (future.length < 4) future.push(unavailableForecast)

  return <section className="rail-arrival-weather" data-region="arrival-weather">
    <div className="terminal-arrival-clocks">
      <span data-fixed-label>도착</span>
      <div><span data-fixed-label>현지</span><AnimatedValue as="strong" mode="value" order={motionOrder(rowIndex, 13)} className="terminal-time-value" data-signage-text="required">{value(flight.clocks.arrivalLocal)}</AnimatedValue></div>
      <div><span data-fixed-label>한국</span><AnimatedValue as="strong" mode="value" order={motionOrder(rowIndex, 14)} className="terminal-time-value" data-signage-text="required">{formatArrivalKorea({ time: value(flight.clocks.arrivalKorea), dayOffset: flight.clocks.arrivalKoreaDayOffset })}</AnimatedValue></div>
    </div>
    <div className="rail-forecast-grid">
      <div className="rail-arrival-forecast" data-section="arrival"><Forecast point={flight.weather.arrival} order={motionOrder(rowIndex, 15)} /></div>
      <div className="rail-future-forecast" data-section="future-forecast">{future.map((point, index) => <Forecast point={point} order={motionOrder(rowIndex, 18 + index * 3)} key={`${point.time ?? 'unavailable'}-${index}`} />)}</div>
      <div className="rail-pre-arrival-forecast" data-section="pre-arrival"><span data-fixed-label>도착 1시간 전</span><Forecast point={flight.weather.preArrival} order={motionOrder(rowIndex, 30)} /></div>
    </div>
  </section>
}

export function RailFlightRow({ flight, rowIndex }) {
  if (flight.dataState.phase === 'loading' || flight.dataState.phase === 'error') {
    return <article className={`rail-flight-row terminal-data-surface terminal-data-surface--rail terminal-data-surface--${flight.dataState.phase}`} data-testid="rail-flight-row" data-flight-id={flight.id} style={{ '--order': rowIndex }}>
      <span>{flight.dataState.phase === 'loading' ? '운항 정보를 불러오는 중입니다' : '운항 정보를 불러오지 못했습니다'}</span>
    </article>
  }

  return <article className="rail-flight-row" data-testid="rail-flight-row" data-flight-id={flight.id} style={{ '--order': rowIndex }}>
    {flight.dataState.phase === 'partial' && <p className="terminal-data-surface terminal-data-surface--rail terminal-data-surface--partial">일부 정보 확인 중</p>}
    <RailFlightInfo flight={flight} rowIndex={rowIndex} />
    <ArrivalWeather flight={flight} rowIndex={rowIndex} />
  </article>
}
