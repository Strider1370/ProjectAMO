import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdChevronRight, MdInfoOutline } from "react-icons/md";
import { WiCloud, WiCloudy, WiDayCloudy, WiDaySunny, WiRain, WiShowers, WiThunderstorm } from "react-icons/wi";
import clearDay from "../../assets/weather-icons/basmilius/clear-day.svg";
import clearNight from "../../assets/weather-icons/basmilius/clear-night.svg";
import snowDay from "../../assets/weather-icons/basmilius/snow-day.svg";
import boardHeaderPlane from "./assets/board-header-plane.png";
import forecastCloud from "./assets/forecast-cloud-transparent.png";
import forecastPartly from "./assets/forecast-partly-transparent.png";
import forecastRain from "./assets/forecast-rain-transparent.png";
import forecastStorm from "./assets/forecast-storm-transparent.png";
import { airlineLogoFor } from "./components/airlineLogoRegistry.js";
import { TERMINAL_FLIGHT_GROUPS } from "./data/terminalFixtures.js";
import { formatArrivalKorea } from "./model/terminalDisplayModel.js";

const icons = {
  clear: WiDaySunny,
  partly: WiDayCloudy,
  mostlyCloudy: WiCloud,
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
  clear: clearDay,
  rain: forecastRain,
  partly: forecastPartly,
  mostlyCloudy: forecastCloud,
  cloudy: forecastCloud,
  shower: forecastRain,
  snow: snowDay,
  storm: forecastRain,
};

const boardForecastAssets = {
  clear: clearDay,
  rain: forecastRain,
  partly: forecastPartly,
  mostlyCloudy: forecastCloud,
  cloudy: forecastCloud,
  shower: forecastRain,
  snow: snowDay,
  storm: forecastStorm,
};

const fallbackWeatherAsset = forecastCloud;

function clearWeatherAsset(point) {
  const hour = Number(point.time?.slice(0, 2));
  return hour >= 18 || hour < 6 ? clearNight : clearDay;
}

function BoardWeatherImage({ point, small = false }) {
  const type = point.type;
  const source = type === "clear" ? clearWeatherAsset(point) : (small ? boardForecastAssets : boardWeatherAssets)[type] ?? fallbackWeatherAsset;
  const opticalClass = small ? ` weather-image weather-image--${type}` : "";
  return <img className={opticalClass.trim()} src={source} alt="" aria-hidden="true" />;
}

const railWeatherAssets = {
  clear: clearDay,
  partly: boardForecastAssets.partly,
  mostlyCloudy: boardForecastAssets.mostlyCloudy,
  cloudy: boardForecastAssets.cloudy,
  rain: boardForecastAssets.rain,
  shower: boardForecastAssets.shower,
  snow: boardForecastAssets.snow,
  storm: boardForecastAssets.storm,
};

function weatherText(point) {
  return point.available ? point.label : point.fallback;
}

function currentMetric(value, unit) {
  return typeof value === "number" ? `${value}${unit}` : value;
}

function WeatherCondition({ point, className = "", style }) {
  return <em className={`weather-condition ${className}`.trim()} style={style}>{weatherText(point)}</em>;
}

function RailWeatherImage({ point }) {
  const source = point.type === "clear" ? clearWeatherAsset(point) : railWeatherAssets[point.type] ?? fallbackWeatherAsset;
  return <img className={`weather-image weather-image--${point.type ?? "unavailable"}`} src={source} alt="" aria-hidden="true" />;
}

function AirlineLogo({ flight }) {
  return (
    <div className={`airline-logo airline-logo--${flight.destination.code.toLowerCase()}`}>
      <img src={airlineLogoFor(flight.airline.logoKey)} alt={`${flight.airline.name} 로고`} />
    </div>
  );
}

function FlightDataSurface({ flight, variant, children }) {
  const { phase } = flight.dataState;
  if (phase === "loading" || phase === "error") {
    const copy = phase === "loading" ? "운항 정보를 불러오는 중입니다" : "운항 정보를 불러오지 못했습니다";
    const geometry = variant === "board" ? "board-column" : "rail-flight-row";
    return <article className={`${geometry} terminal-data-surface terminal-data-surface--${variant} terminal-data-surface--${phase}`}>{copy}</article>;
  }
  return children;
}

