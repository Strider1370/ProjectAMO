import {
  computeFeelsLikeC,
  computeRelativeHumidity,
} from "../utils/helpers";
import { convertWeatherToKorean } from "../utils/visual-mapper";
import WeatherIcon from "./WeatherIcon";

function formatGroundNow(date, tz) {
  try {
    const formatter = new Intl.DateTimeFormat("ko-KR", {
      timeZone: tz === "KST" ? "Asia/Seoul" : "UTC",
      month: "numeric",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return `${Number(month)}월 ${Number(day)}일 ${weekday} ${hour}:${minute}`;
  } catch {
    return date.toISOString();
  }
}

function toKstDateParts(date, tz) {
  const timeZone = tz === "KST" ? "Asia/Seoul" : "UTC";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function dayOfYear(year, month, day) {
  const start = Date.UTC(year, 0, 0);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86400000);
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function formatClockFromMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return "-";
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function computeSunTimes(lat, lon, date, tz) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { sunrise: "-", sunset: "-" };
  }

  const { year, month, day } = toKstDateParts(date, tz);
  const n = dayOfYear(year, month, day);
  const lngHour = lon / 15;
  const zenith = 90.833;
  const degToRad = (deg) => (deg * Math.PI) / 180;
  const radToDeg = (rad) => (rad * 180) / Math.PI;

  function calculate(isSunrise) {
    const t = n + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const M = (0.9856 * t) - 3.289;
    let L = M + (1.916 * Math.sin(degToRad(M))) + (0.02 * Math.sin(2 * degToRad(M))) + 282.634;
    L = normalizeDegrees(L);

    let RA = radToDeg(Math.atan(0.91764 * Math.tan(degToRad(L))));
    RA = normalizeDegrees(RA);

    const Lquadrant = Math.floor(L / 90) * 90;
    const RAquadrant = Math.floor(RA / 90) * 90;
    RA = (RA + (Lquadrant - RAquadrant)) / 15;

    const sinDec = 0.39782 * Math.sin(degToRad(L));
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(degToRad(zenith)) - (sinDec * Math.sin(degToRad(lat)))) / (cosDec * Math.cos(degToRad(lat)));

    if (cosH < -1 || cosH > 1) return null;

    let H = isSunrise ? 360 - radToDeg(Math.acos(cosH)) : radToDeg(Math.acos(cosH));
    H /= 15;

    const T = H + RA - (0.06571 * t) - 6.622;
    const UT = normalizeDegrees((T - lngHour) * 15) / 15;
    const localOffsetHours = tz === "KST" ? 9 : 0;
    return (UT + localOffsetHours) * 60;
  }

  return {
    sunrise: formatClockFromMinutes(calculate(true)),
    sunset: formatClockFromMinutes(calculate(false)),
  };
}

function windDirectionKo(direction) {
  if (!Number.isFinite(direction)) return "-";
  const normalized = normalizeDegrees(direction);
  const labels = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return labels[Math.round(normalized / 45) % 8];
}

function knotsToMs(knots) {
  if (!Number.isFinite(knots)) return null;
  return knots * 0.514444;
}

function resolveCurrentCondition(target) {
  const weatherText = convertWeatherToKorean(target?.observation?.display?.weather, target?.observation?.clouds);
  const iconKey = target?.observation?.display?.weather_icon || target?.observation?.weather?.[0]?.icon_key || null;
  if (weatherText && weatherText !== "-" && weatherText !== "맑음") {
    return { summary: weatherText, iconKey };
  }

  const clouds = Array.isArray(target?.observation?.clouds) ? target.observation.clouds : [];
  const coverage = clouds.map((cloud) => String(cloud.amount || "").toUpperCase());
  if (coverage.includes("OVC")) return { summary: "흐림", iconKey: "OVC" };
  if (coverage.includes("BKN")) return { summary: "구름많음", iconKey: "BKN" };
  if (coverage.includes("SCT") || coverage.includes("FEW")) return { summary: "구름조금", iconKey: "SCT" };
  return { summary: "맑음", iconKey: target?.observation?.display?.weather_icon || "NSW" };
}

function todayForecast(groundForecastData, icao) {
  const forecast = groundForecastData?.airports?.[icao]?.forecast;
  if (!Array.isArray(forecast)) return null;
  return forecast.find((day) => day?.isToday) || forecast[0] || null;
}

function placeholderValue() {
  return "준비중";
}

function environmentMetric(value, grade, unit = "", fallback = placeholderValue()) {
  if (value == null && !grade) {
    return { label: fallback, numeric: null, pending: true, gradeClass: "" };
  }
  const label = grade || fallback;
  const numeric = Number.isFinite(value) ? `(${Math.round(value * 10) / 10}${unit})` : null;
  const gradeKey = String(grade || "").toLowerCase();
  const gradeClass = gradeKey.includes("좋음") || gradeKey.includes("낮음")
    ? "ground-current-metric-value--good"
    : gradeKey.includes("보통")
      ? "ground-current-metric-value--moderate"
      : gradeKey.includes("나쁨") || gradeKey.includes("높음")
        ? "ground-current-metric-value--warn"
        : gradeKey.includes("매우") || gradeKey.includes("위험")
          ? "ground-current-metric-value--bad"
          : "";
  return { label, numeric, pending: false, gradeClass };
}

