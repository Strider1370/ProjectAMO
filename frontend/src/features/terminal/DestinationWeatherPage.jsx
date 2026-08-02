import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdChevronRight, MdInfoOutline } from "react-icons/md";
import { WiCloud, WiCloudy, WiDayCloudy, WiDaySunny, WiRain, WiShowers, WiThunderstorm } from "react-icons/wi";
import clearNight from "../../assets/weather-icons/basmilius/clear-night.svg";
import fewCloudsNight from "../../assets/weather-icons/basmilius/few-clouds-night.svg";
import boardAf from "./assets/board-af.png";
import amoWordmark from "./assets/amo-wordmark.png";
import airportWeatherQr from "./assets/airport-weather-qr.svg";
import boardJal from "./assets/board-jal.png";
import boardSq from "./assets/board-sq.png";
import forecastCloud from "./assets/forecast-cloud-transparent.png";
import forecastPartly from "./assets/forecast-partly-transparent.png";
import forecastRain from "./assets/forecast-rain-transparent.png";
import forecastStorm from "./assets/forecast-storm-transparent.png";

const koreanAirLogo = "/Symbols/airlines/KAL-symbol.svg";
const asianaAirlinesLogo = "/Symbols/airlines/AAR-symbol.svg";
const jejuAirLogo = "/Symbols/airlines/JJA.svg";

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
    city: "싱가포르", displayName: "싱가포르 창이", code: "SIN", airport: "창이 국제공항", flight: "SQ 605", airline: "SINGAPORE AIRLINES",
    logo: boardSq, departure: "08:05", gate: "23", status: "정상 운항",
    localClock: "7/30 05:32", localZone: "SGT", kstClock: "7/30 06:32", arrivalKst: "16:35",
    current: { icon: "partly", temp: 31, feels: "36℃", humidity: "69%", wind: "남동 4m/s" },
    arrival: "15:35",
    forecast: [["15시", "partly", "31℃"], ["16시", "partly", "31℃"], ["17시", "storm", "30℃"], ["18시", "storm", "29℃"], ["19시", "cloud", "28℃"]],
  },
  {
    city: "파리", displayName: "파리 샤를 드 골", code: "CDG", airport: "샤를 드골 국제공항", flight: "AF 267", airline: "AIR FRANCE",
    logo: boardAf, departure: "09:40", revised: "10:00", gate: "31", status: "지연 20분", statusTone: "delay",
    localClock: "7/29 23:32", localZone: "CEST", kstClock: "7/30 06:32", arrivalKst: "23:50",
    current: { icon: "cloudy", temp: 20, feels: "20℃", humidity: "62%", wind: "북동 3m/s" },
    arrival: "16:50",
    forecast: [["16시", "cloudy", "20℃"], ["17시", "partly", "21℃"], ["18시", "cloudy", "21℃"], ["19시", "cloudy", "20℃"], ["20시", "rain", "19℃"]],
  },
];

