import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdChevronRight, MdInfoOutline } from "react-icons/md";
import { WiCloud, WiCloudy, WiDayCloudy, WiDaySunny, WiRain, WiShowers, WiThunderstorm } from "react-icons/wi";
import clearNight from "../../assets/weather-icons/basmilius/clear-night.svg";
import fewCloudsNight from "../../assets/weather-icons/basmilius/few-clouds-night.svg";
import boardAf from "./assets/board-af.png";
import boardHeaderPlane from "./assets/board-header-plane.png";
import boardJal from "./assets/board-jal.png";
import boardSq from "./assets/board-sq.png";
import forecastCloud from "./assets/forecast-cloud-transparent.png";
import forecastPartly from "./assets/forecast-partly-transparent.png";
import forecastRain from "./assets/forecast-rain-transparent.png";
import forecastStorm from "./assets/forecast-storm-transparent.png";

const icons = {
  sun: WiDaySunny,
  partly: WiDayCloudy,
  cloud: WiCloud,
  cloudy: WiCloudy,
  rain: WiRain,
  shower: WiShowers,
  storm: WiThunderstorm,
};

const boardFlights = [
  {
    city: "도쿄", displayName: "도쿄 하네다", code: "HND", airport: "하네다 국제공항", flight: "JL 090", airline: "JAPAN AIRLINES",
    logo: boardJal, departure: "07:20", gate: "12", status: "정상 운항",
    localClock: "7/30 06:32", localZone: "JST", kstClock: "7/30 06:32", arrivalKst: "16:10",
    current: { icon: "rain", temp: 27, feels: "31℃", humidity: "78%", wind: "남서 6m/s" },
    arrival: "16:10",
    forecast: [["16시", "rain", "27℃"], ["17시", "rain", "27℃"], ["18시", "cloud", "26℃"], ["19시", "cloud", "26℃"], ["20시", "cloudy", "25℃"]],
  },
  {
    city: "싱가포르", displayName: "싱가포르", code: "SIN", airport: "창이 국제공항", flight: "SQ 605", airline: "SINGAPORE AIRLINES",
    logo: boardSq, departure: "08:05", gate: "23", status: "정상 운항",
    localClock: "7/30 05:32", localZone: "SGT", kstClock: "7/30 06:32", arrivalKst: "16:35",
    current: { icon: "partly", temp: 31, feels: "36℃", humidity: "69%", wind: "남동 4m/s" },
    arrival: "15:35",
    forecast: [["15시", "partly", "31℃"], ["16시", "partly", "31℃"], ["17시", "storm", "30℃"], ["18시", "storm", "29℃"], ["19시", "cloud", "28℃"]],
  },
  {
    city: "파리", displayName: "파리 샤를 드 골", code: "CDG", airport: "샤를 드골 국제공항", flight: "AF 267", airline: "AIR FRANCE",
    logo: boardAf, departure: "09:40", gate: "31", status: "정상 운항",
    localClock: "7/29 23:32", localZone: "CEST", kstClock: "7/30 06:32", arrivalKst: "23:50",
    current: { icon: "cloudy", temp: 20, feels: "20℃", humidity: "62%", wind: "북동 3m/s" },
    arrival: "16:50",
    forecast: [["16시", "cloudy", "20℃"], ["17시", "partly", "21℃"], ["18시", "cloudy", "21℃"], ["19시", "cloudy", "20℃"], ["20시", "rain", "19℃"]],
  },
];

