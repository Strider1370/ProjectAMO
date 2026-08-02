import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdChevronRight, MdInfoOutline } from "react-icons/md";
import { WiCloud, WiCloudy, WiDayCloudy, WiDaySunny, WiRain, WiShowers, WiThunderstorm } from "react-icons/wi";
import clearNight from "../../assets/weather-icons/basmilius/clear-night.svg";
import fewCloudsNight from "../../assets/weather-icons/basmilius/few-clouds-night.svg";
import amoWordmark from "./assets/amo-wordmark.png";
import airportWeatherQr from "./assets/airport-weather-qr.svg";
import forecastCloud from "./assets/forecast-cloud-transparent.png";
import forecastPartly from "./assets/forecast-partly-transparent.png";
import forecastRain from "./assets/forecast-rain-transparent.png";
import forecastStorm from "./assets/forecast-storm-transparent.png";
import { loadTerminalLiveWeatherData, mergeTerminalLiveWeather } from './terminalLiveData.js';
import { departureAirportFromPathname, selectTerminalDepartureAirport } from './terminalAirportSelection.js';
import {
  TERMINAL_SIMULATION_REFERENCE,
  buildTerminalSimulation,
  classifyTerminalSlotTransition,
  hasTerminalNextFrame,
  terminalFrameAt,
} from './terminalFlightSimulation.js';

const icons = {
  sun: WiDaySunny,
  partly: WiDayCloudy,
  cloud: WiCloud,
  cloudy: WiCloudy,
  rain: WiRain,
  shower: WiShowers,
  storm: WiThunderstorm,
};

function WeatherIcon({ type, className = "" }) {
  const Icon = icons[type] ?? WiCloudy;
  return <Icon className={className} aria-hidden="true" />;
}

const boardWeatherAssets = {
  sun: forecastPartly,
  rain: forecastRain,
  partly: forecastPartly,
  cloud: forecastCloud,
  cloudy: forecastCloud,
  shower: forecastRain,
  storm: forecastRain,
};

const boardForecastAssets = {
  rain: forecastRain,
  partly: forecastPartly,
  cloud: forecastCloud,
  cloudy: forecastCloud,
  shower: forecastRain,
  storm: forecastStorm,
};

function BoardWeatherImage({ type, small = false }) {
  const source = (small ? boardForecastAssets : boardWeatherAssets)[type] ?? boardWeatherAssets.cloud;
  const opticalClass = small ? ` weather-image weather-image--${type}` : "";
  return <img className={opticalClass.trim()} src={source} alt="" aria-hidden="true" />;
}

const railWeatherAssets = {
  sun: boardForecastAssets.partly,
  partly: boardForecastAssets.partly,
  cloud: boardForecastAssets.cloud,
  cloudy: boardForecastAssets.cloudy,
  rain: boardForecastAssets.rain,
  shower: boardForecastAssets.shower,
  storm: boardForecastAssets.storm,
  night: clearNight,
  nightPartly: fewCloudsNight,
};

const weatherLabels = {
  sun: "맑음",
  partly: "구름 조금",
  cloud: "흐림",
  cloudy: "흐림",
  rain: "비",
  shower: "소나기",
  storm: "뇌우",
  night: "맑음",
  nightPartly: "구름 조금",
};

const displayTemperature = (value) => String(value).replace("℃", "°C");
const displayForecastHour = (value) => String(value).replace(/^\d{2}:00$/, `${Number(String(value).slice(0, 2))}시`);
const splitArrivalKst = (value) => value.startsWith("다음 날 ")
  ? { dayLabel: "다음 날", time: value.slice("다음 날 ".length) }
  : { dayLabel: "", time: value };

function formatKoreanClock(value) {
  const koreanDays = ["일", "월", "화", "수", "목", "금", "토"];
  const kst = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return { date: `${year}.${month}.${day} (${koreanDays[kst.getUTCDay()]})`, time: `${hour}:${minute}` };
}

function WeatherCondition({ type, className = "", style }) {
  return <em className={`weather-condition weather-condition--${type} ${className}`.trim()} style={style}>{weatherLabels[type] ?? "흐림"}</em>;
}

function RailWeatherImage({ type }) {
  return <img className={`weather-image weather-image--${type}`} src={railWeatherAssets[type] ?? railWeatherAssets.cloud} alt="" aria-hidden="true" />;
}