function EnvironmentValue({ metric }) {
  return (
    <>
      {metric.label}
      {metric.numeric && <span className="ground-current-metric-numeric"> {metric.numeric}</span>}
    </>
  );
}

export default function GroundCurrentWeatherCard({
  metarData,
  groundForecastData,
  environmentData,
  amosData,
  icao,
  airportMeta = null,
  tz = "KST",
}) {
  const target = metarData?.airports?.[icao];
  const forecastToday = todayForecast(groundForecastData, icao);

  if (!target) {
    return (
      <section className="ground-current-card panel">
        <p className="ground-current-empty">현재 날씨 데이터를 불러올 수 없습니다.</p>
      </section>
    );
  }

  const now = new Date();
  const tempC = target?.observation?.temperature?.air;
  const dewpointC = target?.observation?.temperature?.dewpoint;
  const windKt = target?.observation?.wind?.speed;
  const windMs = knotsToMs(windKt);
  const windDirection = target?.observation?.wind?.direction;
  const humidity = computeRelativeHumidity(tempC, dewpointC);
  const feelsLike = computeFeelsLikeC({
    tempC,
    dewpointC,
    windKt,
    observedAt: target?.header?.observation_time || target?.header?.issue_time || now.toISOString(),
  });
  const currentCondition = resolveCurrentCondition(target);
  const sunTimes = computeSunTimes(airportMeta?.lat, airportMeta?.lon, now, tz);
  const minTemp = forecastToday?.tempMin;
  const maxTemp = forecastToday?.tempMax;
  const environment = environmentData?.airports?.[icao] || null;
  const pm10 = environmentMetric(environment?.pm?.pm10?.value, environment?.pm?.pm10?.grade, "㎍/㎥");
  const pm25 = environmentMetric(environment?.pm?.pm25?.value, environment?.pm?.pm25?.grade, "㎍/㎥");
  const uv = environmentMetric(environment?.uv?.value, environment?.uv?.grade);
  const rainfallMm = amosData?.airports?.[icao]?.daily_rainfall?.mm;

  return (
    <section className="ground-current-card panel">
      <div className="ground-current-card-topbar">
        <span className="ground-current-card-time">{formatGroundNow(now, tz)}</span>
        <span className="ground-current-card-suntime">☀ 일출 {sunTimes.sunrise} · 일몰 {sunTimes.sunset}</span>
      </div>
      <div className="ground-current-card-body">
        <div className="ground-current-card-main">
          <WeatherIcon iconKey={currentCondition.iconKey} className="ground-current-card-icon" alt={currentCondition.summary} />
          <div className="ground-current-card-temp-wrap">
            <div className="ground-current-card-temp">{Number.isFinite(tempC) ? `${Math.round(tempC)}°C` : "-"}</div>
            <div className="ground-current-card-feels">체감 {Number.isFinite(feelsLike?.value) ? `${Math.round(feelsLike.value)}°C` : "-"}</div>
            <div className="ground-current-card-summary">{currentCondition.summary}</div>
            <div className="ground-current-card-minmax">
              <span className="ground-current-metric-min">{Number.isFinite(minTemp) ? `${Math.round(minTemp)}°` : "-"}</span>
              <span className="ground-current-metric-divider">/</span>
              <span className="ground-current-metric-max">{Number.isFinite(maxTemp) ? `${Math.round(maxTemp)}°` : "-"}</span>
            </div>
          </div>
        </div>
        <div className="ground-current-card-divider" />
        <div className="ground-current-card-metrics">
          <article className="ground-current-metric">
            <span className="ground-current-metric-label">습도</span>
            <strong className="ground-current-metric-value">{Number.isFinite(humidity) ? `${Math.round(humidity)}%` : "-"}</strong>
          </article>
          <article className="ground-current-metric">
            <span className="ground-current-metric-label">바람</span>
            <strong className="ground-current-metric-value">{Number.isFinite(windMs) ? `${windMs.toFixed(0)} m/s` : "-"} <span className="ground-current-metric-dir">{windDirectionKo(windDirection)}</span></strong>
          </article>
          <article className="ground-current-metric">
            <span className="ground-current-metric-label">일강수량</span>
            <strong className="ground-current-metric-value">{Number.isFinite(rainfallMm) ? `${rainfallMm.toFixed(1)} mm` : "-"}</strong>
          </article>
          <article className="ground-current-metric">
            <span className="ground-current-metric-label">미세먼지(PM10)</span>
            <strong className={`ground-current-metric-value ${pm10.pending ? "ground-current-metric-value--pending" : pm10.gradeClass}`.trim()}><EnvironmentValue metric={pm10} /></strong>
          </article>
          <article className="ground-current-metric">
            <span className="ground-current-metric-label">초미세먼지(PM2.5)</span>
            <strong className={`ground-current-metric-value ${pm25.pending ? "ground-current-metric-value--pending" : pm25.gradeClass}`.trim()}><EnvironmentValue metric={pm25} /></strong>
          </article>
          <article className="ground-current-metric">
            <span className="ground-current-metric-label">자외선</span>
            <strong className={`ground-current-metric-value ${uv.pending ? "ground-current-metric-value--pending" : uv.gradeClass}`.trim()}><EnvironmentValue metric={uv} /></strong>
          </article>
        </div>
      </div>
    </section>
  );
}
