import { MdChevronRight } from "react-icons/md";
import {
  CurrentWeatherBlock,
  DepartureAirportSelect,
  DestinationPager,
  FlightList,
  HeaderWeatherPanel,
  MotionModeSwitcher,

  ScreenFooterNote,
  TerminalEmptyState,
  TerminalSettings,
  ViewSwitcher,
  BoardWeatherImage,
} from './terminalShared.jsx';
import { dayCycleStrip, isPrecipHighlighted } from './terminalForecastStrip.js';
import { weeklyRows } from './terminalWeeklyForecast.js';

const MOTION_MODES = [
  ["cascade", "CASCADE", "행 순차"],
  ["flap", "FLAP", "뒤집기"],
  ["roll", "ROLL", "세로 롤"],
  ["wipe", "WIPE", "마스크"],
  ["fade", "FADE", "겹침"],
];

// 칸 수를 자료 길이(cells.length)가 아니라 이 상수로 고정한다. 자정 부근이라 자료가
// 8칸을 다 못 채워도 격자 폭은 그대로 둬야 도시가 바뀔 때 폭이 흔들리지 않는다.
const HOURLY_CELL_COUNT = 8;

/** 왼쪽. 3시간 간격 여덟 칸을 날짜 구분 없이 잇는다. 칸 수가 고정이라 도시가 바뀌어도 폭이 안 변한다. */
function HourlyStrip({ cells }) {
  /* 2안 예보 띠와 같은 규칙. 맨 왼쪽 라벨 칸을 두어 `시간별`·`강수확률 %` 같은 줄 제목과
     값들이 같은 세로선에서 시작하게 한다. */
  const columns = `var(--ww-strip-gutter) repeat(${HOURLY_CELL_COUNT}, 1fr)`;
  const slots = Array.from({ length: HOURLY_CELL_COUNT }, (unused, index) => cells[index] || null);
  const temps = cells.map((cell) => cell.temp);
  const min = temps.length ? Math.min(...temps) : 0;
  const max = temps.length ? Math.max(...temps) : 0;
  const span = Math.max(1, max - min);
  const points = cells
    .map((cell, index) => {
      const x = ((index + 0.5) / HOURLY_CELL_COUNT) * 100;
      const y = 94 - ((cell.temp - min) / span) * 88;
      return `${x},${y}`;
    })
    .join(' ');
  const precipKind = cells.find((cell) => cell?.precipKind)?.precipKind;
  return (
    <div className="ww-hourly-strip">
      <div className="ww-hourly-row ww-hourly-hour-row" style={{ gridTemplateColumns: columns }}>
        <i aria-hidden="true" />
        {slots.map((cell, index) => <time key={index}>{cell?.label ?? ''}</time>)}
      </div>
      <div className="ww-hourly-row ww-hourly-icon-row" style={{ gridTemplateColumns: columns }}>
        <i aria-hidden="true" />
        {slots.map((cell, index) => (
          <span className="ww-hourly-icon" key={index}>
            {cell && <BoardWeatherImage type={cell.icon} small />}
          </span>
        ))}
      </div>
      <div className="ww-hourly-row ww-hourly-line-row" style={{ gridTemplateColumns: columns }}>
        <svg className="ww-hourly-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={points} fill="none" />
        </svg>
      </div>
      <div className="ww-hourly-row ww-hourly-temp-row" style={{ gridTemplateColumns: columns }}>
        <i aria-hidden="true" />
        {slots.map((cell, index) => <strong key={index}>{cell ? `${cell.temp}°` : ''}</strong>)}
      </div>
      <div className="ww-hourly-row ww-hourly-precip-row" style={{ gridTemplateColumns: columns }}>
        <p className="ww-hourly-row-label">{precipKind === 'amount' ? '강수량 mm' : '강수확률 %'}</p>
        {/* 알약 배경은 안쪽 <b>에만 준다. 2안과 같은 이유다. */}
        {slots.map((cell, index) => (
          <span key={index}>
            <b className={cell && isPrecipHighlighted(cell) ? "is-highlighted" : undefined}>
              {cell?.precipValue == null ? '' : cell.precipKind === 'prob' ? `${cell.precipValue}%` : `${cell.precipValue}mm`}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 오른쪽. 다섯 줄 고정. 아이콘과 기온을 짝지어 붙인다 - 떨어뜨리면 어느 아이콘이
 * 어느 기온인지 승객이 눈으로 이어야 한다. 최저는 파랑, 최고는 빨강. */
function WeeklyPanel({ rows }) {
  return (
    <>
      {/* 오전/오후 제목은 첫 줄 위에만 한 번 둔다. 아이콘·기온 두 벌 중 어느 게 오전인지
       * 승객이 매 줄 눈으로 짐작하지 않게 한다. */}
      <div className="ww-weekly-header" aria-hidden="true">
        <span />
        <span>오전</span>
        <span>오후</span>
      </div>
      <ul className="ww-weekly-list">
        {rows.map((row, index) => (
          // weeklyRows가 돌려주는 빈 줄은 얼려진 공유 객체라 값 기반 key를 못 쓴다. 순번을 쓴다.
          <li className={`ww-weekly-row${row.empty ? " is-empty" : ""}`} aria-hidden={row.empty || undefined} key={index}>
            {!row.empty && (
              <>
                <div className="ww-weekly-date">
                  <strong>{row.dayOfWeek}</strong>
                  <span>{row.monthDay}</span>
                </div>
                <div className="ww-weekly-am">
                  <span className="ww-weekly-icon"><BoardWeatherImage type={row.amIcon} small /></span>
                  <strong className="ww-temp-min">{row.tempMin == null ? '' : `${row.tempMin}°`}</strong>
                </div>
                <div className="ww-weekly-pm">
                  <span className="ww-weekly-icon"><BoardWeatherImage type={row.pmIcon} small /></span>
                  <strong className="ww-temp-max">{row.tempMax == null ? '' : `${row.tempMax}°`}</strong>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function WeeklyWeatherScreen({
  frame,
  destinations,
  destinationIndex,
  departureName,
  departureTemp,
  hourly,
  days,
  nowKst,
  transitioning,
  motionMode,
  onSelectMotion,
  onSelectView,
  onReplay,
  hasNext,
  clock,
  departureAirports,
  departureAirportIcao,
  onSelectDepartureAirport,
}) {
  const flights = frame?.flights || [];
  // 화면 하나가 도시 하나를 맡는다 - 첫 편의 목적지 정보(도시명·현재날씨)가 화면 전체를 대표한다.
  const primaryFlight = flights[0];
  const cells = dayCycleStrip(hourly, nowKst);
  const rows = weeklyRows(days, nowKst?.date);
  const hasFlights = flights.length > 0;
  return (
    <section className={`exact-screen ww-screen motion-${motionMode}${hasFlights ? "" : " is-operations-ended"}`} data-testid="option-three">
      <header className="ww-header">
        {/* 도시 이름 길이가 달라도(제주/오사카) 오른쪽 순환 표시가 밀리지 않게 왼쪽 칸 폭을 고정한다. */}
        <div className="ww-header-city">
          {primaryFlight
            ? <><strong>{primaryFlight.city}</strong><span>{frame.code}</span></>
            : <strong>{departureName}</strong>}
        </div>
        <DestinationPager destinations={destinations} destinationIndex={destinationIndex} />
        <div className="ww-header-clock"><span>{clock.date}</span><strong>{clock.time}</strong></div>
      </header>
      <TerminalSettings>
        <DepartureAirportSelect airports={departureAirports} selectedIcao={departureAirportIcao} onSelect={onSelectDepartureAirport} />
        <ViewSwitcher view="rail" onSelectView={onSelectView} />
        <MotionModeSwitcher motionMode={motionMode} onSelectMotion={onSelectMotion} modes={MOTION_MODES} ariaLabel="3안 전환 애니메이션" />
        <button type="button" className="next-board-button" onClick={onReplay} disabled={!hasNext}>
          <MdChevronRight /><span>다음 도시</span>
        </button>
      </TerminalSettings>
      {hasFlights ? (
        <div className="ww-viewport">
          <div className={`ww-page${transitioning ? " is-leaving" : ""}`} data-testid="ww-active-page">
            <div className="ww-middle">
              <CurrentWeatherBlock flight={primaryFlight} departureName={departureName} departureTemp={departureTemp} />
              <FlightList flights={flights} />
            </div>
            <div className="ww-bottom">
              <div className="ww-hourly-panel">
                <h2 className="ww-panel-title">시간별</h2>
                <HourlyStrip cells={cells} />
              </div>
              <div className="ww-weekly-panel">
                <h2 className="ww-panel-title">주간</h2>
                <WeeklyPanel rows={rows} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <TerminalEmptyState airportName={departureName} referenceClock={clock.time} />
      )}
      <footer className="screen-footer ww-footer">
        <ScreenFooterNote />
        <HeaderWeatherPanel showWordmark />
      </footer>
    </section>
  );
}
