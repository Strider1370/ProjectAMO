import WeatherIcon from "./WeatherIcon";

function mapGroundForecastIcon(icon) {
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

function getDayTitle(day, index) {
  const weekday = day?.dayOfWeek || "-";
  if (index === 0 || day?.isToday) return `오늘(${weekday})`;
  if (index === 1) return `내일(${weekday})`;
  if (index === 2) return `모레(${weekday})`;
  return weekday;
}

function getWeekdayTone(day) {
  if (day?.dayOfWeek === "토") return "sat";
  if (day?.dayOfWeek === "일") return "sun";
  return "default";
}

function isPrecipitationIcon(icon) {
  return ["rain", "shower", "snow", "sleet"].includes(icon);
}

function renderPeriod(period, label) {
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

function buildStatusText(sourceStatus) {
  if (!sourceStatus) return "";
  const failed = Object.entries(sourceStatus)
    .filter(([, status]) => status?.ok === false)
    .map(([key]) => key);
  if (failed.length === 0) return "최신 발표 반영";
  return `일부 소스 지연: ${failed.join(", ")}`;
}

export default function GroundForecastPanel({ groundForecastData, icao }) {
  const airportForecast = groundForecastData?.airports?.[icao] || null;
  const days = Array.isArray(airportForecast?.forecast) ? airportForecast.forecast : [];
  const statusText = buildStatusText(airportForecast?.source_status);

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
          {airportForecast?._stale && <span className="ground-forecast-stale">일부 이전 데이터 보강</span>}
          {statusText && <span className="ground-forecast-status">{statusText}</span>}
        </div>
      </div>
      <div className="ground-forecast-grid">
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
          <article
            key={day.date}
            className={`ground-forecast-day-column${day.isToday ? " is-today" : ""}`}
          >
            <header className="ground-forecast-card ground-forecast-card-header">
              <strong className={`ground-forecast-card-title ground-forecast-card-title--${getWeekdayTone(day)}`}>
                {getDayTitle(day, index)}
              </strong>
              <span className={`ground-forecast-card-date ground-forecast-card-date--${getWeekdayTone(day)}`}>
                {day.date.slice(5).replace("-", "/")}
              </span>
            </header>
            <div className={`ground-forecast-card ground-forecast-period-slot${isPrecipitationIcon(day.am?.icon) ? " ground-forecast-period-slot--precip" : ""}`}>
              {renderPeriod(day.am, "오전")}
            </div>
            <div className={`ground-forecast-card ground-forecast-period-slot${isPrecipitationIcon(day.pm?.icon) ? " ground-forecast-period-slot--precip" : ""}`}>
              {renderPeriod(day.pm, "오후")}
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