const alternateBoardFlights = [
  {
    city: "오사카", displayName: "오사카 간사이", code: "KIX", airport: "간사이 국제공항", flight: "JL 120", airline: "JAPAN AIRLINES",
    logo: boardJal, departure: "10:20", gate: "18", status: "정상 운항",
    localClock: "7/30 06:32", localZone: "JST", kstClock: "7/30 06:32", arrivalKst: "12:05",
    current: { icon: "partly", temp: 26, feels: "28℃", humidity: "65%", wind: "남서 3m/s" },
    arrival: "12:05",
    forecast: [["12시", "partly", "26℃"], ["13시", "partly", "27℃"], ["14시", "cloud", "27℃"], ["15시", "cloud", "26℃"], ["16시", "rain", "25℃"]],
  },
  {
    city: "방콕", displayName: "방콕 수완나품", code: "BKK", airport: "수완나품 국제공항", flight: "SQ 711", airline: "SINGAPORE AIRLINES",
    logo: boardSq, departure: "10:55", gate: "26", status: "탑승 준비",
    localClock: "7/30 04:32", localZone: "ICT", kstClock: "7/30 06:32", arrivalKst: "17:10",
    current: { icon: "rain", temp: 30, feels: "35℃", humidity: "74%", wind: "남동 2m/s" },
    arrival: "15:10",
    forecast: [["15시", "rain", "30℃"], ["16시", "storm", "29℃"], ["17시", "rain", "29℃"], ["18시", "cloud", "28℃"], ["19시", "cloud", "28℃"]],
  },
  {
    city: "로마", displayName: "로마 피우미치노", code: "FCO", airport: "레오나르도 다 빈치 국제공항", flight: "AF 140", airline: "AIR FRANCE",
    logo: boardAf, departure: "11:30", gate: "34", status: "정상 운항",
    localClock: "7/29 23:32", localZone: "CEST", kstClock: "7/30 06:32", arrivalKst: "다음 날 01:25",
    current: { icon: "sun", temp: 24, feels: "25℃", humidity: "58%", wind: "서풍 3m/s" },
    arrival: "18:25",
    forecast: [["18시", "partly", "24℃"], ["19시", "partly", "23℃"], ["20시", "cloud", "22℃"], ["21시", "cloud", "21℃"], ["22시", "cloud", "20℃"]],
  },
];

const boardFlightGroups = [boardFlights, alternateBoardFlights];

const railFlights = [
  {
    city: "도쿄 하네다", code: "HND", flight: "JL92", status: "정시 운항", statusTone: "ok",
    logo: boardJal, airline: "Japan Airlines",
    localClock: "7/30 09:15", localZone: "JST", kstClock: "7/30 09:15", arrivalKst: "11:25",
    departure: "09:30", duration: "02:10", gate: "32", now: "09:15", arrival: "11:25", arrivalSlot: 0,
    preArrival: ["10:00", "cloudy", "27℃"],
    forecast: [["12:00", "partly", "28℃"], ["14:00", "cloudy", "29℃"], ["16:00", "cloudy", "28℃"], ["18:00", "partly", "27℃"], ["20:00", "cloudy", "26℃"]],
  },
  {
    city: "싱가포르", code: "SIN", flight: "SQ607", status: "정시 운항", statusTone: "ok",
    logo: boardSq, airline: "Singapore Airlines",
    localClock: "7/30 08:15", localZone: "SGT", kstClock: "7/30 09:15", arrivalKst: "17:05",
    departure: "10:25", duration: "06:40", gate: "25", now: "09:15", arrival: "16:05", arrivalSlot: 0,
    preArrival: ["15:00", "cloudy", "29℃"],
    forecast: [["16:00", "rain", "28℃"], ["18:00", "storm", "27℃"], ["20:00", "cloudy", "27℃"], ["22:00", "rain", "26℃"], ["00:00", "cloudy", "26℃"]],
  },
  {
    city: "파리 샤를 드 골", code: "CDG", flight: "AF267", status: "지연 20분", statusTone: "delay",
    logo: boardAf, airline: "Air France",
    localClock: "7/30 02:15", localZone: "CEST", kstClock: "7/30 09:15", arrivalKst: "다음 날 01:50",
    departure: "11:05", revised: "11:25", duration: "13:45", gate: "12", now: "09:15", arrival: "18:50", arrivalSlot: 0,
    preArrival: ["18:00", "partly", "20℃"],
    forecast: [["19:00", "partly", "20℃"], ["21:00", "nightPartly", "18℃"], ["23:00", "night", "17℃"], ["01:00", "night", "16℃"], ["03:00", "cloudy", "16℃"]],
  },
];

