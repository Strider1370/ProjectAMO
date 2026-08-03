import WeatherIcon from "../../../../shared/ui/WeatherIcon.jsx";

export function mapGroundForecastIcon(icon) {
  switch (icon) {
    case "sunny":
      return "clear-day";
    case "partly_cloudy":
      return "few-clouds-day";
    case "mostly_cloudy":
      return "broken-clouds";
    case "cloudy":
      return "overcast";
    case "rain":
      return "rain-day";
    case "shower":
      return "showers-day";
    case "snow":
    case "sleet":
      return "snow-day";
    default:
      return "unknown";
  }
}

// 오늘은 현재 날씨 카드와 시간별 예보가 이미 다루므로 주간예보에서는 빼고 내일부터 보여준다.
function getDayTitle(day, index) {
  const weekday = day?.dayOfWeek || "-";
  if (index === 0) return `내일(${weekday})`;
  if (index === 1) return `모레(${weekday})`;
  return weekday;
}

// 기상청 발표시각(YYYYMMDDHH…) → "08/04 05시".
export function formatIssuedAt(compact) {
  const text = String(compact || "");
  if (text.length < 10) return null;
  return `${text.slice(4, 6)}/${text.slice(6, 8)} ${text.slice(8, 10)}시`;
}

function getWeekdayTone(day) {
  if (day?.dayOfWeek === "토") return "sat";
  if (day?.dayOfWeek === "일") return "sun";
  return "default";
}

export function isPrecipitationIcon(icon) {
  return ["rain", "shower", "snow", "sleet"].includes(icon);
}

function renderPeriod(period) {
  if (!period) {
    return (
      <div className="ground-forecast-period ground-forecast-period--empty">
        <span className="ground-forecast-period-empty">-</span>
      </div>
    );
  }

  return (
    <div className={`ground-forecast-period${isPrecipitationIcon(period.icon) ? " ground-forecast-period--precip" : ""}`}>
      <WeatherIcon iconId={mapGroundForecastIcon(period.icon)} className="ground-forecast-weather-icon" alt={period.weather} />
      <span className="ground-forecast-rain-prob">
        {Number.isFinite(period.rainProb) ? `${period.rainProb}%` : "-"}
      </span>
    </div>
  );
}

// 정상일 때는 아무것도 적지 않는다. 지연된 소스가 있을 때만 알린다.
function buildStatusText(sourceStatus) {
  if (!sourceStatus) return "";
  const failed = Object.entries(sourceStatus)
    .filter(([, status]) => status?.ok === false)
    .map(([key]) => key);
  if (failed.length === 0) return "";
  return `일부 소스 지연: ${failed.join(", ")}`;
}

export default function GroundForecastPanel({ groundForecastData, icao }) {
  const airportForecast = groundForecastData?.airports?.[icao] || null;
  const allDays = Array.isArray(airportForecast?.forecast) ? airportForecast.forecast : [];
  const days = allDays.filter((day) => !day.isToday);
  const statusText = buildStatusText(airportForecast?.source_status);
  const shortIssuedAt = formatIssuedAt(airportForecast?.source_status?.short?.announce_time);
  const midIssuedAt = formatIssuedAt(airportForecast?.tmFc);

  if (days.length === 0) {
    return (
      <section className="ground-forecast-panel panel">
        <div className="ground-forecast-header">
          <h3>주간 예보</h3>
        </div>
        <p className="ground-forecast-empty">주간예보 데이터가 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="ground-forecast-panel panel">
      <div className="ground-forecast-header">
        <h3>주간 예보</h3>
        <div className="ground-forecast-meta">
          {statusText && <span className="ground-forecast-status">{statusText}</span>}
          {shortIssuedAt && <span className="ground-forecast-issued">단기예보 {shortIssuedAt} 발표</span>}
          {midIssuedAt && <span className="ground-forecast-issued">중기예보 {midIssuedAt} 발표</span>}
        </div>
      </div>
      <div className="ground-forecast-grid" style={{ "--ground-forecast-days": days.length }}>
        <div className="ground-forecast-label-column" aria-hidden="true">
          <div className="ground-forecast-label-cell ground-forecast-label-cell--date">날짜</div>
          <div className="ground-forecast-label-cell">오전</div>
          <div className="ground-forecast-label-cell">오후</div>
          <div className="ground-forecast-label-cell ground-forecast-label-cell--temps">
            <span className="ground-forecast-label-low">최저</span>
            <span className="ground-forecast-label-slash">/</span>
            <span className="ground-forecast-label-high">최고</span>
          </div>
        </div>
        {days.map((day, index) => (
          <article key={day.date} className="ground-forecast-day-column">
            <header className="ground-forecast-card ground-forecast-card-header">
              <strong className={`ground-forecast-card-title ground-forecast-card-title--${getWeekdayTone(day)}`}>
                {getDayTitle(day, index)}
              </strong>
              <span className={`ground-forecast-card-date ground-forecast-card-date--${getWeekdayTone(day)}`}>
                {day.date.slice(5).replace("-", "/")}
              </span>
            </header>
            <div className={`ground-forecast-card ground-forecast-period-slot${isPrecipitationIcon(day.am?.icon) ? " ground-forecast-period-slot--precip" : ""}`}>
              {renderPeriod(day.am)}
            </div>
            <div className={`ground-forecast-card ground-forecast-period-slot${isPrecipitationIcon(day.pm?.icon) ? " ground-forecast-period-slot--precip" : ""}`}>
              {renderPeriod(day.pm)}
            </div>
            <footer className="ground-forecast-card ground-forecast-temps">
              <span className="ground-forecast-temp-min">{day.tempMin != null ? `${day.tempMin}°C` : "-"}</span>
              <span className="ground-forecast-temp-divider">/</span>
              <span className="ground-forecast-temp-max">{day.tempMax != null ? `${day.tempMax}°C` : "-"}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
