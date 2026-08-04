import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdChevronRight } from "react-icons/md";
import clearNight from "../../assets/weather-icons/basmilius/clear-night.svg";
import fewCloudsNight from "../../assets/weather-icons/basmilius/few-clouds-night.svg";
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
import {
  AgencyMascot,
  AirlineLogo,
  BoardWeatherImage,
  DepartureAirportSelect,
  GATE_CHANGED_STATUS,
  HeaderWeatherPanel,
  MotionModeSwitcher,
  PageIndicator,
  ScreenFooterNote,
  TerminalEmptyState,
  TerminalSettings,
  TerminalTitle,
  UNDECIDED_VALUES,
  ViewSwitcher,
  WeatherCondition,
  boardForecastAssets,
  displayTemperature,
  formatKoreanClock,
  splitArrivalKst,
  withCodeshare,
} from './terminalShared.jsx';

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

const displayForecastHour = (value) => String(value).replace(/^\d{2}:00$/, `${Number(String(value).slice(0, 2))}시`);

function RailWeatherImage({ type }) {
  return <img className={`weather-image weather-image--${type}`} src={railWeatherAssets[type] ?? railWeatherAssets.cloud} alt="" aria-hidden="true" />;
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
              {/* 같은 목적지가 세 칸에 나란히 서면 제목만 훑는 화면 낭독기에서 구별이 안 된다.
                  눈에는 안 보이되 편명을 제목에 함께 실어 어느 편의 칸인지 알린다. */}
              <h2>
                <span className="destination-name roll-unit flap-unit" style={rollStyle(0)}>{flight.displayName}</span>{" "}
                <span className="destination-code roll-unit flap-unit" style={rollStyle(1)}>{flight.code}</span>
                <span className="visually-hidden"> {flight.flight}편</span>
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
            {/* 점과 글자를 따로 굴리면 순번이 달라 점이 뒤늦게 따라온다. 상태는 한 덩어리로 움직인다. */}
            <div className={`operation-status${isDelayed ? " is-delay" : ""} roll-unit flap-unit${variant('status', 'statusTone')}`} style={rollStyle(3)}>
              <i />
              <strong>{flight.status}</strong>
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
              {/* 아직 정해지지 않은 탑승구를 61px로 띄우면, 값이 없다는 사실이 실제 출발 시각만큼
                  크게 외친다. 온도 칸이 쓰던 작은 회색 표기를 그대로 쓴다. */}
              <div className={`gate-value${isGateChanged ? " is-changed" : ""}`}>
                <strong className={`roll-unit flap-unit${variant('gate')}`} style={rollStyle(4)}>
                  {UNDECIDED_VALUES.has(flight.gate) ? <em className="value-unknown">{flight.gate}</em> : flight.gate}
                </strong>
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
            <span className="arrival-forecast-label roll-unit" style={rollStyle(0)}>목적지 공항 예보</span>
            {/* 숫자만 있으면 출발인지 도착인지 헷갈린다. 라벨과 시각은 한 덩어리로 움직인다. */}
            {hasArrivalTime && isDomesticDestination && <strong className={`arrival-time-value roll-unit flap-unit${variant('arrival', 'localZone')}`} style={rollStyle(1)}><span className="arrival-time-caption">도착</span>{flight.arrival}</strong>}
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

function BoardScreen({ codeshareTurn, transitioning, activeFlights, pendingFlights, currentFrame, frameCount, motionMode, onReplay, hasNext, onSelectMotion, onSelectView, clock, title, departureAirports, departureAirportIcao, departureAirportName, onSelectDepartureAirport }) {
  const slotTransitions = terminalSlotTransitions(activeFlights, pendingFlights);
  return (
    <section className={`exact-screen exact-board motion-${motionMode}${activeFlights.length === 0 ? " is-operations-ended" : ""}`} data-testid="option-one">
      <PageIndicator currentFrame={currentFrame} frameCount={frameCount} />
      <header className="board-header">
        <AgencyMascot />
        <TerminalTitle title={title} />
        <div className="board-header-clock"><span>{clock.date}</span><strong>{clock.time}</strong></div>
      </header>
      <TerminalSettings>
        <DepartureAirportSelect airports={departureAirports} selectedIcao={departureAirportIcao} onSelect={onSelectDepartureAirport} />
        <ViewSwitcher view="board" onSelectView={onSelectView} />
        <MotionModeSwitcher motionMode={motionMode} onSelectMotion={onSelectMotion} modes={boardMotionModes} ariaLabel="1안 전환 애니메이션" />
        <button type="button" className="next-board-button" onClick={onReplay} disabled={!hasNext}>
          <MdChevronRight /><span>다음 항공편</span>
        </button>
      </TerminalSettings>
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
        <ScreenFooterNote />
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
      {/* 비행시간은 뺐다. 같은 노선이면 세 행에 같은 숫자가 반복되고, 떠나는 승객이
          안내판에서 찾는 값도 아니다. 그 폭을 출발·탑승구가 나눠 갖는다. */}
      <div>
        <span>탑승구</span>
        {/* 1안과 같다. 아직 정해지지 않은 값을 큰 숫자 자리에 그대로 넣으면 좁은 칸에서 세 줄로 쪼개진다. */}
        <div className={`rail-motion-unit${variant('gate')}${flight.status === GATE_CHANGED_STATUS ? " is-delayed" : ""}`} style={{ "--rail-item": 8 }}><strong>{UNDECIDED_VALUES.has(flight.gate) ? <em className="value-unknown">{flight.gate}</em> : flight.gate}</strong></div>
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
          <span className="progress-label__title">목적지 공항 예보</span>
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
  // 1안과 같은 규칙. 목적지가 한국이면 현지 시각은 상단 시계와 같은 값이라 군더더기다.
  const showLocalClock = Boolean(flight.localZone) && flight.localZone !== "KST";
  const isCodeshare = rawFlight.codeshares?.length >= 2;
  const shareIndex = isCodeshare ? codeshareTurn % rawFlight.codeshares.length : 0;
  return (
    <article className={`rail-flight-row is-slot-${transitionKind}${transitionKind === "flight" ? " is-flight-variant-changing" : ""}`} data-testid="rail-flight-row" data-destination-code={flight.code} data-flight-key={flight.flightKey} style={{ "--order": index }}>
      <div className="rail-flight-info">
        {/* 같은 목적지 행이 여럿이면 제목만 훑는 화면 낭독기에서 구별이 안 된다. 편명을 함께 싣는다. */}
        <h2 className="rail-motion-unit" style={{ "--rail-item": 0 }}>{flight.city} <span>{flight.code}</span><span className="visually-hidden"> {flight.flight}편</span></h2>
        {/* 목적지 줄 오른쪽은 1안의 `현재 날씨` 칸이 하던 일을 맡는다. 화면 제목이 `가는 곳 날씨`인데
            3안에는 지금 그곳이 어떤지가 없어 승객이 가장 먼저 궁금해하는 값이 빠져 있었다. */}
        <div className="rail-destination-side">
          {showLocalClock && <div className="rail-local-clock"><span>현지 시각</span><strong>{localTime}</strong><b>{flight.localZone}</b></div>}
          <div className="rail-current-weather rail-motion-unit" style={{ "--rail-item": 1 }}>
            <RailWeatherImage type={flight.current.icon} />
            <WeatherCondition type={flight.current.icon} />
            <strong>{flight.current.temp == null ? <em className="value-unknown">확인 중</em> : <>{flight.current.temp}<small>°C</small></>}</strong>
            <dl>
              <div><dt>체감</dt><dd>{flight.current.feels}</dd></div>
              <div><dt>습도</dt><dd>{flight.current.humidity}</dd></div>
              <div><dt>바람</dt><dd>{flight.current.wind}</dd></div>
            </dl>
          </div>
        </div>
        <div className="rail-flight-status">
          <span className={`rail-flight-number rail-motion-unit${variant('flight', 'airline', 'logo')}`} style={{ "--rail-item": 4 }}>
            {flight.logo
              ? <img src={flight.logo} alt={`${flight.airline} 로고`} />
              : <span className="airline-logo-fallback" aria-label={flight.airline}>{flight.flight.slice(0, 2)}</span>}
            <span className="rail-airline-meta">
              <strong>{flight.flight}</strong>
              <small>{flight.airline}</small>
            </span>
            {/* 1안과 같다. 편명이 3초마다 도는 이유를 배지가, 지금 몇 번째인지를 점이 알려준다.
                이게 없으면 승객 눈에는 화면이 까닭 없이 깜빡이는 것으로 보인다. */}
            {isCodeshare && (
              <span className="codeshare-badge-group">
                <b className="codeshare-badge">공동운항</b>
                <span className="codeshare-dots" role="img" aria-label={`공동운항 편명 ${rawFlight.codeshares.length}개 중 ${shareIndex + 1}번째`}>
                  {rawFlight.codeshares.map((share, index) => <i key={share.flight} className={index === shareIndex ? "is-current" : undefined} />)}
                </span>
              </span>
            )}
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
  codeshareTurn,
  onSelectDepartureAirport,
}) {
  const slotTransitions = terminalSlotTransitions(activeFlights, pendingFlights);
  return (
    <section className={`exact-screen exact-rail rail-motion-${motionMode}${activeFlights.length === 0 ? " is-operations-ended" : ""}`} data-testid="option-three">
      <PageIndicator currentFrame={currentFrame} frameCount={frameCount} />
      <header className="rail-header">
        <AgencyMascot />
        <TerminalTitle title={title} />
        <div className="rail-header-clock"><span>{clock.date}</span><strong>{clock.time}</strong></div>
      </header>
      <TerminalSettings>
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
      </TerminalSettings>
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
        <ScreenFooterNote />
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
  const terminalTitle = `${departureAirportState.selected?.nameKo?.replace('국제', '') || '김포공항'} 가는 곳 날씨`;
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
          motionMode={motionMode}
          onReplay={replay}
          hasNext={hasNextFrame}
          onSelectMotion={selectMotionMode}
          onSelectView={selectView}
          clock={koreanClock}
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
          motionMode={railMotionMode}
          onReplay={replay}
          hasNext={hasNextFrame}
          onSelectMotion={selectRailMotionMode}
          onSelectView={selectView}
          clock={koreanClock}
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
