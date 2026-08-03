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
import { kstClockFromIso, loadTerminalLiveWeatherData, mergeTerminalLiveWeather } from './terminalLiveData.js';
import { departureAirportFromPathname, selectTerminalDepartureAirport } from './terminalAirportSelection.js';
import { terminalCanvasScale } from './terminalCanvasScale.js';
import {
  TERMINAL_SIMULATION_REFERENCE,
  buildTerminalSimulation,
  classifyTerminalSlotTransition,
  hasTerminalNextFrame,
  nextDisplayedSimulation,
  terminalFlightsFromFeed,
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
  // 맑음이 빠져 있으면 흐림 아이콘으로 떨어져, 문구는 `맑음`인데 그림은 구름이 된다.
  sun: forecastPartly,
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

const GATE_CHANGED_STATUS = "탑승구 변경";

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

/**
 * 공동운항편은 편명이 여럿이라 한 칸에 다 못 넣는다(44px 두 개면 373px, 칸은 337px).
 * 순번을 돌려 하나씩 보여주고, 항공사 이름과 로고도 함께 바꾼다.
 * 편명이 하나뿐이면 그대로 둔다.
 */
function withCodeshare(flight, turn) {
  const shares = flight.codeshares;
  if (!shares || shares.length < 2) return flight;
  const share = shares[turn % shares.length];
  return { ...flight, flight: share.flight, airline: share.airline, logo: share.logo };
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

function BoardColumn({ flight: rawFlight, comparisonFlight, columnIndex, weatherCitySlot, transitionKind, codeshareTurn }) {
  const flight = withCodeshare(rawFlight, codeshareTurn);
  const bandStyle = (band) => ({ "--band": band, "--column": columnIndex });
  const rollStyle = (item) => ({ "--item": item });
  const variant = (...fields) => changedVariantClass(flight, comparisonFlight, fields);
  // 공동운항편만 편명이 돌아간다. 그때만 flap을 걸고, key를 바꿔 다시 마운트해야 애니메이션이 재생된다.
  const isCodeshare = rawFlight.codeshares?.length >= 2;
  const flap = isCodeshare ? " codeshare-flap" : "";
  const flapKey = isCodeshare ? codeshareTurn : 0;
  const shareIndex = isCodeshare ? codeshareTurn % rawFlight.codeshares.length : 0;
  const isDelayed = Boolean(flight.revised);
  // 이전 탑승구를 비교해 알아내지 않는다. API가 주는 상태 단어를 그대로 믿는다.
  const isGateChanged = flight.status === GATE_CHANGED_STATUS;
  const hasArrivalTime = flight.arrivalKst !== "확인 중";
  // 목적지가 한국이면 현지 시각도 KST 표기도 군더더기다. 화면 상단 시계가 이미 그 기준이다.
  const isDomesticDestination = flight.localZone === "KST";
  // 시차를 모르는 목적지는 `현지 시각 미정`이 되는데, 이건 승객에게 아무것도 알려주지 않는다.
  const showLocalClock = Boolean(flight.localZone) && !isDomesticDestination;
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
            <div className={`roll-unit flap-unit${flap}${variant('logo', 'airline')}`} style={rollStyle(0)} key={`logo-${flapKey}`}><AirlineLogo flight={flight} /></div>
            <div className="airline-flight-meta">
              <div className="airline-flight-line">
                <strong className={`roll-unit flap-unit${flap}${variant('flight')}`} style={rollStyle(1)} key={`flight-${flapKey}`}>{flight.flight}</strong>
                {/* 편명이 3초마다 도는 이유를 승객이 알 길이 없다. 배지가 사실을, 점이 순번을 알려준다. */}
                {isCodeshare && (
                  <span className="codeshare-badge-group">
                    <b className="codeshare-badge">공동운항</b>
                    <span className="codeshare-dots" role="img" aria-label={`공동운항 편명 ${rawFlight.codeshares.length}개 중 ${shareIndex + 1}번째`}>
                      {rawFlight.codeshares.map((share, index) => <i key={share.flight} className={index === shareIndex ? "is-current" : undefined} />)}
                    </span>
                  </span>
                )}
              </div>
              <span className={`roll-unit flap-unit${flap}${variant('airline')}`} style={rollStyle(2)} key={`airline-${flapKey}`}>{flight.airline}</span>
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
              {/* 지금 유효한 시각 하나만 크게 보여준다. 옛 시각은 붙이지 않는다 —
                  공항공사 API도 값 하나에 `지연`이라는 상태 단어를 따로 주는 구조이고,
                  옆 상태 칸이 이미 그 단어를 띄우고 있다. */}
              <div className={`departure-time${isDelayed ? " is-delayed" : ""}`}>
                <strong className={`roll-unit flap-unit${variant('revised', 'departure')}`} style={rollStyle(1)}>{flight.revised ?? flight.departure}</strong>
              </div>
            </div>
            <div>
              <span className="roll-unit" style={rollStyle(3)}>탑승구</span>
              {/* 탑승구가 바뀌면 처음 안내받은 번호를 취소선으로 남긴다. 표를 들고 온 승객이
                  자기가 아는 번호를 화면에서 찾을 수 있어야 어디로 가야 할지 이어진다. */}
              {/* 바뀐 탑승구도 지금 번호만 보여준다. 바뀌었다는 사실은 상태 칸의 `탑승구 변경`이 말한다. */}
              <div className={`gate-value${isGateChanged ? " is-changed" : ""}`}>
                <strong className={`roll-unit flap-unit${variant('gate')}`} style={rollStyle(4)}>{flight.gate}</strong>
              </div>
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
            {showLocalClock && <div className="current-weather-clock roll-unit flap-unit" style={rollStyle(2)}>
              <div className="local-clock-main"><span>현지 시각</span>{showLocalDate && <time>{localDate}</time>}<strong>{localTime}</strong><b>{flight.localZone}</b></div>
            </div>}
          </div>
          <div className="current-weather">
            <div className="temperature">
              <span className="weather-icon-stack roll-unit flap-unit" style={rollStyle(3)}>
                <BoardWeatherImage type={flight.current.icon} />
                <WeatherCondition type={flight.current.icon} />
              </span>
              <strong className="roll-unit flap-unit" style={rollStyle(4)}>{flight.current.temp == null ? <em className="value-unknown">확인 중</em> : <>{flight.current.temp}<small>°C</small></>}</strong>
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
          {/* 도착 시각을 모르는 국제선은 이 줄 자체를 없앤다. `확인 중`을 크게 띄우면
              모른다는 사실이 도착 시각 자리를 차지해 승객이 읽을 것이 줄어든다. 예보는 그대로 남는다. */}
          {/* 제목은 국내·국제가 같다. 도착 시각을 아는 편만 오른쪽에 시각을 덧붙인다. */}
          <div className="arrival-time">
            <span className="arrival-forecast-label roll-unit" style={rollStyle(0)}>도착공항 예보</span>
            {hasArrivalTime && <strong className={`arrival-time-value roll-unit flap-unit${variant('arrival', 'localZone')}`} style={rollStyle(1)}>{flight.arrival}{!isDomesticDestination && <b>{flight.localZone}</b>}</strong>}
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

function TerminalEmptyState({ airportName, referenceClock }) {
  return (
    <div className="terminal-empty-state" role="status">
      <strong>오늘 더 이상 출발 예정인 항공편이 없습니다</strong>
      <span>{airportName} · {referenceClock} 기준</span>
    </div>
  );
}

function TerminalTitle({ title, flightCount, destinationCount }) {
  return <h1>{title}{flightCount > 0 && <small>총 {flightCount}편 · {destinationCount}개 목적지</small>}</h1>;
}

function BoardScreen({ codeshareTurn, dataClock, transitioning, activeFlights, pendingFlights, currentFrame, frameCount, flightCount, destinationCount, motionMode, onReplay, hasNext, onSelectMotion, onSelectView, clock, title, departureAirports, departureAirportIcao, departureAirportName, onSelectDepartureAirport }) {
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
        {activeFlights.length === 0 ? <TerminalEmptyState airportName={departureAirportName} referenceClock={clock.time} /> : <div className={`board-page ${transitioning ? "is-leaving" : ""}`} data-testid="board-active-page">
          {activeFlights.map((flight, index) => (
            <Fragment key={`${index}-${flight.flightKey}`}>
              <BoardColumn
                flight={flight}
                comparisonFlight={pendingFlights[index]}
                columnIndex={index}
                weatherCitySlot={`${Math.max(flight.city.length, pendingFlights[index]?.city.length ?? 0)}em`}
                transitionKind={slotTransitions[index]}
                codeshareTurn={codeshareTurn}
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
                  codeshareTurn={codeshareTurn}
                />
                {index < pendingFlights.length - 1 && <i className={`board-column-separator is-slot-${slotTransitions[index + 1]}`} aria-hidden="true" />}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <footer className="screen-footer board-footer">
        <div className="screen-footer-note"><MdInfoOutline /><span>{dataClock} KST 한국공항공사 실시간 운항정보 기준 · 도착 날씨는 참고용입니다.</span></div>
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
        <div className={`rail-motion-unit${variant('revised', 'departure')}${flight.revised ? " is-delayed" : ""}`} style={{ "--rail-item": 6 }}><strong>{flight.revised ?? flight.departure}</strong></div>
      </div>
      <div>
        <span>예상 비행시간</span>
        <div className={`rail-motion-unit${variant('duration')}`} style={{ "--rail-item": 7 }}><strong>{flight.duration}</strong></div>
      </div>
      <div>
        <span>탑승구</span>
        <div className={`rail-motion-unit${variant('gate')}${flight.status === GATE_CHANGED_STATUS ? " is-delayed" : ""}`} style={{ "--rail-item": 8 }}><strong>{flight.gate}</strong></div>
      </div>
    </div>
  );
}

function ForecastTimeline({ flight, comparisonFlight }) {
  const { dayLabel: arrivalDayLabel, time: arrivalKstTime } = splitArrivalKst(flight.arrivalKst);
  const hasArrivalTime = flight.arrivalKst !== "확인 중";
  const isDomesticDestination = flight.localZone === "KST";
  const variant = (...fields) => changedVariantClass(flight, comparisonFlight, fields);
  return (
    <div className="timeline">
      {/* 1안과 같은 규칙 — 도착 시각을 모르면 시각 대신 예보 제목으로 그 자리를 채운다.
          목적지가 한국이면 현지·한국을 나눌 이유가 없으므로 한 줄만 남긴다. */}
      <div className="timeline-arrival-grid">
        <div className="progress-label progress-label--arrival">
          <span className="progress-label__title">도착공항 예보</span>
          {hasArrivalTime && <div className="arrival-clocks">
            <div className="progress-clock">
              {!isDomesticDestination && <span>현지</span>}
              <strong className={`rail-motion-unit${variant('arrival', 'localZone')}`} style={{ "--rail-item": 9 }}>{flight.arrival}</strong>
            </div>
            {!isDomesticDestination && <div className="progress-clock">
              <span>한국</span><strong className={`rail-motion-unit${variant('arrivalKst')}`} style={{ "--rail-item": 10 }}>{arrivalDayLabel && <span className="arrival-next-day">{arrivalDayLabel}</span>}{arrivalKstTime}</strong><small>KST</small>
            </div>}
          </div>}
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

function RailRow({ flight: rawFlight, comparisonFlight, index, transitionKind, codeshareTurn }) {
  const flight = withCodeshare(rawFlight, codeshareTurn);
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
  dataClock,
  codeshareTurn,
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
        {activeFlights.length === 0 ? <TerminalEmptyState airportName={departureAirportName} referenceClock={clock.time} /> : <div className={`rail-page ${transitioning ? "is-leaving" : ""}`} data-testid="rail-active-page">
          {activeFlights.map((flight, index) => <RailRow flight={flight} comparisonFlight={pendingFlights[index]} index={index} transitionKind={slotTransitions[index]} codeshareTurn={codeshareTurn} key={`${index}-${flight.flightKey}`} />)}
        </div>}
        {transitioning && (
          <div className="rail-page is-entering" data-testid="rail-pending-page" aria-hidden="true">
            {pendingFlights.map((flight, index) => <RailRow flight={flight} comparisonFlight={activeFlights[index]} index={index} transitionKind={slotTransitions[index]} codeshareTurn={codeshareTurn} key={`${index}-${flight.flightKey}`} />)}
          </div>
        )}
      </div>
      <footer className="screen-footer rail-footer">
        <div className="screen-footer-note"><MdInfoOutline /><span>{dataClock} KST 한국공항공사 실시간 운항정보 기준 · 도착 날씨는 참고용입니다.</span></div>
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
  const flightFeed = liveWeatherData?.flights;
  const nextSimulation = useMemo(() => {
    const rows = flightFeed?.airports?.[selectedDepartureIcao];
    const reference = rows && kstClockFromIso(flightFeed.fetched_at);
    // 실제 운항 데이터를 못 받으면 검증된 fixture로 계속 돈다. 빈 화면보다 낫다.
    if (!rows || !reference) return buildTerminalSimulation(selectedDepartureIcao);
    return buildTerminalSimulation(selectedDepartureIcao, {
      flights: terminalFlightsFromFeed(rows),
      referenceTime: reference.time,
      kstClock: reference.clock,
    });
  }, [selectedDepartureIcao, flightFeed]);
  // 화면에 걸린 편성. 새 데이터가 들어와도 순환 한 바퀴가 끝날 때까지 갈아치우지 않는다.
  const [simulation, setSimulation] = useState(nextSimulation);
  useEffect(() => {
    setSimulation((current) => nextDisplayedSimulation(current, nextSimulation, frameCursor));
  }, [nextSimulation, frameCursor]);

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
    // 수집기가 1분마다 돌므로 화면도 1분마다 가져온다. 5분이면 지연·탑승구 변경이 그만큼 늦게 뜬다.
    // 모두 우리 서버 호출이고 바뀐 게 없으면 304로 끝나므로, 외부 API 호출량과는 무관하다.
    const interval = window.setInterval(refresh, 60 * 1000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  // 공동운항편은 편명이 여럿인데 한 칸에 다 안 들어간다(44px 두 개 373px vs 칸 337px).
  // 3초마다 하나씩 돌린다. 스펙 2.3의 "3초 안에 찾을 수 있어야 한다"와 같은 값이라
  // 어느 순간에 봐도 편명 하나는 온전히 읽힌다. 계속 구르면 하필 구르는 중일 때 못 읽는다.
  const [codeshareTurn, setCodeshareTurn] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setCodeshareTurn((turn) => turn + 1), 3000);
    return () => window.clearInterval(interval);
  }, []);

  // 화면 크기가 바뀔 때마다 배율만 다시 계산한다. 브라우저 확대와 모니터 교체도 여기 걸린다.
  const [canvasScale, setCanvasScale] = useState(() => terminalCanvasScale(window.innerWidth));
  useEffect(() => {
    const onResize = () => setCanvasScale(terminalCanvasScale(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
    <main className="prototype-shell" style={{ "--terminal-canvas-scale": canvasScale }}>
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
          dataClock={simulation.kstClock}
          codeshareTurn={codeshareTurn}
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
          dataClock={simulation.kstClock}
          codeshareTurn={codeshareTurn}
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