const alternateRailFlights = [
  {
    city: "오사카 간사이", code: "KIX", flight: "JL120", status: "정시 운항", statusTone: "ok",
    logo: boardJal, airline: "Japan Airlines",
    localClock: "7/30 09:15", localZone: "JST", kstClock: "7/30 09:15", arrivalKst: "12:05",
    departure: "10:20", duration: "01:45", gate: "18", now: "09:15", arrival: "12:05", arrivalSlot: 0,
    preArrival: ["11:00", "cloudy", "26℃"],
    forecast: [["12:00", "partly", "26℃"], ["14:00", "cloudy", "27℃"], ["16:00", "rain", "25℃"], ["18:00", "cloudy", "24℃"], ["20:00", "cloudy", "23℃"]],
  },
  {
    city: "방콕 수완나품", code: "BKK", flight: "SQ711", status: "탑승 준비", statusTone: "ok",
    logo: boardSq, airline: "Singapore Airlines",
    localClock: "7/30 07:15", localZone: "ICT", kstClock: "7/30 09:15", arrivalKst: "17:10",
    departure: "10:55", duration: "06:15", gate: "26", now: "09:15", arrival: "15:10", arrivalSlot: 0,
    preArrival: ["14:00", "rain", "30℃"],
    forecast: [["15:00", "rain", "30℃"], ["17:00", "storm", "29℃"], ["19:00", "cloudy", "28℃"], ["21:00", "rain", "27℃"], ["23:00", "cloudy", "27℃"]],
  },
  {
    city: "로마 피우미치노", code: "FCO", flight: "AF140", status: "정시 운항", statusTone: "ok",
    logo: boardAf, airline: "Air France",
    localClock: "7/30 02:15", localZone: "CEST", kstClock: "7/30 09:15", arrivalKst: "다음 날 01:25",
    departure: "11:30", duration: "13:55", gate: "34", now: "09:15", arrival: "18:25", arrivalSlot: 0,
    preArrival: ["17:00", "partly", "24℃"],
    forecast: [["18:00", "partly", "24℃"], ["20:00", "partly", "23℃"], ["22:00", "cloudy", "22℃"], ["00:00", "nightPartly", "20℃"], ["02:00", "night", "19℃"]],
  },
];

const railFlightGroups = [railFlights, alternateRailFlights];

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

function WeatherCondition({ type, className = "", style }) {
  return <em className={`weather-condition ${className}`.trim()} style={style}>{weatherLabels[type] ?? "흐림"}</em>;
}

function RailWeatherImage({ type }) {
  return <img className={`weather-image weather-image--${type}`} src={railWeatherAssets[type] ?? railWeatherAssets.cloud} alt="" aria-hidden="true" />;
}

function AirlineLogo({ flight }) {
  return (
    <div className={`airline-logo airline-logo--${flight.code.toLowerCase()}`}>
      <img src={flight.logo} alt={`${flight.airline} 로고`} />
    </div>
  );
}