function destinationDisplayName(destination) {
  return destination.displayName;
}

function BoardColumn({ flight, columnIndex, weatherCitySlot }) {
  const bandStyle = (band) => ({ "--band": band, "--column": columnIndex });
  const rollStyle = (item) => ({ "--item": item });
  const { destination, airline, operation, clocks, weather } = flight;
  const current = weather.current;
  const forecast = [weather.arrival, ...weather.afterArrival];
  return (
    <FlightDataSurface flight={flight} variant="board"><article className="board-column">
      {flight.dataState.phase === "partial" && <p className="terminal-data-surface terminal-data-surface--board terminal-data-surface--partial">일부 정보 확인 중</p>}
      <div className="board-band" style={bandStyle(0)}>
        <div className="board-band-surface">
          <div className="board-destination">
            <div>
              <h2>
                <span className="destination-name roll-unit flap-unit" style={rollStyle(0)}>{destinationDisplayName(flight.destination)}</span>{" "}
                <span className="destination-code roll-unit flap-unit" style={rollStyle(1)}>{destination.code}</span>
              </h2>
              <div className="board-destination-meta">
                <div className="destination-clock roll-unit flap-unit" style={rollStyle(3)}>
                  <span>현지 시각</span><strong>{clocks.destinationNow}</strong><b>{destination.timezone}</b>
                  <small>{clocks.destinationDate} · 한국 {clocks.koreaNow} KST</small>
                </div>
              </div>
            </div>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(1)}>
        <div className="board-band-surface">
          <div className="airline-block">
            <div className="roll-unit flap-unit" style={rollStyle(0)}><AirlineLogo flight={flight} /></div>
            <div>
              <strong className="roll-unit flap-unit" style={rollStyle(1)}>{airline.flightNumber}</strong>
              <span className="roll-unit flap-unit" style={rollStyle(2)}>{airline.name}</span>
            </div>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(2)}>
        <div className="board-band-surface">
          <div className="schedule-grid">
            <div>
              <span className="roll-unit" style={rollStyle(0)}>출발 예정</span>
              <strong className="roll-unit flap-unit" style={rollStyle(1)}>{operation.departure}</strong>
            </div>
            <div>
              <span className="roll-unit" style={rollStyle(2)}>탑승구</span>
              <strong className="roll-unit flap-unit" style={rollStyle(3)}>{operation.gate}</strong>
            </div>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(3)}>
        <div className="board-band-surface">
          <div className={`operation-status ${operation.tone}`}>
            <span className="roll-unit" style={rollStyle(0)}>운항 상태</span>
            <i className="roll-unit flap-unit" style={rollStyle(1)} />
            <strong className="roll-unit flap-unit" style={rollStyle(2)}>{operation.status}</strong>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(4)}>
        <div className="board-band-surface">
          <p className="section-label" style={{ "--weather-city-slot": weatherCitySlot }}>
            <span className="roll-unit" style={rollStyle(0)}>현재</span>{" "}
            <span className="roll-unit flap-unit" style={rollStyle(1)}>{destination.city}</span>{" "}
            <span className="roll-unit" style={rollStyle(2)}>날씨</span>
          </p>
          <div className="current-weather">
            <div className="temperature">
              <span className="weather-icon-stack roll-unit flap-unit" style={rollStyle(3)}>
                <BoardWeatherImage point={current} />
                <WeatherCondition point={current} />
              </span>
              <strong className="roll-unit flap-unit" style={rollStyle(4)}>{current.available ? current.temperature : current.fallback}<small>{current.available && "℃"}</small></strong>
            </div>
            <dl>
              <div className="roll-unit" style={rollStyle(5)}><dt>체감</dt><dd className="flap-unit">{current.available ? currentMetric(current.feelsLike, "℃") : current.fallback}</dd></div>
              <div className="roll-unit" style={rollStyle(6)}><dt>습도</dt><dd className="flap-unit">{current.available ? currentMetric(current.humidity, "%") : current.fallback}</dd></div>
              <div className="roll-unit" style={rollStyle(7)}><dt>바람</dt><dd className="flap-unit">{current.available ? current.wind : current.fallback}</dd></div>
            </dl>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(5)}>
        <div className="board-band-surface">
          <div className="arrival-time">
            <span className="roll-unit" style={rollStyle(0)}>도착 예정</span>
            <strong className="roll-unit flap-unit" style={rollStyle(1)}>{clocks.arrivalLocal}</strong>
            <small className="roll-unit flap-unit" style={rollStyle(2)}>(현지 시각 · 한국 {formatArrivalKorea({ time: clocks.arrivalKorea, dayOffset: clocks.arrivalKoreaDayOffset })} KST)</small>
          </div>
          <div className="board-forecast">
            {forecast.map((point, index) => (
              <div className={index === 0 ? "is-arrival" : ""} key={point.time ?? index}>
                <time className="roll-unit flap-unit" style={rollStyle(3 + index * 4)}>{point.available ? point.time : point.fallback}</time>
                <span className="roll-unit flap-unit" style={rollStyle(4 + index * 4)}><BoardWeatherImage point={point} small /></span>
                <WeatherCondition point={point} className="roll-unit flap-unit" style={rollStyle(5 + index * 4)} />
                <strong className="roll-unit flap-unit" style={rollStyle(6 + index * 4)}>{point.available ? `${point.temperature}℃` : point.fallback}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article></FlightDataSurface>
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

function PageIndicator({ currentPage, pageCount }) {
  return (
    <div
      className="page-indicator"
      role="status"
      aria-label={`${pageCount}페이지 중 ${currentPage + 1}페이지`}
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <i className={index === currentPage ? "is-current" : ""} aria-hidden="true" key={index} />
      ))}
    </div>
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

function BoardScreen({ transitioning, activeFlights, pendingFlights, currentPage, pageCount, motionMode, onReplay, onSelectMotion, onSelectView }) {
  return (
    <section className={`exact-screen exact-board motion-${motionMode}`} data-testid="option-one">
      <PageIndicator currentPage={currentPage} pageCount={pageCount} />
      <header className="board-header">
        <img src={boardHeaderPlane} alt="" aria-hidden="true" />
        <h1>곧 출발하는 항공편 · 목적지 날씨</h1>
        <div className="board-header-actions">
          <ViewSwitcher view="board" onSelectView={onSelectView} />
          <MotionModeSwitcher motionMode={motionMode} onSelectMotion={onSelectMotion} />
          <button type="button" className="next-board-button" onClick={onReplay}>
            <MdChevronRight /><span>다음 3편</span>
          </button>
        </div>
        <div className="board-header-clock"><span>한국 시각</span><strong>06:32</strong><small>2026-07-30 (목) · KST</small></div>
      </header>
      <div className="board-viewport">
        <div className={`board-page ${transitioning ? "is-leaving" : ""}`}>
          {activeFlights.map((flight, index) => (
            <Fragment key={flight.id}>
              <BoardColumn
                flight={flight}
                columnIndex={index}
                weatherCitySlot={`${Math.max(flight.destination.city.length, pendingFlights[index]?.destination.city.length ?? 0)}em`}
              />
              {index < activeFlights.length - 1 && <i className="board-column-separator" aria-hidden="true" />}
            </Fragment>
          ))}
        </div>
        {transitioning && (
          <div className="board-page is-entering" aria-hidden="true">
            {pendingFlights.map((flight, index) => (
              <Fragment key={flight.id}>
                <BoardColumn
                  flight={flight}
                  columnIndex={index}
                  weatherCitySlot={`${Math.max(flight.destination.city.length, activeFlights[index]?.destination.city.length ?? 0)}em`}
                />
                {index < pendingFlights.length - 1 && <i className="board-column-separator" aria-hidden="true" />}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <footer className="board-footer">
        <MdInfoOutline />
        <span>도착 현지 시간 기준 · 예보는 참고용이며, 실제 날씨와 다를 수 있습니다.</span>
        <b>다음 업데이트&nbsp;&nbsp; <strong>06:45</strong>&nbsp; KST</b>
      </footer>
    </section>
  );
}

function RailStats({ flight }) {
  return (
    <div className="rail-stats">
      <div>
        <span>출발</span>
        <div className="rail-motion-unit" style={{ "--rail-item": 6 }}><strong>{flight.operation.departure}</strong>{flight.operation.revisedDeparture && <em>{flight.operation.revisedDeparture}</em>}</div>
      </div>
      <div>
        <span>예상 비행시간</span>
        <div className="rail-motion-unit" style={{ "--rail-item": 7 }}><strong>{flight.operation.duration}</strong></div>
      </div>
      <div>
        <span>탑승구</span>
        <div className="rail-motion-unit" style={{ "--rail-item": 8 }}><strong>{flight.operation.gate}</strong></div>
      </div>
    </div>
  );
}

function ForecastTimeline({ flight }) {
  return (
    <div className="timeline">
      <div className="timeline-arrival-grid">
        <div className="progress-label progress-label--arrival">
          <span className="progress-label__title">예상 도착</span>
          <div className="arrival-clocks">
            <div className="progress-clock">
              <span>현지</span><strong className="rail-motion-unit" style={{ "--rail-item": 9 }}>{flight.clocks.arrivalLocal}</strong>
            </div>
            <div className="progress-clock">
              <span>한국</span><strong className="rail-motion-unit" style={{ "--rail-item": 10 }}>{formatArrivalKorea({ time: flight.clocks.arrivalKorea, dayOffset: flight.clocks.arrivalKoreaDayOffset })}</strong><small>KST</small>
            </div>
          </div>
        </div>
      </div>
      <div className="flight-progress">
        <i className="progress-dots" /><i className="progress-line" /><b />
        <MdChevronRight className="progress-arrow" />
      </div>
      <div className="pre-arrival-forecast">
        <span>도착 1시간 전</span>
        <div className="pre-arrival-values rail-motion-unit" style={{ "--rail-item": 11 }}>
          <time>{flight.weather.preArrival.available ? flight.weather.preArrival.time : flight.weather.preArrival.fallback}</time>
          <RailWeatherImage point={flight.weather.preArrival} />
          <WeatherCondition point={flight.weather.preArrival} />
          <strong>{flight.weather.preArrival.available ? `${flight.weather.preArrival.temperature}℃` : flight.weather.preArrival.fallback}</strong>
        </div>
      </div>
      <div className="timeline-forecast">
        {[flight.weather.arrival, ...flight.weather.afterArrival].map((point, index) => (
          <div
            className={index === 0 ? "is-arrival" : ""}
            key={point.time ?? index}
          >
            <div className="rail-forecast-content rail-motion-unit" style={{ "--rail-item": 12 + index }}>
              <time>{point.available ? point.time : point.fallback}</time>
              <RailWeatherImage point={point} />
              <WeatherCondition point={point} />
              <strong>{point.available ? `${point.temperature}℃` : point.fallback}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RailRow({ flight, index }) {
  return (
    <FlightDataSurface flight={flight} variant="rail"><article className="rail-flight-row" style={{ "--order": index }}>
      {flight.dataState.phase === "partial" && <p className="terminal-data-surface terminal-data-surface--rail terminal-data-surface--partial">일부 정보 확인 중</p>}
      <div className="rail-flight-info">
        <h2 className="rail-motion-unit" style={{ "--rail-item": 0 }}>{destinationDisplayName(flight.destination)} <span>{flight.destination.code}</span></h2>
        <div className="rail-local-clock">
          <span>현지 시각</span>
          <strong className="rail-motion-unit" style={{ "--rail-item": 1 }}>{flight.clocks.destinationNow}</strong>
          <b className="rail-motion-unit" style={{ "--rail-item": 2 }}>{flight.destination.timezone}</b>
          <small className="rail-motion-unit" style={{ "--rail-item": 3 }}>{flight.clocks.destinationDate} · 한국 {flight.clocks.koreaNow} KST</small>
        </div>
        <div className="rail-flight-status">
          <span className="rail-flight-number rail-motion-unit" style={{ "--rail-item": 4 }}>
            <img src={airlineLogoFor(flight.airline.logoKey)} alt={`${flight.airline.name} 로고`} />
            <strong>{flight.airline.flightNumber}</strong>
          </span>
          <span className={`${flight.operation.tone} rail-motion-unit`} style={{ "--rail-item": 5 }}>{flight.operation.status}</span>
        </div>
        <RailStats flight={flight} />
      </div>
      <ForecastTimeline flight={flight} />
    </article></FlightDataSurface>
  );
}

function RailScreen({
  transitioning,
  activeFlights,
  pendingFlights,
  currentPage,
  pageCount,
  motionMode,
  onReplay,
  onSelectMotion,
  onSelectView,
}) {
  return (
    <section className={`exact-screen exact-rail rail-motion-${motionMode}`} data-testid="option-three">
      <PageIndicator currentPage={currentPage} pageCount={pageCount} />
      <header className="rail-header">
        <h1>곧 출발 · 도착지 예보</h1><span>도착 현지 시간 기준 예보</span>
        <div className="rail-header-actions">
          <ViewSwitcher view="rail" onSelectView={onSelectView} />
          <MotionModeSwitcher
            motionMode={motionMode}
            onSelectMotion={onSelectMotion}
            modes={railMotionModes}
            ariaLabel="3안 전환 애니메이션"
          />
          <button type="button" className="next-board-button" onClick={onReplay}>
            <MdChevronRight /><span>다음 3편</span>
          </button>
        </div>
        <div className="rail-header-clock"><small>7월 30일 (목)</small><strong>09:15</strong><b>KST</b></div>
      </header>
      <div className="rail-viewport">
        <div className={`rail-page ${transitioning ? "is-leaving" : ""}`}>
          {activeFlights.map((flight, index) => <RailRow flight={flight} index={index} key={flight.id} />)}
        </div>
        {transitioning && (
          <div className="rail-page is-entering" aria-hidden="true">
            {pendingFlights.map((flight, index) => <RailRow flight={flight} index={index} key={flight.id} />)}
          </div>
        )}
      </div>
      <footer><MdInfoOutline /><span>도착 현지 시간 기준 · 예보는 참고용이며, 실제 날씨와 다를 수 있습니다.</span><b>다음 업데이트&nbsp;&nbsp; <strong>09:30</strong>&nbsp; KST</b></footer>
    </section>
  );
}

export function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [view, setView] = useState(params.get("view") === "rail" ? "rail" : "board");
  const [transitioning, setTransitioning] = useState(false);
  const [activeBoardGroup, setActiveBoardGroup] = useState(0);
  const [activeRailGroup, setActiveRailGroup] = useState(0);
  const [motionMode, setMotionMode] = useState(() => {
    const requestedMode = params.get("motion");
    return ["split", "roll", "wipe", "fade"].includes(requestedMode) ? requestedMode : "split";
  });
  const [railMotionMode, setRailMotionMode] = useState(() => {
    const requestedMode = params.get("railMotion");
    return ["cascade", "flap", "roll", "wipe", "fade"].includes(requestedMode) ? requestedMode : "cascade";
  });
  const timer = useRef(null);

  const replay = useCallback(() => {
    if (transitioning) return;
    setTransitioning(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (view === "board") {
        setActiveBoardGroup((current) => (current + 1) % TERMINAL_FLIGHT_GROUPS.length);
      } else {
        setActiveRailGroup((current) => (current + 1) % TERMINAL_FLIGHT_GROUPS.length);
      }
      setTransitioning(false);
    }, view === "board" ? 1800 : 1250);
  }, [transitioning, view]);

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

  const pendingBoardGroup = (activeBoardGroup + 1) % TERMINAL_FLIGHT_GROUPS.length;
  const pendingRailGroup = (activeRailGroup + 1) % TERMINAL_FLIGHT_GROUPS.length;
  return (
    <main className="prototype-shell">
      {view === "board" ? (
        <BoardScreen
          transitioning={transitioning}
          activeFlights={TERMINAL_FLIGHT_GROUPS[activeBoardGroup]}
          pendingFlights={TERMINAL_FLIGHT_GROUPS[pendingBoardGroup]}
          currentPage={activeBoardGroup}
          pageCount={TERMINAL_FLIGHT_GROUPS.length}
          motionMode={motionMode}
          onReplay={replay}
          onSelectMotion={selectMotionMode}
          onSelectView={selectView}
        />
      ) : (
        <RailScreen
          transitioning={transitioning}
          activeFlights={TERMINAL_FLIGHT_GROUPS[activeRailGroup]}
          pendingFlights={TERMINAL_FLIGHT_GROUPS[pendingRailGroup]}
          currentPage={activeRailGroup}
          pageCount={TERMINAL_FLIGHT_GROUPS.length}
          motionMode={railMotionMode}
          onReplay={replay}
          onSelectMotion={selectRailMotionMode}
          onSelectView={selectView}
        />
      )}
    </main>
  );
}
