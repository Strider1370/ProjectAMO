import { MdChevronRight } from "react-icons/md";
import {
  CurrentWeatherBlock,
  DepartureAirportSelect,
  DestinationPager,
  FlightList,
  MotionModeSwitcher,
  TerminalEmptyState,
  TerminalSettings,
  ViewSwitcher,
  BoardWeatherImage,
} from './terminalShared.jsx';
import { threeDayStrip, isPrecipHighlighted, formatMonthDay } from './terminalForecastStrip.js';

const GROUP_TITLES = { today: () => '오늘', tomorrow: (md) => `내일 ${md}`, dayAfter: (md) => `모레 ${md}` };

/** 오늘 | 내일 8/5 | 모레 8/6 — 구간이 바뀌는 첫 칸에서 몇 칸을 묶는지 센다.
 * 국내 목적지는 밤에 모레 구간이 통째로 빌 수 있는데, cells가 애초에 그 구간을 안 담고 있어
 * 여기서도 자연히 빠진다 — 접거나 나누는 처리를 따로 하지 않아도 된다. */
function forecastGroupRuns(cells) {
  const runs = [];
  for (const cell of cells) {
    const last = runs[runs.length - 1];
    if (last && last.group === cell.group) { last.count += 1; continue; }
    runs.push({ group: cell.group, date: cell.date, count: 1 });
  }
  return runs.map((run) => ({ ...run, title: GROUP_TITLES[run.group](formatMonthDay(run.date)) }));
}

const MOTION_MODES = [
  ["cascade", "CASCADE", "행 순차"],
  ["flap", "FLAP", "뒤집기"],
  ["roll", "ROLL", "세로 롤"],
  ["wipe", "WIPE", "마스크"],
  ["fade", "FADE", "겹침"],
];

/**
 * 오늘·내일·모레 예보 띠. 칸 개수와 기온 최소·최대로 꺾은선 좌표를 계산한다 - 라이브러리를
 * 넣지 않는다. 칸 수가 시각에만 달렸고 도시와 무관해서, 도시가 바뀌어도 칸 폭이 변하지 않는다.
 */
