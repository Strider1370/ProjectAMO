import { useEffect, useRef, useState } from "react";
import { MdChevronRight } from "react-icons/md";
import {
  CurrentWeatherBlock,
  DepartureAirportSelect,
  FlightList,
  MotionModeSwitcher,

  TerminalEmptyState,
  TerminalSettings,
  ViewSwitcher,
  BoardWeatherImage,
} from './terminalShared.jsx';
import { addDays, dayCycleStrip, isPrecipHighlighted } from './terminalForecastStrip.js';
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

function flightForecastCells(forecast, startDate) {
  if (!Array.isArray(forecast)) return [];
  let date = startDate;
  let previousHour = null;
  return forecast.flatMap(([label, icon, temperature]) => {
    const temp = Number.parseFloat(String(temperature).replace(/[^\d.-]/g, ''));
    const hour = Number.parseInt(label, 10);
    if (date && Number.isFinite(hour) && previousHour != null && hour < previousHour) date = addDays(date, 1);
    if (Number.isFinite(hour)) previousHour = hour;
    return Number.isFinite(temp) ? [{ date, label, icon, temp, precipKind: null, precipValue: null }] : [];
  });
}

/** 왼쪽. 3시간 간격 여덟 칸을 날짜 구분 없이 잇는다. 칸 수가 고정이라 도시가 바뀌어도 폭이 안 변한다. */
function HourlyStrip({ cells, title }) {
  /* 2안 예보 띠와 같은 규칙. 맨 왼쪽 라벨 칸을 두어 `시간별`·`강수확률 %` 같은 줄 제목과
     값들이 같은 세로선에서 시작하게 한다. */
  const columns = `var(--ww-strip-gutter) repeat(${HOURLY_CELL_COUNT}, 1fr)`;
  const slots = Array.from({ length: HOURLY_CELL_COUNT }, (unused, index) => cells[index] || null);
  const temps = cells.map((cell) => cell.temp);
  const min = temps.length ? Math.min(...temps) : 0;
  const max = temps.length ? Math.max(...temps) : 0;
  const span = Math.max(1, max - min);
  /* 2안과 같은 규칙 - 기온 숫자를 점에 붙여 선과 함께 오르내리게 한다. */
  const chartPoints = cells.map((cell, index) => ({
    x: ((index + 0.5) / HOURLY_CELL_COUNT) * 100,
    y: 94 - ((cell.temp - min) / span) * 52,
    temp: cell.temp,
  }));
  const line = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const area = chartPoints.length
    ? `${chartPoints[0].x},100 ${line} ${chartPoints[chartPoints.length - 1].x},100`
    : '';
  const precipKind = cells.find((cell) => cell?.precipKind)?.precipKind;
  const dayLabel = (cell, index) => (
    cell?.date && (index === 0 || cell.date !== slots[index - 1]?.date)
      ? `${Number(cell.date.slice(-2))}일`
      : ''
  );
  return (
    <div className="ww-hourly-strip">
      <div className="ww-hourly-row ww-hourly-hour-row" style={{ gridTemplateColumns: columns }}>
        {/* 표 머리의 빈 칸을 제목 자리로 쓴다. 위에 제목 줄을 따로 두면 그만큼 예보가 눌린다. */}
        <h2 className="ww-grid-title">{title}</h2>
        {slots.map((cell, index) => <time key={index}><small>{dayLabel(cell, index)}</small><span>{cell?.label ?? ''}</span></time>)}
      </div>
      <div className="ww-hourly-row ww-hourly-icon-row" style={{ gridTemplateColumns: columns }}>
        <p className="ww-hourly-row-label">날씨</p>
        {slots.map((cell, index) => (
          <span className="ww-hourly-icon" key={index}>
            {cell && <BoardWeatherImage type={cell.icon} small />}
          </span>
        ))}
      </div>
      <div className="ww-hourly-row ww-hourly-chart-row" style={{ gridTemplateColumns: columns }}>
        <p className="ww-hourly-row-label">온도</p>
        <svg className="ww-hourly-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon className="ww-hourly-area" points={area} />
          <polyline points={line} fill="none" />
        </svg>
        <div className="ww-hourly-points">
          {chartPoints.map((point, index) => (
            <span className="ww-hourly-point" style={{ left: `${point.x}%`, top: `${point.y}%` }} key={index}>
              <b>{point.temp}°</b>
            </span>
          ))}
        </div>
      </div>
      <div className="ww-hourly-row ww-hourly-precip-row" style={{ gridTemplateColumns: columns }}>
        <p className="ww-hourly-row-label">{precipKind === 'amount' ? '강수량 mm' : '강수확률 %'}</p>
        {/* 알약 배경은 안쪽 <b>에만 준다. 2안과 같은 이유다. */}
        {slots.map((cell, index) => (
          <span key={index}>
            <b className={cell && isPrecipHighlighted(cell) ? "is-highlighted" : undefined}>
              {cell?.precipValue == null ? '–' : cell.precipKind === 'prob' ? `${cell.precipValue}%` : `${cell.precipValue}mm`}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

const FLIGHT_ROW_COUNT = 5;
const FLIGHT_ROLL_INTERVAL_MS = 4000;
const FLIGHT_ROLL_DURATION_MS = 450;

export function expandWeeklyFlights(flights) {
  return flights.flatMap((flight) => {
    if (!flight.codeshares || flight.codeshares.length < 2) return [flight];
    return flight.codeshares.map((share, index) => ({
      ...flight,
      ...share,
      flightKey: `${flight.flightKey}-${share.flight}`,
      codeshares: null,
      codeshareGroup: flight.flightKey,
      codeshareIndex: index,
      codeshareCount: flight.codeshares.length,
    }));
  });
}

function RollingFlightList({ flights }) {
  const rows = expandWeeklyFlights(flights);
  const signature = rows.map((flight) => flight.flightKey).join('|');
  const [offset, setOffset] = useState(0);
  const [rolling, setRolling] = useState(false);
  const finishTimer = useRef(null);
  const overflowing = rows.length > FLIGHT_ROW_COUNT;

  useEffect(() => {
    setOffset(0);
    setRolling(false);
  }, [signature]);

  useEffect(() => {
    if (!overflowing) return undefined;
    const interval = window.setInterval(() => {
      setRolling(true);
      window.clearTimeout(finishTimer.current);
      finishTimer.current = window.setTimeout(() => {
        setOffset((current) => (current + 1) % rows.length);
        setRolling(false);
      }, FLIGHT_ROLL_DURATION_MS);
    }, FLIGHT_ROLL_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(finishTimer.current);
    };
  }, [overflowing, rows.length, signature]);

  const visibleRows = overflowing
    ? Array.from({ length: FLIGHT_ROW_COUNT + 1 }, (_, index) => rows[(offset + index) % rows.length])
    : rows;
  return <FlightList flights={visibleRows} showAirline overflowing={overflowing} rolling={rolling} />;
}

/** 오른쪽. 다섯 줄 고정. 아이콘과 기온을 짝지어 붙인다 - 떨어뜨리면 어느 아이콘이
 * 어느 기온인지 승객이 눈으로 이어야 한다. 최저는 파랑, 최고는 빨강. */
function WeeklyPanel({ rows, title }) {
  const hasForecast = rows.some((row) => !row.empty);
  return (
    <>
      {/* 오전/오후 제목은 첫 줄 위에만 한 번 둔다. 아이콘·기온 두 벌 중 어느 게 오전인지
       * 승객이 매 줄 눈으로 짐작하지 않게 한다. */}
      {/* 제목을 한 덩어리로 가운데 두면 `오전`이 오전 그림 위에 서지 않는다. 아래 값과 같은
          2열 격자를 써서 낱말 하나가 값 하나 위에 정확히 오게 한다. */}
      <div className="ww-weekly-header">
        <h2 className="ww-grid-title">{title}</h2>
        {/* 값 위의 낱말은 화면 안내에서 중복이라 읽지 않는다(원래 헤더 전체가 aria-hidden이었다). */}
        <span className="ww-head-icons" aria-hidden="true"><i>오전</i><i>오후</i></span>
        <span className="ww-head-temps" aria-hidden="true"><i className="ww-temp-min">최저</i><i className="ww-temp-max">최고</i></span>
      </div>
      {hasForecast ? <ul className="ww-weekly-list">
        {rows.map((row, index) => (
          // weeklyRows가 돌려주는 빈 줄은 얼려진 공유 객체라 값 기반 key를 못 쓴다. 순번을 쓴다.
          <li className={`ww-weekly-row${row.empty ? " is-empty" : ""}${row.dayOfWeek === '토' ? ' is-saturday' : ''}${row.dayOfWeek === '일' ? ' is-sunday' : ''}`} aria-hidden={row.empty || undefined} key={index}>
            {!row.empty && (
              <>
                <div className="ww-weekly-date">
                  <strong>{row.dayOfWeek}</strong>
                  <span>{row.monthDay}</span>
                </div>
                {/* 오전·오후 그림을 나란히 붙이고 그 뒤에 최저·최고를 둔다. 그림과 기온을
                    번갈아 놓으면 하루가 두 덩이로 쪼개져 보인다. */}
                <div className="ww-weekly-icons">
                  <span className="ww-weekly-icon"><BoardWeatherImage type={row.amIcon} small /></span>
                  <span className="ww-weekly-icon"><BoardWeatherImage type={row.pmIcon} small /></span>
                </div>
                <div className="ww-weekly-temps">
                  <strong className="ww-temp-min">{row.tempMin == null ? '' : `${row.tempMin}°`}</strong>
                  <strong className="ww-temp-max">{row.tempMax == null ? '' : `${row.tempMax}°`}</strong>
                </div>
              </>
            )}
          </li>
        ))}
      </ul> : <p className="ww-weekly-empty">주간 예보 확인 중</p>}
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
  frameSeconds = 30,
}) {
  const flights = frame?.flights || [];
  // 화면 하나가 도시 하나를 맡는다 - 첫 편의 목적지 정보(도시명·현재날씨)가 화면 전체를 대표한다.
  const primaryFlight = flights[0];
  const liveCells = dayCycleStrip(hourly, nowKst);
  const cells = liveCells.length ? liveCells : flightForecastCells(primaryFlight?.forecast, nowKst?.date);
  const rows = weeklyRows(days, nowKst?.date);
  const hasFlights = flights.length > 0;
  return (
    <section className={`exact-screen ww-screen motion-${motionMode}${hasFlights ? "" : " is-operations-ended"}`} data-testid="option-three">
      <header className="ww-header">
        {/* 머리띠 왼쪽은 화면 이름이다. 도시명은 현재날씨 블록이 말한다. */}
        <h1 className="ww-header-title">목적지 날씨</h1>
        <div className="ww-header-clock">
          <div className="ww-header-time"><span>{clock.date}</span><strong>{clock.time}</strong></div>
        </div>
        {/* 30초마다 도시가 바뀌는데 남은 시간을 모르면, 주간 예보를 읽다 화면이 넘어갔을 때
            승객이 처음부터 다시 기다려야 할지 판단할 수 없다. */}
        <i
          className="tw-frame-progress"
          style={{ "--frame-seconds": `${frameSeconds}s` }}
          key={`${frame?.code ?? ''}-${frame?.page ?? 0}`}
          aria-hidden="true"
          data-testid="frame-progress"
        />
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
          {/* 프레임이 바뀌면 key가 달라져 이 덩어리가 다시 마운트되고, 그때 들어오는 애니메이션이
              처음부터 다시 돈다. 나가는 화면을 따로 그리지 않아도 전환이 보인다. */}
          <div
            className={`ww-page${transitioning ? " is-leaving" : ""}`}
            key={`${frame?.code ?? ''}-${frame?.page ?? 0}`}
            data-testid="ww-active-page"
          >
            <div className="ww-middle">
              <CurrentWeatherBlock flight={primaryFlight} departureName={departureName} departureTemp={departureTemp} variant="terminal-weather" />
              <div className="ww-flight-panel">
                <RollingFlightList flights={flights} />
              </div>
            </div>
            <div className="ww-bottom">
              <div className="ww-hourly-panel">
                <HourlyStrip cells={cells} title="시간별 예보" />
              </div>
              <div className="ww-weekly-panel">
                <WeeklyPanel rows={rows} title="주간 예보" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <TerminalEmptyState airportName={departureName} referenceClock={clock.time} />
      )}
    </section>
  );
}