function BoardColumn({ flight, columnIndex, weatherCitySlot }) {
  const bandStyle = (band) => ({ "--band": band, "--column": columnIndex });
  const rollStyle = (item) => ({ "--item": item });
  const [localDate, localTime] = flight.localClock.split(" ");
  const [kstDate, kstTime] = flight.kstClock.split(" ");
  return (
    <article className="board-column">
      <div className="board-band" style={bandStyle(0)}>
        <div className="board-band-surface">
          <div className="board-destination">
            <div>
              <h2>
                <span className="destination-name roll-unit flap-unit" style={rollStyle(0)}>{flight.displayName}</span>{" "}
                <span className="destination-code roll-unit flap-unit" style={rollStyle(1)}>{flight.code}</span>
              </h2>
              <div className="board-destination-meta">
                <div className="destination-clock roll-unit flap-unit" style={rollStyle(3)}>
                  <span>현지 시각</span><strong>{localTime}</strong><b>{flight.localZone}</b>
                  <small>{localDate} · 한국 {kstTime} KST</small>
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
              <strong className="roll-unit flap-unit" style={rollStyle(1)}>{flight.flight}</strong>
              <span className="roll-unit flap-unit" style={rollStyle(2)}>{flight.airline}</span>
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
              <strong className="roll-unit flap-unit" style={rollStyle(1)}>{flight.departure}</strong>
            </div>
            <div>
              <span className="roll-unit" style={rollStyle(2)}>탑승구</span>
              <strong className="roll-unit flap-unit" style={rollStyle(3)}>{flight.gate}</strong>
            </div>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(3)}>
        <div className="board-band-surface">
          <div className="operation-status">
            <span className="roll-unit" style={rollStyle(0)}>운항 상태</span>
            <i className="roll-unit flap-unit" style={rollStyle(1)} />
            <strong className="roll-unit flap-unit" style={rollStyle(2)}>{flight.status}</strong>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(4)}>
        <div className="board-band-surface">
          <p className="section-label" style={{ "--weather-city-slot": weatherCitySlot }}>
            <span className="roll-unit" style={rollStyle(0)}>현재</span>{" "}
            <span className="roll-unit flap-unit" style={rollStyle(1)}>{flight.city}</span>{" "}
            <span className="roll-unit" style={rollStyle(2)}>날씨</span>
          </p>
          <div className="current-weather">
            <div className="temperature">
              <span className="weather-icon-stack roll-unit flap-unit" style={rollStyle(3)}>
                <BoardWeatherImage type={flight.current.icon} />
                <WeatherCondition type={flight.current.icon} />
              </span>
              <strong className="roll-unit flap-unit" style={rollStyle(4)}>{flight.current.temp}<small>℃</small></strong>
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
      <div className="board-band" style={bandStyle(5)}>
        <div className="board-band-surface">
          <div className="arrival-time">
            <span className="roll-unit" style={rollStyle(0)}>도착 예정</span>
            <strong className="roll-unit flap-unit" style={rollStyle(1)}>{flight.arrival}</strong>
            <small className="roll-unit flap-unit" style={rollStyle(2)}>(현지 시각 · 한국 {flight.arrivalKst} KST)</small>
          </div>
          <div className="board-forecast">
            {flight.forecast.map(([time, icon, temp], index) => (
              <div className={index === 0 ? "is-arrival" : ""} key={time}>
                <time className="roll-unit flap-unit" style={rollStyle(3 + index * 4)}>{time}</time>
                <span className="roll-unit flap-unit" style={rollStyle(4 + index * 4)}><BoardWeatherImage type={icon} small /></span>
                <WeatherCondition type={icon} className="roll-unit flap-unit" style={rollStyle(5 + index * 4)} />
                <strong className="roll-unit flap-unit" style={rollStyle(6 + index * 4)}>{temp}</strong>
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
            <Fragment key={flight.code}>
              <BoardColumn
                flight={flight}
                columnIndex={index}
                weatherCitySlot={`${Math.max(flight.city.length, pendingFlights[index]?.city.length ?? 0)}em`}
              />
              {index < activeFlights.length - 1 && <i className="board-column-separator" aria-hidden="true" />}
            </Fragment>
          ))}
        </div>
        {transitioning && (
          <div className="board-page is-entering" aria-hidden="true">
            {pendingFlights.map((flight, index) => (
              <Fragment key={flight.code}>
                <BoardColumn
                  flight={flight}
                  columnIndex={index}
                  weatherCitySlot={`${Math.max(flight.city.length, activeFlights[index]?.city.length ?? 0)}em`}
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
        <div className="rail-motion-unit" style={{ "--rail-item": 6 }}><strong>{flight.departure}</strong>{flight.revised && <em>{flight.revised}</em>}</div>
      </div>
      <div>
        <span>예상 비행시간</span>
        <div className="rail-motion-unit" style={{ "--rail-item": 7 }}><strong>{flight.duration}</strong></div>
      </div>
      <div>
        <span>탑승구</span>
        <div className="rail-motion-unit" style={{ "--rail-item": 8 }}><strong>{flight.gate}</strong></div>
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
              <span>현지</span><strong className="rail-motion-unit" style={{ "--rail-item": 9 }}>{flight.arrival}</strong>
            </div>
            <div className="progress-clock">
              <span>한국</span><strong className="rail-motion-unit" style={{ "--rail-item": 10 }}>{flight.arrivalKst}</strong><small>KST</small>
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
          <time>{flight.preArrival[0]}</time>
          <RailWeatherImage type={flight.preArrival[1]} />
          <WeatherCondition type={flight.preArrival[1]} />
          <strong>{flight.preArrival[2]}</strong>
        </div>
      </div>
      <div className="timeline-forecast">
        {flight.forecast.map(([time, icon, temp], index) => (
          <div
            className={index === flight.arrivalSlot ? "is-arrival" : ""}
            key={time}
          >
            <div className="rail-forecast-content rail-motion-unit" style={{ "--rail-item": 12 + index }}>
              <time>{time}</time>
              <RailWeatherImage type={icon} />
              <WeatherCondition type={icon} />
              <strong>{temp}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RailRow({ flight, index }) {
  const [localDate, localTime] = flight.localClock.split(" ");
  const [, kstTime] = flight.kstClock.split(" ");
  return (
    <article className="rail-flight-row" style={{ "--order": index }}>
      <div className="rail-flight-info">
        <h2 className="rail-motion-unit" style={{ "--rail-item": 0 }}>{flight.city} <span>{flight.code}</span></h2>
        <div className="rail-local-clock">
          <span>현지 시각</span>
          <strong className="rail-motion-unit" style={{ "--rail-item": 1 }}>{localTime}</strong>
          <b className="rail-motion-unit" style={{ "--rail-item": 2 }}>{flight.localZone}</b>
          <small className="rail-motion-unit" style={{ "--rail-item": 3 }}>{localDate} · 한국 {kstTime} KST</small>
        </div>
        <div className="rail-flight-status">
          <span className="rail-flight-number rail-motion-unit" style={{ "--rail-item": 4 }}>
            <img src={flight.logo} alt={`${flight.airline} 로고`} />
            <strong>{flight.flight}</strong>
          </span>
          <span className={`${flight.statusTone} rail-motion-unit`} style={{ "--rail-item": 5 }}>{flight.status}</span>
        </div>
        <RailStats flight={flight} />
      </div>
      <ForecastTimeline flight={flight} />
    </article>
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
          {activeFlights.map((flight, index) => <RailRow flight={flight} index={index} key={flight.code} />)}
        </div>
        {transitioning && (
          <div className="rail-page is-entering" aria-hidden="true">
            {pendingFlights.map((flight, index) => <RailRow flight={flight} index={index} key={flight.code} />)}
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
        setActiveBoardGroup((current) => (current + 1) % boardFlightGroups.length);
      } else {
        setActiveRailGroup((current) => (current + 1) % railFlightGroups.length);
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

  const pendingBoardGroup = (activeBoardGroup + 1) % boardFlightGroups.length;
  const pendingRailGroup = (activeRailGroup + 1) % railFlightGroups.length;
  return (
    <main className="prototype-shell">
      {view === "board" ? (
        <BoardScreen
          transitioning={transitioning}
          activeFlights={boardFlightGroups[activeBoardGroup]}
          pendingFlights={boardFlightGroups[pendingBoardGroup]}
          currentPage={activeBoardGroup}
          pageCount={boardFlightGroups.length}
          motionMode={motionMode}
          onReplay={replay}
          onSelectMotion={selectMotionMode}
          onSelectView={selectView}
        />
      ) : (
        <RailScreen
          transitioning={transitioning}
          activeFlights={railFlightGroups[activeRailGroup]}
          pendingFlights={railFlightGroups[pendingRailGroup]}
          currentPage={activeRailGroup}
          pageCount={railFlightGroups.length}
          motionMode={railMotionMode}
          onReplay={replay}
          onSelectMotion={selectRailMotionMode}
          onSelectView={selectView}
        />
      )}
    </main>
  );
}