function AirlineLogo({ flight }) {
  return (
    <div className={`airline-logo airline-logo--${flight.code.toLowerCase()}`}>
      {flight.logo
        ? <img src={flight.logo} alt={`${flight.airline} 로고`} />
        : <span className="airline-logo-fallback" aria-label={flight.airline}>{flight.flight.slice(0, 2)}</span>}
    </div>
  );
}

function changedVariantClass(flight, comparisonFlight, fields) {
  return comparisonFlight && fields.some((field) => flight[field] !== comparisonFlight[field]) ? ' flight-variant-value' : '';
}

function terminalSlotTransitions(activeFlights, pendingFlights) {
  return Array.from(
    { length: Math.max(activeFlights.length, pendingFlights.length) },
    (_, index) => classifyTerminalSlotTransition(activeFlights[index], pendingFlights[index]),
  );
}

function BoardColumn({ flight, comparisonFlight, columnIndex, weatherCitySlot, transitionKind }) {
  const bandStyle = (band) => ({ "--band": band, "--column": columnIndex });
  const rollStyle = (item) => ({ "--item": item });
  const variant = (...fields) => changedVariantClass(flight, comparisonFlight, fields);
  const isDelayed = Boolean(flight.revised);
  const [localDate, localTime] = flight.localClock.split(" ");
  const [kstDate] = flight.kstClock.split(" ");
  const showLocalDate = localDate !== kstDate;
  return (
    <article className={`board-column is-slot-${transitionKind}${transitionKind === "flight" ? " is-flight-variant-changing" : ""}`} data-testid="board-flight-column" data-destination-code={flight.code} data-flight-key={flight.flightKey}>
      <div className="board-band" style={bandStyle(0)}>
        <div className="board-band-surface">
          <div className="board-destination">
            <div>
              <h2>
                <span className="destination-name roll-unit flap-unit" style={rollStyle(0)}>{flight.displayName}</span>{" "}
                <span className="destination-code roll-unit flap-unit" style={rollStyle(1)}>{flight.code}</span>
              </h2>
            </div>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(1)}>
        <div className="board-band-surface">
          <div className="airline-block">
            <div className={`roll-unit flap-unit${variant('logo', 'airline')}`} style={rollStyle(0)}><AirlineLogo flight={flight} /></div>
            <div className="airline-flight-meta">
              <strong className={`roll-unit flap-unit${variant('flight')}`} style={rollStyle(1)}>{flight.flight}</strong>
              <span className={`roll-unit flap-unit${variant('airline')}`} style={rollStyle(2)}>{flight.airline}</span>
            </div>
            <div className={`operation-status${isDelayed ? " is-delay" : ""}`}>
              <i className={`roll-unit flap-unit${variant('statusTone')}`} style={rollStyle(3)} />
              <strong className={`roll-unit flap-unit${variant('status')}`} style={rollStyle(4)}>{flight.status}</strong>
            </div>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(2)}>
        <div className="board-band-surface">
          <div className="schedule-grid">
            <div>
              <span className="roll-unit" style={rollStyle(0)}>출발</span>
              <div className={`departure-time${isDelayed ? " is-delayed" : ""}`}>
                <strong className={`roll-unit flap-unit${variant('revised', 'departure')}`} style={rollStyle(1)}>{flight.revised ?? flight.departure}</strong>
                {flight.revised && <small className={`roll-unit${variant('revised', 'departure')}`} style={rollStyle(2)}>예정 <s>{flight.departure}</s></small>}
              </div>
            </div>
            <div>
              <span className="roll-unit" style={rollStyle(3)}>탑승구</span>
              <strong className={`roll-unit flap-unit${variant('gate')}`} style={rollStyle(4)}>{flight.gate}</strong>
            </div>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(3)}>
        <div className="board-band-surface">
          <div className="current-weather-heading">
            <p className="section-label" style={{ "--weather-city-slot": weatherCitySlot }}>
              <span className="weather-title roll-unit flap-unit" style={rollStyle(0)}>{flight.city} 현재 날씨</span>
            </p>
            <div className="current-weather-clock roll-unit flap-unit" style={rollStyle(2)}>
              <div className="local-clock-main"><span>현지 시각</span>{showLocalDate && <time>{localDate}</time>}<strong>{localTime}</strong><b>{flight.localZone}</b></div>
            </div>
          </div>
          <div className="current-weather">
            <div className="temperature">
              <span className="weather-icon-stack roll-unit flap-unit" style={rollStyle(3)}>
                <BoardWeatherImage type={flight.current.icon} />
                <WeatherCondition type={flight.current.icon} />
              </span>
              <strong className="roll-unit flap-unit" style={rollStyle(4)}>{flight.current.temp}<small>°C</small></strong>
            </div>
            <dl>
              <div className="roll-unit" style={rollStyle(5)}><dt>체감</dt><dd className="flap-unit">{flight.current.feels}</dd></div>
              <div className="roll-unit" style={rollStyle(6)}><dt>습도</dt><dd className="flap-unit">{flight.current.humidity}</dd></div>
              <div className="roll-unit" style={rollStyle(7)}><dt>바람</dt><dd className="flap-unit">{flight.current.wind}</dd></div>
            </dl>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(4)}>
        <div className="board-band-surface">
          <div className="arrival-time">
            <span className="roll-unit" style={rollStyle(0)}>도착</span>
            <strong className={`roll-unit flap-unit${variant('arrival', 'localZone')}`} style={rollStyle(1)}>{flight.arrival}<b>{flight.localZone}</b></strong>
            <small className={`roll-unit flap-unit${variant('arrivalKst')}`} style={rollStyle(2)}>(한국 {flight.arrivalKst}KST)</small>
          </div>
          <div className="board-forecast">
            {flight.forecast.map(([time, icon, temp], index) => (
              <div className={index === 0 ? "is-arrival" : ""} key={time}>
                <time className="roll-unit flap-unit" style={rollStyle(3 + index * 4)}>{time}</time>
                <span className="roll-unit flap-unit" style={rollStyle(4 + index * 4)}><BoardWeatherImage type={icon} small /></span>
                <WeatherCondition type={icon} className="roll-unit flap-unit" style={rollStyle(5 + index * 4)} />
                <strong className="roll-unit flap-unit" style={rollStyle(6 + index * 4)}>{displayTemperature(temp)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function ViewSwitcher({ view, onSelectView }) {
  return (
    <nav className="view-switcher" aria-label="화면 비교">
      <button type="button" className={view === "board" ? "is-active" : ""} aria-pressed={view === "board"} onClick={() => onSelectView("board")}>1안</button>
      <button type="button" className={view === "rail" ? "is-active" : ""} aria-pressed={view === "rail"} onClick={() => onSelectView("rail")}>3안</button>
    </nav>
  );
}

function DepartureAirportSelect({ airports, selectedIcao, onSelect }) {
  if (airports.length === 0) return null;
  return (
    <label className="terminal-airport-selector">
      <span>출발 공항</span>
      <select aria-label="출발 공항" value={selectedIcao} onChange={(event) => onSelect(event.target.value)}>
        {airports.map((airport) => <option key={airport.icao} value={airport.icao}>{airport.nameKo}</option>)}
      </select>
    </label>
  );
}

function PageIndicator({ currentFrame, frameCount }) {
  return (
    <div
      className="page-indicator"
      role="img"
      aria-label={`${currentFrame + 1} / ${frameCount} 프레임`}
    >
      {Array.from({ length: frameCount }, (_, index) => (
        <i className={index === currentFrame ? "is-current" : ""} aria-hidden="true" key={index} />
      ))}
    </div>
  );
}

function AgencyMascot() {
  return <img className="agency-mascot" src="/gisang-i/clear_3_avatar.png" alt="항공기상청 기상이" />;
}

function HeaderWeatherPanel({ showWordmark = false }) {
  return (
    <a className="header-weather-panel" href="https://amo.kma.go.kr/weather/airport.do">
      {showWordmark && <img className="agency-wordmark" src={amoWordmark} alt="책임운영기관 항공기상청" />}
      <span><strong>해외 공항 상세 날씨</strong><small>amo.kma.go.kr</small></span>
      <img src={airportWeatherQr} alt="해외 공항 상세 날씨 QR 코드" />
    </a>
  );
}

const boardMotionModes = [
  ["split", "FLAP", "뒤집기"],
  ["roll", "ROLL", "세로 롤"],
  ["wipe", "WIPE", "마스크"],
  ["fade", "FADE", "겹침"],
];

const railMotionModes = [
  ["cascade", "CASCADE", "행 순차"],
  ["flap", "FLAP", "요소 플랩"],
  ["roll", "ROLL", "요소 롤"],
  ["wipe", "WIPE", "마스크"],
  ["fade", "FADE", "겹침"],
];

function MotionModeSwitcher({ motionMode, onSelectMotion, modes = boardMotionModes, ariaLabel = "1안 전환 애니메이션" }) {
  return (
    <div className="motion-mode-switch" aria-label={ariaLabel} style={{ "--motion-count": modes.length }}>
      {modes.map(([mode, title, label]) => (
        <button
          type="button"
          className={motionMode === mode ? "is-active" : ""}
          aria-pressed={motionMode === mode}
          onClick={() => onSelectMotion(mode)}
          key={mode}
        >
          <strong>{title}</strong><span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function TerminalEmptyState({ airportName }) {
  return (
    <div className="terminal-empty-state" role="status">
      <strong>해당 시간대 출발편이 없습니다</strong>
      <span>{airportName} · {TERMINAL_SIMULATION_REFERENCE.time} 이후 조회 기준</span>
    </div>
  );
}

function TerminalTitle({ title, flightCount, destinationCount }) {
  return <h1>{title}{flightCount > 0 && <small>총 {flightCount}편 · {destinationCount}개 목적지</small>}</h1>;
}

function BoardScreen({ transitioning, activeFlights, pendingFlights, currentFrame, frameCount, flightCount, destinationCount, motionMode, onReplay, hasNext, onSelectMotion, onSelectView, clock, title, departureAirports, departureAirportIcao, departureAirportName, onSelectDepartureAirport }) {
  const slotTransitions = terminalSlotTransitions(activeFlights, pendingFlights);
  return (
    <section className={`exact-screen exact-board motion-${motionMode}`} data-testid="option-one">
      <PageIndicator currentFrame={currentFrame} frameCount={frameCount} />
      <header className="board-header">
        <AgencyMascot />
        <TerminalTitle title={title} flightCount={flightCount} destinationCount={destinationCount} />
        <div className="board-header-actions">
          <DepartureAirportSelect airports={departureAirports} selectedIcao={departureAirportIcao} onSelect={onSelectDepartureAirport} />
          <ViewSwitcher view="board" onSelectView={onSelectView} />
          <MotionModeSwitcher motionMode={motionMode} onSelectMotion={onSelectMotion} />
          <button type="button" className="next-board-button" onClick={onReplay} disabled={!hasNext}>
            <MdChevronRight /><span>다음 항공편</span>
          </button>
        </div>
        <div className="board-header-clock"><span>{clock.date}</span><strong>{clock.time}</strong></div>
      </header>
      <div className="board-viewport">
        {activeFlights.length === 0 ? <TerminalEmptyState airportName={departureAirportName} /> : <div className={`board-page ${transitioning ? "is-leaving" : ""}`} data-testid="board-active-page">
          {activeFlights.map((flight, index) => (
            <Fragment key={`${index}-${flight.flightKey}`}>
              <BoardColumn
                flight={flight}
                comparisonFlight={pendingFlights[index]}
                columnIndex={index}
                weatherCitySlot={`${Math.max(flight.city.length, pendingFlights[index]?.city.length ?? 0)}em`}
                transitionKind={slotTransitions[index]}
              />
              {index < activeFlights.length - 1 && <i className={`board-column-separator is-slot-${slotTransitions[index + 1]}`} aria-hidden="true" />}
            </Fragment>
          ))}
        </div>}
        {transitioning && (
          <div className="board-page is-entering" data-testid="board-pending-page" aria-hidden="true">
            {pendingFlights.map((flight, index) => (
              <Fragment key={`${index}-${flight.flightKey}`}>
                <BoardColumn
                  flight={flight}
                  comparisonFlight={activeFlights[index]}
                  columnIndex={index}
                  weatherCitySlot={`${Math.max(flight.city.length, activeFlights[index]?.city.length ?? 0)}em`}
                  transitionKind={slotTransitions[index]}
                />
                {index < pendingFlights.length - 1 && <i className={`board-column-separator is-slot-${slotTransitions[index + 1]}`} aria-hidden="true" />}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <footer className="screen-footer board-footer">
        <div className="screen-footer-note"><MdInfoOutline /><span>2026.08.02 13:00 KST 한국공항공사 운항스케줄 기준 · 도착 날씨는 참고용입니다.</span></div>
        <HeaderWeatherPanel showWordmark />
      </footer>
    </section>
  );
}

function RailStats({ flight, comparisonFlight }) {
  const variant = (...fields) => changedVariantClass(flight, comparisonFlight, fields);
  return (
    <div className="rail-stats">
      <div>
        <span>출발</span>
        <div className={`rail-motion-unit${variant('revised', 'departure')}${flight.revised ? " is-delayed" : ""}`} style={{ "--rail-item": 6 }}><strong>{flight.revised ?? flight.departure}</strong>{flight.revised && <em>예정 <s>{flight.departure}</s></em>}</div>
      </div>
      <div>
        <span>예상 비행시간</span>
        <div className={`rail-motion-unit${variant('duration')}`} style={{ "--rail-item": 7 }}><strong>{flight.duration}</strong></div>
      </div>
      <div>
        <span>탑승구</span>
        <div className={`rail-motion-unit${variant('gate')}`} style={{ "--rail-item": 8 }}><strong>{flight.gate}</strong></div>
      </div>
    </div>
  );
}

function ForecastTimeline({ flight, comparisonFlight }) {
  const { dayLabel: arrivalDayLabel, time: arrivalKstTime } = splitArrivalKst(flight.arrivalKst);
  const variant = (...fields) => changedVariantClass(flight, comparisonFlight, fields);
  return (
    <div className="timeline">
      <div className="timeline-arrival-grid">
        <div className="progress-label progress-label--arrival">
          <span className="progress-label__title">예상 도착</span>
          <div className="arrival-clocks">
            <div className="progress-clock">
              <span>현지</span><strong className={`rail-motion-unit${variant('arrival', 'localZone')}`} style={{ "--rail-item": 9 }}>{flight.arrival}</strong>
            </div>
            <div className="progress-clock">
              <span>한국</span><strong className={`rail-motion-unit${variant('arrivalKst')}`} style={{ "--rail-item": 10 }}>{arrivalDayLabel && <span className="arrival-next-day">{arrivalDayLabel}</span>}{arrivalKstTime}</strong><small>KST</small>
            </div>
          </div>
        </div>
      </div>
      <div className="flight-progress">
        <i className="progress-dots" /><i className="progress-line" /><b />
        <MdChevronRight className="progress-arrow" />
      </div>
      <div className="timeline-forecast">
        {flight.forecast.map(([time, icon, temp], index) => (
          <div
            className={index === flight.arrivalSlot ? "is-arrival" : ""}
            key={time}
          >
            <div className="rail-forecast-content rail-motion-unit" style={{ "--rail-item": 12 + index }}>
              <time>{displayForecastHour(time)}</time>
              <RailWeatherImage type={icon} />
              <WeatherCondition type={icon} />
              <strong>{displayTemperature(temp)}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RailRow({ flight, comparisonFlight, index, transitionKind }) {
  const [, localTime] = flight.localClock.split(" ");
  const variant = (...fields) => changedVariantClass(flight, comparisonFlight, fields);
  return (
    <article className={`rail-flight-row is-slot-${transitionKind}${transitionKind === "flight" ? " is-flight-variant-changing" : ""}`} data-testid="rail-flight-row" data-destination-code={flight.code} data-flight-key={flight.flightKey} style={{ "--order": index }}>
      <div className="rail-flight-info">
        <h2 className="rail-motion-unit" style={{ "--rail-item": 0 }}>{flight.city} <span>{flight.code}</span></h2>
        <div className="rail-local-clock"><span>현지 시각</span><strong>{localTime}</strong><b>{flight.localZone}</b></div>
        <div className="rail-flight-status">
          <span className={`rail-flight-number rail-motion-unit${variant('flight', 'airline', 'logo')}`} style={{ "--rail-item": 4 }}>
            {flight.logo
              ? <img src={flight.logo} alt={`${flight.airline} 로고`} />
              : <span className="airline-logo-fallback" aria-label={flight.airline}>{flight.flight.slice(0, 2)}</span>}
            <span className="rail-airline-meta">
              <strong>{flight.flight}</strong>
              <small>{flight.airline}</small>
            </span>
          </span>
          <span className={`${flight.statusTone} rail-motion-unit${variant('status', 'statusTone')}`} style={{ "--rail-item": 5 }}>{flight.status}</span>
        </div>
        <RailStats flight={flight} comparisonFlight={comparisonFlight} />
      </div>
      <ForecastTimeline flight={flight} comparisonFlight={comparisonFlight} />
    </article>
  );
}

function RailScreen({
  transitioning,
  activeFlights,
  pendingFlights,
  currentFrame,
  frameCount,
  flightCount,
  destinationCount,
  motionMode,
  onReplay,
  hasNext,
  onSelectMotion,
  onSelectView,
  clock,
  title,
  departureAirports,
  departureAirportIcao,
  departureAirportName,
  onSelectDepartureAirport,
}) {
  const slotTransitions = terminalSlotTransitions(activeFlights, pendingFlights);
  return (
    <section className={`exact-screen exact-rail rail-motion-${motionMode}`} data-testid="option-three">
      <PageIndicator currentFrame={currentFrame} frameCount={frameCount} />
      <header className="rail-header">
        <AgencyMascot />
        <TerminalTitle title={title} flightCount={flightCount} destinationCount={destinationCount} />
          <div className="rail-header-actions">
            <DepartureAirportSelect airports={departureAirports} selectedIcao={departureAirportIcao} onSelect={onSelectDepartureAirport} />
          <ViewSwitcher view="rail" onSelectView={onSelectView} />
          <MotionModeSwitcher
            motionMode={motionMode}
            onSelectMotion={onSelectMotion}
            modes={railMotionModes}
            ariaLabel="3안 전환 애니메이션"
          />
          <button type="button" className="next-board-button" onClick={onReplay} disabled={!hasNext}>
            <MdChevronRight /><span>다음 항공편</span>
          </button>
        </div>
        <div className="rail-header-clock"><span>{clock.date}</span><strong>{clock.time}</strong></div>
      </header>
      <div className="rail-viewport">
        {activeFlights.length === 0 ? <TerminalEmptyState airportName={departureAirportName} /> : <div className={`rail-page ${transitioning ? "is-leaving" : ""}`} data-testid="rail-active-page">
          {activeFlights.map((flight, index) => <RailRow flight={flight} comparisonFlight={pendingFlights[index]} index={index} transitionKind={slotTransitions[index]} key={`${index}-${flight.flightKey}`} />)}
        </div>}
        {transitioning && (
          <div className="rail-page is-entering" data-testid="rail-pending-page" aria-hidden="true">
            {pendingFlights.map((flight, index) => <RailRow flight={flight} comparisonFlight={activeFlights[index]} index={index} transitionKind={slotTransitions[index]} key={`${index}-${flight.flightKey}`} />)}
          </div>
        )}
      </div>
      <footer className="screen-footer rail-footer">
        <div className="screen-footer-note"><MdInfoOutline /><span>2026.08.02 13:00 KST 한국공항공사 운항스케줄 기준 · 도착 날씨는 참고용입니다.</span></div>
        <HeaderWeatherPanel showWordmark />
      </footer>
    </section>
  );
}

export function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState(params.get("view") === "rail" ? "rail" : "board");
  const [transitioning, setTransitioning] = useState(false);
  const [frameCursor, setFrameCursor] = useState(0);
  const [motionMode, setMotionMode] = useState(() => {
    const requestedMode = params.get("motion");
    return ["split", "roll", "wipe", "fade"].includes(requestedMode) ? requestedMode : "split";
  });
  const [railMotionMode, setRailMotionMode] = useState(() => {
    const requestedMode = params.get("railMotion");
    return ["cascade", "flap", "roll", "wipe", "fade"].includes(requestedMode) ? requestedMode : "cascade";
  });
  const [liveWeatherData, setLiveWeatherData] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [departureAirportIcao, setDepartureAirportIcao] = useState(() => departureAirportFromPathname(window.location.pathname) || params.get('departureAirport') || 'RKSS');
  const timer = useRef(null);
  const departureAirportState = useMemo(
    () => selectTerminalDepartureAirport(liveWeatherData?.airportCatalog, departureAirportIcao),
    [liveWeatherData, departureAirportIcao],
  );
  const selectedDepartureIcao = departureAirportState.selected?.icao || departureAirportIcao;
  const simulation = useMemo(() => buildTerminalSimulation(selectedDepartureIcao), [selectedDepartureIcao]);
  const hasNextFrame = hasTerminalNextFrame(simulation);
  const activeFrame = useMemo(() => terminalFrameAt(simulation, frameCursor), [simulation, frameCursor]);
  const pendingFrame = useMemo(() => terminalFrameAt(simulation, frameCursor + 1), [simulation, frameCursor]);
  const activeFlights = useMemo(() => liveWeatherData
    ? activeFrame.flights.map((flight) => mergeTerminalLiveWeather(flight, liveWeatherData))
    : activeFrame.flights, [activeFrame, liveWeatherData]);
  const pendingFlights = useMemo(() => liveWeatherData
    ? pendingFrame.flights.map((flight) => mergeTerminalLiveWeather(flight, liveWeatherData))
    : pendingFrame.flights, [pendingFrame, liveWeatherData]);

  useEffect(() => {
    let mounted = true;
    const refresh = () => loadTerminalLiveWeatherData().then((data) => {
      if (mounted) setLiveWeatherData(data);
    });
    refresh();
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const replay = useCallback(() => {
    if (transitioning || !hasNextFrame) return;
    setTransitioning(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setFrameCursor((current) => current + 1);
      setTransitioning(false);
    }, view === "board" ? 1800 : 1250);
  }, [hasNextFrame, transitioning, view]);

  useEffect(() => {
    if (params.get("autoplay") === "0") return undefined;
    const interval = window.setInterval(replay, 9000);
    return () => window.clearInterval(interval);
  }, [params, replay]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "1") setView("board");
      if (event.key === "3") setView("rail");
      if (event.key.toLowerCase() === "r") replay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const selectMotionMode = useCallback((mode) => {
    if (transitioning) return;
    setMotionMode(mode);
    window.requestAnimationFrame(() => replay());
  }, [replay, transitioning]);

  const selectRailMotionMode = useCallback((mode) => {
    if (transitioning) return;
    setRailMotionMode(mode);
    window.requestAnimationFrame(() => replay());
  }, [replay, transitioning]);

  const selectView = useCallback((nextView) => {
    window.clearTimeout(timer.current);
    setTransitioning(false);
    setView(nextView);
  }, []);

  const koreanClock = formatKoreanClock(now);
  const terminalTitle = `${departureAirportState.selected?.nameKo?.replace('국제', '') || '김포공항'} 도착지 날씨`;
  const selectDepartureAirport = useCallback((icao) => {
    window.clearTimeout(timer.current);
    setTransitioning(false);
    setFrameCursor(0);
    setDepartureAirportIcao(icao);
    const nextUrl = new URL(window.location.href);
    nextUrl.pathname = `/terminal/${icao.toLowerCase()}`;
    nextUrl.searchParams.delete('departureAirport');
    window.history.replaceState(null, '', nextUrl);
  }, []);
  return (
    <main className="prototype-shell">
      {view === "board" ? (
        <BoardScreen
          transitioning={transitioning}
          activeFlights={activeFlights}
          pendingFlights={pendingFlights}
          currentFrame={activeFrame.frameIndex}
          frameCount={activeFrame.frameCount}
          flightCount={simulation.totalFlights}
          destinationCount={simulation.totalDestinations}
          motionMode={motionMode}
          onReplay={replay}
          hasNext={hasNextFrame}
          onSelectMotion={selectMotionMode}
          onSelectView={selectView}
          clock={koreanClock}
          title={terminalTitle}
          departureAirports={departureAirportState.options}
          departureAirportIcao={selectedDepartureIcao}
          departureAirportName={departureAirportState.selected?.nameKo || '김포공항'}
          onSelectDepartureAirport={selectDepartureAirport}
        />
      ) : (
        <RailScreen
          transitioning={transitioning}
          activeFlights={activeFlights}
          pendingFlights={pendingFlights}
          currentFrame={activeFrame.frameIndex}
          frameCount={activeFrame.frameCount}
          flightCount={simulation.totalFlights}
          destinationCount={simulation.totalDestinations}
          motionMode={railMotionMode}
          onReplay={replay}
          hasNext={hasNextFrame}
          onSelectMotion={selectRailMotionMode}
          onSelectView={selectView}
          clock={koreanClock}
          title={terminalTitle}
          departureAirports={departureAirportState.options}
          departureAirportIcao={selectedDepartureIcao}
          departureAirportName={departureAirportState.selected?.nameKo || '김포공항'}
          onSelectDepartureAirport={selectDepartureAirport}
        />
      )}
    </main>
  );
}
