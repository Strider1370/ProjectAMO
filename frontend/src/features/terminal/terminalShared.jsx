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

/** 기온차 문구용 짧은 공항 이름. `김포국제공항` → `김포`. 인천·김해·제주 모두 자연스럽게 읽힌다. */
export function shortAirportName(value) {
  return String(value || '').replace(/국제공항|공항/g, '').trim();
}

/** 강수 줄 제목. 국내는 `강수확률 %`, 해외는 `강수량 mm` — 칸마다 반복하지 않고 줄에 한 번만 적는다.
 * 한 화면은 도시 하나만 보여주므로 칸 안에서 단위가 섞이지 않는다. */
export function PrecipRowLabel({ cells, className }) {
  const sample = cells.find((cell) => cell?.precipKind);
  if (!sample) return null;
  return <p className={className}>{sample.precipKind === 'prob' ? '강수확률 %' : '강수량 mm'}</p>;
}

/** 항공편 줄. 공동운항은 편명만 위아래로 쌓고 시각·탑승구는 하나만 둔다.
 * 목록 전체가 이미 순환하는데 그 안에서 편명까지 3초마다 돌리면 시선이 두 겹으로 흔들린다. */
export function FlightRow({ flight, showAirline = false }) {
  const isExpandedCodeshare = Boolean(flight.codeshareGroup);
  const isCodeshare = !isExpandedCodeshare && flight.codeshares?.length >= 2;
  const isDelayed = Boolean(flight.revised);
  const isGateChanged = flight.status === GATE_CHANGED_STATUS;
  return (
    <li
      className={`tw-flight-row${isExpandedCodeshare ? " is-codeshare" : ""}`}
      data-testid="tw-flight-row"
      data-destination-code={flight.code}
      data-flight-number={flight.flight}
      data-codeshare-group={flight.codeshareGroup || undefined}
    >
      {/* 항공사 로고는 1안이 쓰는 것을 그대로 가져온다. 편명 앞 두 글자만으로도 항공사를 알 수는
          있지만, 로고가 있으면 승객이 글자를 읽기 전에 자기 항공사 줄을 찾는다. */}
      <AirlineLogo flight={flight} />
      <div className="tw-flight-number">
        {isCodeshare
          ? <span className="tw-flight-number-stack">{flight.codeshares.map((share) => <strong key={share.flight}>{share.flight}</strong>)}</span>
          : showAirline
            ? <span className="tw-flight-number-detail"><strong>{flight.flight}</strong><small>{flight.airline}</small></span>
            : <strong>{flight.flight}</strong>}
        {(isCodeshare || isExpandedCodeshare) && <b className="codeshare-badge">공동운항</b>}
      </div>
      <div className={`tw-flight-time${isDelayed ? " is-delayed" : ""}`}>
        <strong>{flight.revised ?? flight.departure}</strong>
      </div>
      <div className={`tw-flight-gate${isGateChanged ? " is-changed" : ""}`}>
        {/* 숫자가 올 자리에 `확인 중` 같은 상태 문구가 들어가면 열의 뜻이 흔들린다.
            미정은 기호로 두고 상태는 상태 칸이 말하게 한다. */}
        <strong>{UNDECIDED_VALUES.has(flight.gate) ? <em className="value-unknown" aria-label="탑승구 미정">–</em> : flight.gate}</strong>
      </div>
      {/* 상태는 1안의 `.operation-status`를 그대로 쓴다 - 색 점과 색 글자가 한 덩어리로 붙어야
          지연·탑승구 변경이 무채색 글자 사이에서 눈에 띈다. */}
      {/* 색만 다르면 적록색각 이상(남성 약 8%)에게 정상과 지연이 같아 보인다. 지연은 점을
          마름모로 바꿔 모양으로도 구분되게 한다. */}
      <div className={`operation-status${isDelayed || isGateChanged ? " is-delay" : ""}`}>
        <i />
        <strong>{flight.status}</strong>
      </div>
    </li>
  );
}