const alternateBoardFlights = [
  {
    city: "서울", displayName: "서울 김포", code: "GMP", airport: "김포국제공항", flight: "KE 1205", airline: "KOREAN AIR",
    logo: koreanAirLogo, departure: "10:20", gate: "18", status: "정상 운항",
    localClock: "7/30 06:32", localZone: "KST", kstClock: "7/30 06:32", arrivalKst: "11:30",
    current: { icon: "cloud", temp: 25, feels: "26℃", humidity: "72%", wind: "북서 3m/s" },
    arrival: "11:30",
    forecast: [["11시", "cloud", "25℃"], ["12시", "partly", "26℃"], ["13시", "partly", "27℃"], ["14시", "cloud", "27℃"], ["15시", "cloud", "26℃"]],
  },
  {
    city: "제주", displayName: "제주", code: "CJU", airport: "제주국제공항", flight: "OZ 8901", airline: "ASIANA AIRLINES",
    logo: asianaAirlinesLogo, departure: "10:45", gate: "21", status: "탑승 준비",
    localClock: "7/30 06:32", localZone: "KST", kstClock: "7/30 06:32", arrivalKst: "11:55",
    current: { icon: "partly", temp: 28, feels: "30℃", humidity: "68%", wind: "남서 4m/s" },
    arrival: "11:55",
    forecast: [["11시", "partly", "28℃"], ["12시", "partly", "29℃"], ["13시", "cloud", "29℃"], ["14시", "rain", "28℃"], ["15시", "rain", "27℃"]],
  },
  {
    city: "부산", displayName: "부산 김해", code: "PUS", airport: "김해국제공항", flight: "7C 112", airline: "JEJU AIR",
    logo: jejuAirLogo, departure: "11:10", gate: "25", status: "정상 운항",
    localClock: "7/30 06:32", localZone: "KST", kstClock: "7/30 06:32", arrivalKst: "12:20",
    current: { icon: "rain", temp: 27, feels: "29℃", humidity: "81%", wind: "남동 3m/s" },
    arrival: "12:20",
    forecast: [["12시", "rain", "27℃"], ["13시", "rain", "27℃"], ["14시", "cloud", "26℃"], ["15시", "cloud", "26℃"], ["16시", "partly", "25℃"]],
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
    city: "싱가포르 창이", code: "SIN", flight: "SQ607", status: "정시 운항", statusTone: "ok",
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
    city: "서울 김포", code: "GMP", flight: "KE1205", status: "정시 운항", statusTone: "ok",
    logo: koreanAirLogo, airline: "Korean Air",
    localClock: "7/30 09:15", localZone: "KST", kstClock: "7/30 09:15", arrivalKst: "10:45",
    departure: "09:50", duration: "00:55", gate: "18", now: "09:15", arrival: "10:45", arrivalSlot: 0,
    preArrival: ["10:00", "cloudy", "25℃"],
    forecast: [["11:00", "cloudy", "25℃"], ["12:00", "partly", "26℃"], ["13:00", "partly", "27℃"], ["14:00", "cloudy", "27℃"], ["15:00", "cloudy", "26℃"]],
  },
  {
    city: "제주", code: "CJU", flight: "OZ8901", status: "탑승 준비", statusTone: "ok",
    logo: asianaAirlinesLogo, airline: "Asiana Airlines",
    localClock: "7/30 09:15", localZone: "KST", kstClock: "7/30 09:15", arrivalKst: "11:55",
    departure: "10:45", duration: "01:10", gate: "21", now: "09:15", arrival: "11:55", arrivalSlot: 0,
    preArrival: ["11:00", "partly", "28℃"],
    forecast: [["12:00", "partly", "29℃"], ["13:00", "cloudy", "29℃"], ["14:00", "rain", "28℃"], ["15:00", "rain", "27℃"], ["16:00", "cloudy", "27℃"]],
  },
  {
    city: "부산 김해", code: "PUS", flight: "7C112", status: "정시 운항", statusTone: "ok",
    logo: jejuAirLogo, airline: "Jeju Air",
    localClock: "7/30 09:15", localZone: "KST", kstClock: "7/30 09:15", arrivalKst: "12:20",
    departure: "11:10", duration: "01:10", gate: "25", now: "09:15", arrival: "12:20", arrivalSlot: 0,
    preArrival: ["11:00", "rain", "27℃"],
    forecast: [["12:00", "rain", "27℃"], ["13:00", "cloudy", "26℃"], ["14:00", "cloudy", "26℃"], ["15:00", "partly", "25℃"], ["16:00", "partly", "25℃"]],
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

const displayTemperature = (value) => String(value).replace("℃", "°C");

function WeatherCondition({ type, className = "", style }) {
  return <em className={`weather-condition weather-condition--${type} ${className}`.trim()} style={style}>{weatherLabels[type] ?? "흐림"}</em>;
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
  const isDelayed = Boolean(flight.revised);
  const [localDate, localTime] = flight.localClock.split(" ");
  const [kstDate] = flight.kstClock.split(" ");
  const showLocalDate = localDate !== kstDate;
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
            </div>
          </div>
          <div className="board-divider" />
        </div>
      </div>
      <div className="board-band" style={bandStyle(1)}>
        <div className="board-band-surface">
          <div className="airline-block">
            <div className="roll-unit flap-unit" style={rollStyle(0)}><AirlineLogo flight={flight} /></div>
            <div className="airline-flight-meta">
              <strong className="roll-unit flap-unit" style={rollStyle(1)}>{flight.flight}</strong>
              <span className="roll-unit flap-unit" style={rollStyle(2)}>{flight.airline}</span>
            </div>
            <div className={`operation-status${isDelayed ? " is-delay" : ""}`}>
              <i className="roll-unit flap-unit" style={rollStyle(3)} />
              <strong className="roll-unit flap-unit" style={rollStyle(4)}>{flight.status}</strong>
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
                <strong className="roll-unit flap-unit" style={rollStyle(1)}>{flight.revised ?? flight.departure}</strong>
                {flight.revised && <small className="roll-unit" style={rollStyle(2)}>예정 <s>{flight.departure}</s></small>}
              </div>
            </div>
            <div>
              <span className="roll-unit" style={rollStyle(3)}>탑승구</span>
              <strong className="roll-unit flap-unit" style={rollStyle(4)}>{flight.gate}</strong>
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
            <strong className="roll-unit flap-unit" style={rollStyle(1)}>{flight.arrival}<b>{flight.localZone}</b></strong>
            <small className="roll-unit flap-unit" style={rollStyle(2)}>(한국 {flight.arrivalKst}KST)</small>
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

function PageIndicator({ currentPage, pageCount }) {
  return (
    <div
      className="page-indicator"
      role="img"
      aria-label={`${currentPage + 1} / ${pageCount} 페이지`}
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <i className={index === currentPage ? "is-current" : ""} aria-hidden="true" key={index} />
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

function BoardScreen({ transitioning, activeFlights, pendingFlights, currentPage, pageCount, motionMode, onReplay, onSelectMotion, onSelectView }) {
  return (
    <section className={`exact-screen exact-board motion-${motionMode}`} data-testid="option-one">
      <PageIndicator currentPage={currentPage} pageCount={pageCount} />
      <header className="board-header">
        <AgencyMascot />
        <h1>출발 항공편 · 도착지 날씨</h1>
        <div className="board-header-actions">
          <ViewSwitcher view="board" onSelectView={onSelectView} />
          <MotionModeSwitcher motionMode={motionMode} onSelectMotion={onSelectMotion} />
          <button type="button" className="next-board-button" onClick={onReplay}>
            <MdChevronRight /><span>다음 3편</span>
          </button>
        </div>
        <div className="board-header-clock"><span>2026.07.30 (목)</span><strong>06:32</strong></div>
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
      <footer className="screen-footer board-footer">
        <div className="screen-footer-note"><MdInfoOutline /><span>도착 현지 시간 기준 · 예보는 참고용이며, 실제 날씨와 다를 수 있습니다.</span></div>
        <HeaderWeatherPanel showWordmark />
      </footer>
    </section>
  );
}

function RailStats({ flight }) {
  return (
    <div className="rail-stats">
      <div>
        <span>출발</span>
        <div className={`rail-motion-unit${flight.revised ? " is-delayed" : ""}`} style={{ "--rail-item": 6 }}><strong>{flight.revised ?? flight.departure}</strong>{flight.revised && <em>예정 <s>{flight.departure}</s></em>}</div>
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
              <strong>{displayTemperature(temp)}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RailRow({ flight, index }) {
  const [, localTime] = flight.localClock.split(" ");
  return (
    <article className="rail-flight-row" style={{ "--order": index }}>
      <div className="rail-flight-info">
        <h2 className="rail-motion-unit" style={{ "--rail-item": 0 }}>{flight.city} <span>{flight.code}</span></h2>
        <div className="rail-local-clock"><span>현지 시각</span><strong>{localTime}</strong><b>{flight.localZone}</b></div>
        <div className="rail-flight-status">
          <span className="rail-flight-number rail-motion-unit" style={{ "--rail-item": 4 }}>
            <img src={flight.logo} alt={`${flight.airline} 로고`} />
            <span className="rail-airline-meta">
              <strong>{flight.flight}</strong>
              <small>{flight.airline}</small>
            </span>
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
        <AgencyMascot />
        <h1>출발 항공편 · 도착지 날씨</h1>
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
        <div className="rail-header-clock"><span>2026.07.30 (목)</span><strong>09:15</strong></div>
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
      <footer className="screen-footer rail-footer">
        <div className="screen-footer-note"><MdInfoOutline /><span>도착 현지 시간 기준 · 예보는 참고용이며, 실제 날씨와 다를 수 있습니다.</span></div>
        <HeaderWeatherPanel showWordmark />
      </footer>
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
