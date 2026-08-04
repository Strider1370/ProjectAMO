import { useEffect, useRef } from "react";
import { MdInfoOutline, MdSettings } from "react-icons/md";
import { WiCloud, WiCloudy, WiDayCloudy, WiDaySunny, WiRain, WiShowers, WiThunderstorm } from "react-icons/wi";
import amoWordmark from "./assets/amo-wordmark.png";
import airportWeatherQr from "./assets/airport-weather-qr.svg";
import forecastCloud from "./assets/forecast-cloud-transparent.png";
import forecastPartly from "./assets/forecast-partly-transparent.png";
import forecastRain from "./assets/forecast-rain-transparent.png";
import forecastStorm from "./assets/forecast-storm-transparent.png";
import { DESTINATION_FRAME_CAPACITY } from './terminalFlightSimulation.js';
import { temperatureGap } from './terminalLiveData.js';

const icons = {
  sun: WiDaySunny,
  partly: WiDayCloudy,
  cloud: WiCloud,
  cloudy: WiCloudy,
  rain: WiRain,
  shower: WiShowers,
  storm: WiThunderstorm,
};

export function WeatherIcon({ type, className = "" }) {
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

export const boardForecastAssets = {
  // 맑음이 빠져 있으면 흐림 아이콘으로 떨어져, 문구는 `맑음`인데 그림은 구름이 된다.
  sun: forecastPartly,
  rain: forecastRain,
  partly: forecastPartly,
  cloud: forecastCloud,
  cloudy: forecastCloud,
  shower: forecastRain,
  storm: forecastStorm,
};

export function BoardWeatherImage({ type, small = false }) {
  const source = (small ? boardForecastAssets : boardWeatherAssets)[type] ?? boardWeatherAssets.cloud;
  const opticalClass = small ? ` weather-image weather-image--${type}` : "";
  return <img className={opticalClass.trim()} src={source} alt="" aria-hidden="true" />;
}

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

export const GATE_CHANGED_STATUS = "탑승구 변경";
/** 아직 값이 없다는 뜻으로 API·fixture가 쓰는 말. 실제 값처럼 크게 띄우지 않는다. */
export const UNDECIDED_VALUES = new Set(["확인", "확인 중"]);


export const displayTemperature = (value) => String(value).replace("℃", "°C");

export function formatKoreanClock(value) {
  const koreanDays = ["일", "월", "화", "수", "목", "금", "토"];
  const kst = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return { date: `${year}.${month}.${day} (${koreanDays[kst.getUTCDay()]})`, time: `${hour}:${minute}` };
}

export function WeatherCondition({ type, className = "", style }) {
  return <em className={`weather-condition weather-condition--${type} ${className}`.trim()} style={style}>{weatherLabels[type] ?? "흐림"}</em>;
}

export function AirlineLogo({ flight }) {
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
export function withCodeshare(flight, turn) {
  const shares = flight.codeshares;
  if (!shares || shares.length < 2) return flight;
  const share = shares[turn % shares.length];
  return { ...flight, flight: share.flight, airline: share.airline, logo: share.logo };
}

export function ViewSwitcher({ view, onSelectView }) {
  return (
    <nav className="view-switcher" aria-label="화면 비교">
      <button type="button" className={view === "board" ? "is-active" : ""} aria-pressed={view === "board"} onClick={() => onSelectView("board")}>1안</button>
      <button type="button" className={view === "weather" ? "is-active" : ""} aria-pressed={view === "weather"} onClick={() => onSelectView("weather")}>2안</button>
      <button type="button" className={view === "rail" ? "is-active" : ""} aria-pressed={view === "rail"} onClick={() => onSelectView("rail")}>3안</button>
    </nav>
  );
}

export function DepartureAirportSelect({ airports, selectedIcao, onSelect }) {
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

/**
 * 운영자용 조작 모음. 승객이 볼 안내판에 버튼이 늘어서 있으면 안 되므로 모서리로 내린다.
 * 평소에는 흐리게 두고 마우스를 올려야 진해진다. 마우스가 없는 실제 전광판에서는 없는 것과 같다.
 * 여닫기는 `details`가 해준다. 상태 변수도, 바깥 클릭 처리도 필요 없다.
 */
export function TerminalSettings({ children }) {
  const box = useRef(null);
  // 열어둔 채 두면 승객이 볼 화면에 패널이 남는다. Escape와 바깥 클릭으로도 닫는다.
  useEffect(() => {
    const close = (event) => {
      const panel = box.current;
      if (!panel?.open) return;
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && panel.contains(event.target)) return;
      panel.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, []);
  return (
    <details className="terminal-settings" ref={box}>
      <summary aria-label="화면 설정"><MdSettings /></summary>
      <div className="terminal-settings-panel">{children}</div>
    </details>
  );
}

export function PageIndicator({ currentFrame, frameCount }) {
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

export function AgencyMascot() {
  return <img className="agency-mascot" src="/gisang-i/clear_3_avatar.png" alt="항공기상청 기상이" />;
}

/** 운항 정보 출처. 화면 아래 왼쪽에 두고, 오른쪽 항공기상청 안내와 좌우로 나눠 놓는다. */
export function ScreenFooterNote() {
  return (
    <div className="screen-footer-note">
      <MdInfoOutline />
      <span>한국공항공사 실시간 운항정보</span>
    </div>
  );
}

export function HeaderWeatherPanel({ showWordmark = false }) {
  return (
    <a className="header-weather-panel" href="https://amo.kma.go.kr/weather/airport.do">
      <img src={airportWeatherQr} alt="목적지 공항 상세 날씨 QR 코드" />
      <span><strong>목적지 공항 상세 날씨</strong><small>amo.kma.go.kr</small></span>
      {showWordmark && <img className="agency-wordmark" src={amoWordmark} alt="책임운영기관 항공기상청" />}
    </a>
  );
}

/** 모드 목록과 aria-label은 화면마다 다르므로 호출하는 쪽이 항상 넘긴다. */
export function MotionModeSwitcher({ motionMode, onSelectMotion, modes, ariaLabel }) {
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

/**
 * 마지막 편이 뜬 뒤 자정까지의 빈 시간. 공항 전광판이 쓰는 어투로 사실만 적는다.
 * 밤늦게 남은 승객에는 외국인도 있어 영문을 함께 건다.
 * 기상이는 눈을 감고 웃는 그림(clear_2)이다. 하루를 닫는 화면과 표정이 맞는다.
 */
export function TerminalEmptyState({ airportName, referenceClock }) {
  return (
    <div className="terminal-empty-state" role="status">
      <i className="terminal-empty-rule" aria-hidden="true" />
      <div className="terminal-empty-body">
        <img src="/gisang-i/clear_2.png" alt="" aria-hidden="true" />
        <strong>금일 운항이 종료되었습니다</strong>
        <span lang="en">Today&rsquo;s departures have ended</span>
        <small>{airportName} · {referenceClock} 기준</small>
      </div>
      <i className="terminal-empty-rule" aria-hidden="true" />
    </div>
  );
}

export function TerminalTitle({ title }) {
  return <h1>{title}</h1>;
}

/* ===== 2안·3안 공용 — 위쪽 절반(머리띠·현재날씨·기온차·항공편 목록) ===== */
// 클래스 이름은 `tw-`(terminal weather 공용)로 시작한다. `wf-`(2안)·`ww-`(3안)와 겹치지 않아야,
// 나중에 안 하나를 지울 때 어느 CSS가 남아야 하는지 헷갈리지 않는다.

/** 항공편 줄. 공동운항은 편명만 위아래로 쌓고 시각·탑승구는 하나만 둔다.
 * 목록 전체가 이미 순환하는데 그 안에서 편명까지 3초마다 돌리면 시선이 두 겹으로 흔들린다. */
export function FlightRow({ flight }) {
  const isCodeshare = flight.codeshares?.length >= 2;
  const isDelayed = Boolean(flight.revised);
  const isGateChanged = flight.status === GATE_CHANGED_STATUS;
  return (
    <li className="tw-flight-row" data-testid="tw-flight-row" data-destination-code={flight.code}>
      <div className="tw-flight-number">
        {isCodeshare
          ? <span className="tw-flight-number-stack">{flight.codeshares.map((share) => <strong key={share.flight}>{share.flight}</strong>)}</span>
          : <strong>{flight.flight}</strong>}
        {isCodeshare && <b className="codeshare-badge">공동운항</b>}
      </div>
      <div className={`tw-flight-time${isDelayed ? " is-delayed" : ""}`}>
        <strong>{flight.revised ?? flight.departure}</strong>
      </div>
      <div className={`tw-flight-gate${isGateChanged ? " is-changed" : ""}`}>
        <strong>{UNDECIDED_VALUES.has(flight.gate) ? <em className="value-unknown">{flight.gate}</em> : flight.gate}</strong>
      </div>
      <div className={`tw-flight-status${isDelayed ? " is-delay" : ""}`}>
        <strong>{flight.status}</strong>
      </div>
    </li>
  );
}

/** 목록은 항상 다섯 줄 자리를 잡는다. 편이 몇 편이든 자리 수가 같아야 도시가 바뀔 때 목록 높이가
 * 흔들리지 않는다. 빈 줄은 투명하게 둬야 전환 중 자리가 안 밀린다. */
export function FlightList({ flights }) {
  const rows = flights.slice(0, DESTINATION_FRAME_CAPACITY);
  const emptyCount = DESTINATION_FRAME_CAPACITY - rows.length;
  return (
    <ul className="tw-flight-list">
      {rows.map((flight) => <FlightRow flight={flight} key={flight.flightKey} />)}
      {Array.from({ length: emptyCount }, (_, index) => <li className="is-empty" aria-hidden="true" key={`empty-${index}`} />)}
    </ul>
  );
}

/** 도시가 이 개수 이하면 순환 표시에 전부 이름을 보여준다. 넘으면 현재 도시 앞뒤만 이름을 남기고
 * 나머지는 점으로 줄인다 - 실제 화면에서 다시 조정할 수 있게 상수로 둔다. */
const PAGER_ALL_NAMES_MAX = 7;
const PAGER_NAME_WINDOW = 2;

/** 도시 순환 표시. 이름 + 점. 도시가 많으면 현재 도시 앞뒤만 이름을 보이고 나머지는 점으로 둔다. */
export function DestinationPager({ destinations, destinationIndex }) {
  const showAllNames = destinations.length <= PAGER_ALL_NAMES_MAX;
  return (
    <nav className="tw-destination-pager" aria-label="목적지 도시 순환">
      {destinations.map((destination, index) => {
        const isCurrent = index === destinationIndex;
        const showName = showAllNames || Math.abs(index - destinationIndex) <= PAGER_NAME_WINDOW;
        return (
          <span className={`tw-pager-item${isCurrent ? " is-current" : ""}`} key={destination.code}>
            {showName ? destination.city : <i className="tw-pager-dot" aria-hidden="true" />}
          </span>
        );
      })}
    </nav>
  );
}

/** 아이콘 · 지금 도시 · 기온 · 하늘상태/바람 · 출발지 대비 기온차. 기온차 자리는 비어도 유지한다 -
 * 도시마다 있고 없고가 갈리면 현재날씨 가로 배치가 전환 중에 밀린다. */
export function CurrentWeatherBlock({ flight, departureName, departureTemp }) {
  const gap = temperatureGap(departureTemp, flight.current.temp);
  return (
    <div className="tw-current-weather">
      <div className="tw-current-weather-main">
        <WeatherIcon type={flight.current.icon} className="tw-current-weather-icon" />
        <div className="tw-current-weather-body">
          <p className="tw-current-weather-title">지금 {flight.city}</p>
          <strong className="tw-current-weather-temp">
            {flight.current.temp == null ? <em className="value-unknown">확인 중</em> : <>{flight.current.temp}<small>°C</small></>}
          </strong>
          <p className="tw-current-weather-detail"><WeatherCondition type={flight.current.icon} /> · {flight.current.wind}</p>
        </div>
      </div>
      <div className="tw-temp-gap">
        {gap && <><span>{departureName}보다</span><strong>{gap.sign}{gap.value}°</strong></>}
      </div>
    </div>
  );
}