/** 2안은 다섯 줄 자리를 유지하고, 3안은 시안처럼 실제 편수만 같은 높이로 나눈다. */
export function FlightList({ flights, fillRows = true, showAirline = false, overflowing = false, rolling = false }) {
  const rows = flights.slice(0, overflowing ? DESTINATION_FRAME_CAPACITY + 1 : DESTINATION_FRAME_CAPACITY);
  const emptyCount = fillRows ? Math.max(0, DESTINATION_FRAME_CAPACITY - rows.length) : 0;
  const rowCount = fillRows ? DESTINATION_FRAME_CAPACITY : Math.max(rows.length, 3);
  return (
    <div className="tw-flight-panel">
      {/* 열 제목이 없으면 `06:00 확인 중 운항 예정`이 한 문장처럼 읽혀 어느 값이 시각이고
          어느 값이 탑승구인지 구분되지 않는다. */}
      <div className="tw-flight-head" aria-hidden="true">
        <span /><span>편명</span><span>출발</span><span>탑승구</span><span>상태</span>
      </div>
      <div className="tw-flight-list-viewport">
        <ul className={`tw-flight-list${overflowing ? " is-overflowing" : ""}${rolling ? " is-rolling" : ""}`} style={{ "--tw-flight-row-count": rowCount }}>
          {rows.map((flight, index) => <FlightRow flight={flight} showAirline={showAirline} key={`${index}-${flight.flightKey}`} />)}
          {Array.from({ length: emptyCount }, (_, index) => <li className="is-empty" aria-hidden="true" key={`empty-${index}`} />)}
        </ul>
      </div>
    </div>
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
            {showName ? (isCurrent ? destination.displayName || destination.city : destination.city) : <i className="tw-pager-dot" aria-hidden="true" />}
          </span>
        );
      })}
    </nav>
  );
}

/** 아이콘 · 지금 도시 · 기온 · 하늘상태/바람 · 출발지 대비 기온차. 기온차 자리는 비어도 유지한다 -
 * 도시마다 있고 없고가 갈리면 현재날씨 가로 배치가 전환 중에 밀린다. */
/** METAR 관측 시각을 `01:30`으로 줄인다. 값이 언제 것인지 모르면 낡은 값이 떠 있어도 알 수 없다. */
function formatObservedAt(value) {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

export function CurrentWeatherBlock({ flight, departureName, departureTemp, variant = 'default' }) {
  const gap = temperatureGap(departureTemp, flight.current.temp);
  const observedAt = formatObservedAt(flight.current.observedAt);
  const localTime = String(flight.localClock || '').split(' ').at(-1);
  return (
    <div className="tw-current-weather">
      {/* 도시명은 이 블록의 것이다. 머리띠에 두면 화면 제목처럼 읽혀 무슨 화면인지와
          어느 도시인지가 뒤섞인다. 머리띠는 화면 이름, 여기는 값의 주인을 말한다. */}
      <p className="tw-current-city"><strong>{variant === 'weekly' ? flight.displayName || flight.city : flight.city}</strong>{variant !== 'weekly' && <span>{flight.code}</span>}</p>
      {variant === 'weekly' && <p className="tw-current-local-clock">현지 시각 <time>{localTime} {flight.localZone}</time></p>}
      <div className="tw-current-weather-main">
        <span className="tw-current-weather-icon"><BoardWeatherImage type={flight.current.icon} /></span>
        <div className="tw-current-weather-body">
          {/* 도시명은 화면 제목에 이미 크게 있다. 여기서는 `지금`과 관측 시각만 말한다 -
              값이 방금 것인지 한 시간 전 것인지 알 수 없으면 승객이 판단을 못 한다. */}
          <p className="tw-current-weather-title">지금{observedAt && <time> · {observedAt} 관측</time>}</p>
          <strong className="tw-current-weather-temp">
            {flight.current.temp == null ? <em className="value-unknown">확인 중</em> : <>{flight.current.temp}<small>°C</small></>}
          </strong>
          <p className="tw-current-weather-detail"><WeatherCondition type={flight.current.icon} /></p>
        </div>
      </div>
      {variant === 'weekly' && gap && <p className="tw-current-gap">{shortAirportName(departureName)}보다 {gap.sign}{gap.value}°</p>}
      {/* 체감·습도·바람은 이미 관측에서 계산해 두고도 화면에 안 쓰던 값이다. 방송 기상 그래픽이
          수십 년 쓰는 세로 칸 구조로 나란히 둔다 - 승객이 묻는 "뭘 입지"에 답하는 값들이다.
          값이 없는 항목은 칸째 비우지 않고 `-`로 자리를 지킨다(도시마다 칸 수가 달라지면 안 된다). */}
      <dl className="tw-current-metrics">
        <div><dt>체감</dt><dd>{displayTemperature(flight.current.feels ?? '-')}</dd></div>
        <div><dt>습도</dt><dd>{flight.current.humidity ?? '-'}</dd></div>
        <div><dt>바람</dt><dd className="tw-metric-wind">{flight.current.wind ?? '-'}</dd></div>
        {/* 2안은 기온차를 네 번째 칸에, 3안은 시안의 강조 알약으로 둔다. */}
        {variant !== 'weekly' && <div className="tw-metric-gap">
          <dt>{gap ? `${shortAirportName(departureName)}보다` : ''}</dt>
          <dd>{gap ? `${gap.sign}${gap.value}°` : ''}</dd>
        </div>}
      </dl>
    </div>
  );
}
