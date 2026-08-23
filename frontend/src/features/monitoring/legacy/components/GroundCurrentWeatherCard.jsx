import {
  computeFeelsLikeC,
  computeRelativeHumidity,
  formatUtc,
} from "../utils/helpers";
import { convertWeatherToKorean } from "../utils/visual-mapper";
import WeatherIcon from "../../../../shared/ui/WeatherIcon.jsx";
import { computeSunTimes } from "../../../../shared/weather/helpers.js";
import { resolveWeatherVisual } from "../../../../shared/weather/weather-visual-resolver.js";
import { WiDaySunny, WiDust, WiHumidity, WiRaindrops, WiSmoke, WiStrongWind } from 'react-icons/wi'

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
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

function shortTimestamp(value, tz) {
  const formatted = formatUtc(value, tz);
  return formatted.match(/(\d{2}:\d{2}\s(?:KST|UTC))$/)?.[1] || null;
}

function resolveCurrentCondition(target) {
  const observation = target?.observation || {};
  const weatherText = convertWeatherToKorean(
    observation?.display?.weather,
    observation?.visibility?.cavok,
    observation?.clouds || [],
  );
  const visual = resolveWeatherVisual(
    observation,
    target?.header?.issue_time || target?.header?.observation_time,
  );
  if (weatherText && weatherText !== "-" && weatherText !== "맑음") {
    return { summary: weatherText, visual };
  }

  const clouds = Array.isArray(observation?.clouds) ? observation.clouds : [];
  const coverage = clouds.map((cloud) => String(cloud.amount || "").toUpperCase());
  if (coverage.includes("OVC")) return { summary: "흐림", visual };
  if (coverage.includes("BKN")) return { summary: "구름많음", visual };
  if (coverage.includes("SCT") || coverage.includes("FEW")) return { summary: "구름조금", visual };
  return { summary: "맑음", visual };
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

function GroundMetric({ icon: Icon, label, valueClassName = '', children }) {
  return (
    <div className="ground-current-metric" data-ground-metric={label}>
      <Icon className="ground-current-metric-icon" data-current-metric-icon aria-hidden="true" focusable="false" />
      <span className="ground-current-metric-label" data-current-metric-label>{label}</span>
      <strong className={`ground-current-metric-value ${valueClassName}`.trim()} data-current-metric-value>{children}</strong>
    </div>
  )
}

export default function GroundCurrentWeatherCard({
  metarData,
  groundForecastData,
  environmentData,
  amosData,
  icao,
  airportMeta = null,
  tz = "KST",
  classic = false,
}) {
  const target = metarData?.airports?.[icao];
  const forecastToday = todayForecast(groundForecastData, icao);

  if (!target) {
    return (
      <section className="ground-current-card panel" role="region" aria-label="현재 날씨">
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
  const dataTime = shortTimestamp(target?.header?.issue_time || target?.header?.observation_time, tz);

  return (
    <section className="ground-current-card panel" role="region" aria-label="현재 날씨">
      <div className="ground-current-card-topbar">
        <div className="ground-current-card-heading">
          <span className="ground-current-card-title">현재 날씨</span>
          {dataTime && <span className="ground-current-card-data-time">{dataTime} 기준</span>}
        </div>
        <span className="ground-current-card-suntime">
          <span>☀ 일출 {sunTimes.sunrise} · 일몰 {sunTimes.sunset}</span>
        </span>
      </div>
      <div className="ground-current-card-body">
        <div className="ground-current-card-main">
          <WeatherIcon visual={currentCondition.visual} className="ground-current-card-icon" alt={currentCondition.summary} />
          <div className="ground-current-card-temp-wrap">
            <div className="ground-current-card-temp" data-current-temperature>{Number.isFinite(tempC) ? `${Math.round(tempC)}°C` : "-"}</div>
            <div className="ground-current-card-feels" data-current-feels>체감 {Number.isFinite(feelsLike?.value) ? `${Math.round(feelsLike.value)}°C` : "-"}</div>
            <div className="ground-current-card-summary" data-current-condition>{currentCondition.summary}</div>
            <div className="ground-current-card-minmax">
              <span className="ground-current-metric-min">{Number.isFinite(minTemp) ? `${Math.round(minTemp)}°` : "-"}</span>
              <span className="ground-current-metric-divider">/</span>
              <span className="ground-current-metric-max">{Number.isFinite(maxTemp) ? `${Math.round(maxTemp)}°` : "-"}</span>
            </div>
          </div>
        </div>
        <div className="ground-current-card-divider" />
        <div className="ground-current-card-metrics">
          {classic ? <>
            <article className="ground-current-metric"><span className="ground-current-metric-label">습도</span><strong className="ground-current-metric-value">{Number.isFinite(humidity) ? `${Math.round(humidity)}%` : "-"}</strong></article>
            <article className="ground-current-metric"><span className="ground-current-metric-label">바람</span><strong className="ground-current-metric-value">{Number.isFinite(windMs) ? `${windMs.toFixed(0)} m/s` : "-"} <span className="ground-current-metric-dir">{windDirectionKo(windDirection)}</span></strong></article>
            <article className="ground-current-metric"><span className="ground-current-metric-label">일강수량</span><strong className="ground-current-metric-value">{Number.isFinite(rainfallMm) ? `${rainfallMm.toFixed(1)} mm` : "-"}</strong></article>
            <article className="ground-current-metric"><span className="ground-current-metric-label">미세먼지(PM10)</span><strong className={`ground-current-metric-value ${pm10.pending ? "ground-current-metric-value--pending" : pm10.gradeClass}`.trim()}><EnvironmentValue metric={pm10} /></strong></article>
            <article className="ground-current-metric"><span className="ground-current-metric-label">초미세먼지(PM2.5)</span><strong className={`ground-current-metric-value ${pm25.pending ? "ground-current-metric-value--pending" : pm25.gradeClass}`.trim()}><EnvironmentValue metric={pm25} /></strong></article>
            <article className="ground-current-metric"><span className="ground-current-metric-label">자외선</span><strong className={`ground-current-metric-value ${uv.pending ? "ground-current-metric-value--pending" : uv.gradeClass}`.trim()}><EnvironmentValue metric={uv} /></strong></article>
          </> : <>
            <GroundMetric icon={WiHumidity} label="습도">{Number.isFinite(humidity) ? `${Math.round(humidity)}%` : "-"}</GroundMetric>
            <GroundMetric icon={WiStrongWind} label="바람">{Number.isFinite(windMs) ? `${windMs.toFixed(0)} m/s` : "-"} <span className="ground-current-metric-dir">{windDirectionKo(windDirection)}</span></GroundMetric>
            <GroundMetric icon={WiRaindrops} label="일강수량">{Number.isFinite(rainfallMm) ? `${rainfallMm.toFixed(1)} mm` : "-"}</GroundMetric>
            <GroundMetric icon={WiDust} label="미세먼지(PM10)" valueClassName={pm10.pending ? "ground-current-metric-value--pending" : pm10.gradeClass}><EnvironmentValue metric={pm10} /></GroundMetric>
            <GroundMetric icon={WiSmoke} label="초미세먼지(PM2.5)" valueClassName={pm25.pending ? "ground-current-metric-value--pending" : pm25.gradeClass}><EnvironmentValue metric={pm25} /></GroundMetric>
            <GroundMetric icon={WiDaySunny} label="자외선" valueClassName={uv.pending ? "ground-current-metric-value--pending" : uv.gradeClass}><EnvironmentValue metric={uv} /></GroundMetric>
          </>}
        </div>
      </div>
    </section>
  );
}