function ForecastStrip({ cells }) {
  if (cells.length === 0) return null;
  /* 맨 왼쪽에 라벨 전용 칸을 하나 두고 모든 줄이 그 칸을 함께 쓴다. 이게 없으면 `강수확률 %`
     같은 줄 제목만 화면 왼쪽 끝에 붙고 값들은 첫 칸 가운데에 놓여, 제목과 값이 서로 다른
     세로선 위에 서서 정렬이 어긋나 보인다. */
  const columns = `var(--wf-strip-gutter) repeat(${cells.length}, 1fr)`;
  const temps = cells.map((cell) => cell.temp);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = Math.max(1, max - min);
  /* 기온 숫자를 꺾은선에서 떼어 아래 고정된 줄에 두면, 어느 숫자가 어느 점인지 승객이 눈으로
     이어야 한다. 날씨 서비스들이 쓰는 방식대로 숫자를 점에 붙여 선과 함께 오르내리게 한다.
     y는 34~92% 범위만 쓴다 - 점 위에 얹히는 숫자가 칸 밖으로 잘리지 않게 위쪽을 비워둔다. */
  const chartPoints = cells.map((cell, index) => ({
    x: ((index + 0.5) / cells.length) * 100,
    y: 92 - ((cell.temp - min) / span) * 58,
    temp: cell.temp,
  }));
  const line = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${chartPoints[0].x},100 ${line} ${chartPoints[chartPoints.length - 1].x},100`;
  // 그룹(오늘·내일·모레)이 바뀌는 첫 칸에만 세로 구분선을 그린다.
  const groupStarts = cells.map((cell, index) => index > 0 && cell.group !== cells[index - 1].group);
  const cellClass = (index) => `wf-forecast-cell${groupStarts[index] ? " wf-group-start" : ""}`;
  const groupRuns = forecastGroupRuns(cells);
  const precipKind = cells.find((cell) => cell?.precipKind)?.precipKind;
  /* 여덟 칸이 전부 0%면 화면 폭을 쓰면서 아무것도 알려주지 않는다. 그 줄을 접고
     높이를 기온 곡선에 준다. 비가 오는 날에만 줄이 나타나 눈에 띈다. */
  const hasPrecip = cells.some((cell) => Number.isFinite(cell?.precipValue) && cell.precipValue > 0);
  let column = 2;
  return (
    <div className={`wf-forecast-strip${hasPrecip ? "" : " is-precip-empty"}`}>
      <div className="wf-forecast-row wf-forecast-title-row" style={{ gridTemplateColumns: columns }}>
        {groupRuns.map((run, index) => {
          const start = column;
          column += run.count;
          return (
            <span
              className={`wf-forecast-title${index > 0 ? " wf-group-start" : ""}`}
              style={{ gridColumn: `${start} / span ${run.count}` }}
              key={run.group}
            >
              {run.title}
            </span>
          );
        })}
      </div>
      <div className="wf-forecast-row wf-forecast-hour-row" style={{ gridTemplateColumns: columns }}>
        <i aria-hidden="true" />
        {cells.map((cell, index) => <time className={cellClass(index)} key={index}>{cell.label}</time>)}
      </div>
      <div className="wf-forecast-row wf-forecast-icon-row" style={{ gridTemplateColumns: columns }}>
        <i aria-hidden="true" />
        {cells.map((cell, index) => (
          <span className={`wf-forecast-icon ${cellClass(index)}`} key={index}>
            <BoardWeatherImage type={cell.icon} small />
          </span>
        ))}
      </div>
      <div className="wf-forecast-row wf-forecast-chart-row" style={{ gridTemplateColumns: columns }}>
        <i aria-hidden="true" />
        {cells.map((cell, index) => <i className={cellClass(index)} aria-hidden="true" key={index} />)}
        <svg className="wf-forecast-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon className="wf-forecast-area" points={area} />
          <polyline points={line} fill="none" />
        </svg>
        <div className="wf-forecast-points">
          {chartPoints.map((point, index) => (
            <span className="wf-forecast-point" style={{ left: `${point.x}%`, top: `${point.y}%` }} key={index}>
              <b>{point.temp}°</b>
            </span>
          ))}
        </div>
      </div>
      {hasPrecip && <div className="wf-forecast-row wf-forecast-precip-row" style={{ gridTemplateColumns: columns }}>
        <p className="wf-forecast-row-label">{precipKind === 'amount' ? '강수량 mm' : '강수확률 %'}</p>
        {/* 알약 배경은 안쪽 <b>에만 준다. 칸 자체에 두면 구간 구분선이 둥근 모서리를 타고 휘어
            괄호처럼 보인다. */}
        {cells.map((cell, index) => (
          <span className={cellClass(index)} key={index}>
            <b className={isPrecipHighlighted(cell) ? "is-highlighted" : undefined}>
              {cell.precipValue == null ? '' : cell.precipKind === 'prob' ? `${cell.precipValue}%` : `${cell.precipValue}mm`}
            </b>
          </span>
        ))}
      </div>}
    </div>
  );
}

export default function WeatherFirstScreen({
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
  const cells = threeDayStrip(hourly, nowKst, days);
  const hasFlights = flights.length > 0;
  return (
    <section className={`exact-screen wf-screen motion-${motionMode}${hasFlights ? "" : " is-operations-ended"}`} data-testid="option-two">
      <header className="wf-header">
        {/* 도시 이름 길이가 달라도(제주/오사카) 오른쪽 순환 표시가 밀리지 않게 왼쪽 칸 폭을 고정한다. */}
        <div className="wf-header-city">
          {primaryFlight
            ? <><strong>{primaryFlight.city}</strong><span>{frame.code}</span></>
            : <strong>{departureName}</strong>}
        </div>
        <DestinationPager destinations={destinations} destinationIndex={destinationIndex} />
        <div className="wf-header-clock">
          {/* 도시 이름만 크게 있으면 처음 본 승객이 출발 안내판인지 날씨 화면인지 모른다. */}
          <p className="tw-screen-title">가는 곳 날씨</p>
          <div className="wf-header-time"><span>{clock.date}</span><strong>{clock.time}</strong></div>
        </div>
        {/* 30초마다 도시가 바뀌는데 남은 시간을 모르면, 주간 예보를 읽다 화면이 넘어갔을 때
            승객이 처음부터 다시 기다려야 할지 판단할 수 없다. */}
        <i
          className="tw-frame-progress"
          style={{ "--frame-seconds": `${frameSeconds}s` }}
          key={`${frame?.code ?? ''}-${frame?.page ?? 0}`}
          aria-hidden="true"
        />
      </header>
      <TerminalSettings>
        <DepartureAirportSelect airports={departureAirports} selectedIcao={departureAirportIcao} onSelect={onSelectDepartureAirport} />
        <ViewSwitcher view="weather" onSelectView={onSelectView} />
        <MotionModeSwitcher motionMode={motionMode} onSelectMotion={onSelectMotion} modes={MOTION_MODES} ariaLabel="2안 전환 애니메이션" />
        <button type="button" className="next-board-button" onClick={onReplay} disabled={!hasNext}>
          <MdChevronRight /><span>다음 도시</span>
        </button>
      </TerminalSettings>
      {hasFlights ? (
        <div className="wf-viewport">
          <div className={`wf-page${transitioning ? " is-leaving" : ""}`} data-testid="wf-active-page">
            <div className="wf-middle">
              <CurrentWeatherBlock flight={primaryFlight} departureName={departureName} departureTemp={departureTemp} />
              <FlightList flights={flights} />
            </div>
            <ForecastStrip cells={cells} />
          </div>
        </div>
      ) : (
        <TerminalEmptyState airportName={departureName} referenceClock={clock.time} />
      )}
    </section>
  );
}
