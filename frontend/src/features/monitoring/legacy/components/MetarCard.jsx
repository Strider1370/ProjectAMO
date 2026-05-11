import {
  safe,
  formatUtc,
  getDisplayDate,
  getSeverityLevel,
  computeFeelsLikeC,
  computeRelativeHumidity,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  classifyRvrCategory,
  getFlightCategory,
  FLIGHT_CATEGORY_META,
  isDarkTheme,
  hasPrecipitationWeather,
  hasHighWindCondition,
  pickRunwayDirection,
  getCrosswindComponentKt,
} from "../utils/helpers";

function catColors(cat) {
  if (isDarkTheme()) {
    return { bg: cat.darkBg, borderSoft: cat.darkBorderSoft, valueColor: cat.darkValueColor };
  }
  return { bg: cat.bg, borderSoft: cat.borderSoft, valueColor: cat.valueColor };
}
import WeatherIcon from "./WeatherIcon";
import { convertWeatherToKorean } from "../utils/visual-mapper";
import { resolveWeatherVisual } from "../utils/weather-visual-resolver";

const CROSSWIND_ALERT_THRESHOLD_KT = 15;
const CLEAR_TITLE_IMAGES = [
  "/gisang-i/clear_1.png",
  "/gisang-i/clear_2.png",
  "/gisang-i/clear_3.png",
  "/gisang-i/clear_4.png",
  "/gisang-i/clear_5.png",
];
const SEASONAL_CLEAR_TITLE_IMAGES = {
  spring: "/gisang-i/clear_spring.png",
  summer: "/gisang-i/clear_summer.png",
  fall: "/gisang-i/clear_fall.png",
  winter: "/gisang-i/clear_winter.png",
};
const CHRISTMAS_CLEAR_TITLE_IMAGE = "/gisang-i/clear_christmas.png";

function toLocalDateParts(date, tz) {
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

  const { year, month, day } = toLocalDateParts(date, tz);
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

function formatQnhDisplay(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const match = raw.match(/^Q?\s*(\d{3,4}(?:\.\d+)?)$/i);
  if (match) return `${match[1]}hPa`;
  return raw;
}

function getCurrentWeatherTitleImage(observation, tz = "UTC") {
  const rawWeather = String(observation?.display?.weather || "").toUpperCase().trim();
  const normalized = rawWeather.replace(/\s+/g, " ");

  if (/(^|\s)(TS|TSRA)(\s|$)/.test(normalized)) {
    return "/gisang-i/TS.png";
  }
  if (/(^|\s)FG(\s|$)/.test(normalized)) {
    return "/gisang-i/FG.jpg";
  }
  if (/(^|\s)(\+SN|-SN|SN)(\s|$)/.test(normalized)) {
    return "/gisang-i/SN.png";
  }
  if (/(^|\s)(SHRA|\+RA|-RA|RA|DZ)(\s|$)/.test(normalized)) {
    return "/gisang-i/RN_DZ.png";
  }

  const today = getDisplayDate(new Date().toISOString(), tz);
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();

  if (month === 12 && (day === 24 || day === 25)) {
    return CHRISTMAS_CLEAR_TITLE_IMAGE;
  }

  const clearPool = [...CLEAR_TITLE_IMAGES];
  let seasonKey = "spring";
  if (month >= 3 && month <= 5) seasonKey = "spring";
  else if (month >= 6 && month <= 8) seasonKey = "summer";
  else if (month >= 9 && month <= 11) seasonKey = "fall";
  else seasonKey = "winter";
  clearPool.push(SEASONAL_CLEAR_TITLE_IMAGES[seasonKey]);

  const year = today.getUTCFullYear();
  const daySeed = year * 1000 + Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000);
  return clearPool[daySeed % clearPool.length];
}

function getWindDirectionLabel(wind) {
  if (!wind) return "-";
  if (wind.calm) return "CALM";
  if (wind.variable) return "VRB";
  if (!Number.isFinite(wind.direction)) return "-";
  return `${wind.direction}°`;
}

function formatCrosswindText(wind, runwayHdg) {
  if (!wind || wind.calm) return "측풍 0kt";
  const crosswind = getCrosswindComponentKt(wind, runwayHdg);
  if (!Number.isFinite(crosswind)) {
    return "측풍 -";
  }
  const selectedRunwayHdg = pickRunwayDirection(runwayHdg, wind.direction);
  const relative = ((wind.direction - selectedRunwayHdg + 540) % 360) - 180;
  const side = relative > 0 ? "R" : relative < 0 ? "L" : "";
  return side ? `측풍 ${side}/${Math.round(crosswind)}kt` : `측풍 ${Math.round(crosswind)}kt`;
}

function formatCrosswindValue(wind, runwayHdg) {
  return formatCrosswindText(wind, runwayHdg).replace(/^측풍\s*/, "");
}

function getCrosswindArrow(wind, runwayHdg) {
  if (!wind || wind.calm) return "↑";
  if (!Number.isFinite(wind.speed) || !Number.isFinite(wind.direction) || !Number.isFinite(runwayHdg)) {
    return "↑";
  }
  const selectedRunwayHdg = pickRunwayDirection(runwayHdg, wind.direction);
  const relative = ((wind.direction - selectedRunwayHdg + 540) % 360) - 180;
  const crosswindComponent = wind.speed * Math.sin((relative * Math.PI) / 180);
  if (crosswindComponent > 0) return "←";
  if (crosswindComponent < 0) return "→";
  return "↑";
}

function getWindDirectionRotation(wind) {
  if (!wind || wind.calm || !Number.isFinite(wind.direction)) {
    return 0;
  }
  const normalized = ((wind.direction % 360) + 360) % 360;
  return (normalized + 180) % 360;
}

function formatMinimumVisibilityDetail(minValue, minDirectionDegrees) {
  if (!Number.isFinite(minValue)) return null;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const toAbbr = (deg) => {
    if (!Number.isFinite(deg)) return null;
    const normalized = ((deg % 360) + 360) % 360;
    return dirs[Math.round(normalized / 45) % 8];
  };
  const dir = toAbbr(minDirectionDegrees);
  return dir
    ? `최단시정 ${Math.round(minValue)}${dir}`
    : `최단시정 ${Math.round(minValue)}`;
}

function normalizeRunwayLabel(runway) {
  const token = String(runway || "").toUpperCase().replace(/^RWY\s*/, "").trim();
  const match = token.match(/(\d{2}[LRC]?)/);
  return match ? match[1] : null;
}

function formatRvrCompact(entry) {
  if (!entry || typeof entry !== "object") return null;
  const runway = normalizeRunwayLabel(entry.runway);
  const operatorMap = { ABOVE: "P", BELOW: "M" };
  const tendencyMap = { UPWARD: "U", DOWNWARD: "D", NO_CHANGE: "N" };
  const operator = operatorMap[String(entry.operator || "").toUpperCase()] || "";
  const tendency = tendencyMap[String(entry.tendency || "").toUpperCase()] || "";
  if (Number.isFinite(entry.mean)) {
    return `${runway ? `R${runway}` : "R--"} ${operator}${Math.round(entry.mean)}${tendency}`;
  }
  return null;
}

function getRvrEntryStyle(cat) {
  const dark = isDarkTheme();
  if (cat.category === "LIFR") {
    return {
      bg: dark ? "rgba(220,38,38,0.18)" : "rgba(220,38,38,0.15)",
      labelColor: dark ? "#ffffff" : "rgba(153,27,27,0.9)",
      valueColor: dark ? "rgba(252,165,165,0.85)" : cat.valueColor,
    };
  }
  return {
    bg: dark ? "rgba(245,158,11,0.25)" : "rgba(245,158,11,0.15)",
    labelColor: dark ? "#ffffff" : "rgba(146,64,14,0.9)",
    valueColor: dark ? "rgba(253,211,77,0.85)" : cat.valueColor,
  };
}

function formatVisibilityValue(value, rawText) {
  if (rawText && rawText !== "//" && rawText !== "-") {
    return /\d$/.test(rawText) ? `${rawText} m` : rawText;
  }
  if (Number.isFinite(value)) return `${value} m`;
  return "-";
}

function hasSpecialWeather(observation) {
  const raw = String(observation?.display?.weather || "").toUpperCase();
  return ["TS", "FG", "SN"].some((token) => raw.includes(token));
}

function getMetarBadgeText(header, fallbackType) {
  const reportType = String(header?.report_type || fallbackType || "METAR").trim().toUpperCase();
  if (reportType === "SPECI") return "SPECI";
  return "METAR";
}

export default function MetarCard({
  metarData,
  amosData,
  icao,
  minimaSettings = null,
  airportMeta = null,
  metarTime = "",
  version = "v2",
  onVersionToggle,
  tz = "UTC",
  mobileLayout = false,
}) {
  const target = metarData?.airports?.[icao];
  const amosTarget = amosData?.airports?.[icao] || null;

  if (!target) {
    return (
      <div className="metric-cards-empty">
        <p>No METAR data for selected airport.</p>
      </div>
    );
  }

  const wind = target.observation?.wind || null;
  const windSpeed = wind?.speed;
  const windGust = wind?.gust;
  const visibility = target.observation?.visibility?.value;
  const issueTime = target.header?.issue_time || target.header?.observation_time;
  const obsTime = target.header?.observation_time || issueTime;
  const dailyRain = amosTarget?.daily_rainfall || null;
  const rainValueText = dailyRain?.mm == null || dailyRain.mm <= 0 ? null : `${dailyRain.mm.toFixed(1)} mm`;
  const rainText = rainValueText ? `일강수량 ${rainValueText}` : null;
  const feelsLike = computeFeelsLikeC({
    tempC: target.observation?.temperature?.air,
    dewpointC: target.observation?.temperature?.dewpoint,
    windKt: windSpeed,
    observedAt: obsTime,
  });

  const tempC = target.observation?.temperature?.air;
  const dewpointC = target.observation?.temperature?.dewpoint;
  const rh = computeRelativeHumidity(tempC, dewpointC);
  const qnhDisplay = formatQnhDisplay(target.observation?.display?.qnh);
  const tempDisplay = Number.isFinite(tempC) ? `${Math.round(tempC)}°C` : "-";
  const feelsLikeText = feelsLike.value == null ? null : `체감온도 ${feelsLike.value.toFixed(1)}°C`;
  const rhDisplay = Number.isFinite(rh) ? `${Math.round(rh)}%` : "-";

  const visibilityRaw = target.observation?.display?.visibility;
  const visibilityValue = formatVisibilityValue(visibility, visibilityRaw);
  const minimumVisibilityDetail = formatMinimumVisibilityDetail(
    target.observation?.visibility?.minimum_value,
    target.observation?.visibility?.minimum_direction_degrees
  );

  const rvrEntries = Array.isArray(target.observation?.rvr)
    ? target.observation.rvr
        .map((entry) => {
          const formatted = formatRvrCompact(entry);
          if (!formatted) return null;
          const sp = formatted.indexOf(" ");
          const cat = classifyRvrCategory(entry.mean, icao, minimaSettings);
          return {
            runway: sp >= 0 ? formatted.slice(0, sp) : formatted,
            value: sp >= 0 ? formatted.slice(sp + 1) : "",
            mean: entry.mean,
            cat,
          };
        })
        .filter(Boolean)
    : [];
  const hasRvrDetails = rvrEntries.length > 0;
  const rvrPanelCategory = rvrEntries.some((e) => e.cat.category === "LIFR")
    ? FLIGHT_CATEGORY_META.LIFR
    : FLIGHT_CATEGORY_META.IFR;

  const clouds = target.observation?.clouds || [];
  const ceilingCloud = clouds
    .filter((cloud) => cloud.amount === "BKN" || cloud.amount === "OVC")
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0];
  const ceilingFt = ceilingCloud?.base ?? null;
  const ceilingValue = Number.isFinite(ceilingFt) ? `${ceilingFt} ft` : "NSC";

  if (version === "v1") {
    const level = getSeverityLevel({ visibility, wind: windSpeed, gust: windGust });
    const rainObservedText = /^\d{12}$/.test(dailyRain?.observed_tm_kst || "")
      ? `${dailyRain.observed_tm_kst.slice(8, 10)}:${dailyRain.observed_tm_kst.slice(10, 12)} KST`
      : "-";
    const lines = [
      `Report Type: ${safe(target.header?.report_type || metarData?.type || "METAR")}`,
      `Issue Time: ${safe(formatUtc(issueTime, tz))}`,
      `Wind: ${safe(target.observation?.display?.wind)}`,
      `Visibility: ${visibilityValue}`,
      `Weather: ${safe(target.observation?.display?.weather)}`,
      `Clouds: ${safe(target.observation?.display?.clouds)}`,
      `Temp: ${safe(target.observation?.display?.temperature)}`,
      `Relative Humidity: ${rhDisplay}`,
      `Daily Rainfall(@ ${rainObservedText}): ${rainText || "-"}`,
      `Feels Like: ${feelsLike.value == null ? "-" : `${feelsLike.value.toFixed(1)}C`}`,
      `QNH: ${safe(target.observation?.display?.qnh)}`,
    ];
    return (
      <article className="panel metar-panel-v1">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h3 style={{ margin: 0 }}>METAR/SPECI</h3>
        </div>
        <pre className={`mono level-${level}`}>{lines.join("\n")}</pre>
      </article>
    );
  }

  const weatherVisual = resolveWeatherVisual(target.observation, issueTime);
  const weatherTitleImage = getCurrentWeatherTitleImage(target.observation, tz);
  const weatherKorean = convertWeatherToKorean(
    target.observation?.display?.weather,
    target.observation?.cavok,
    target.observation?.clouds || []
  );
  const windDirectionText = getWindDirectionLabel(wind);
  const windSpeedText = wind?.calm ? "0" : Number.isFinite(windSpeed) ? String(windSpeed) : "-";
  const windGustText = Number.isFinite(windGust) ? `Gust ${windGust}kt` : null;
  const windDirectionRotation = getWindDirectionRotation(wind);
  const crosswindValue = formatCrosswindValue(wind, airportMeta?.runway_hdg ?? null);
  const crosswindArrow = getCrosswindArrow(wind, airportMeta?.runway_hdg ?? null);
  const visibilityCategory = classifyVisibilityCategory(visibility, icao, minimaSettings);
  const ceilingCategory = classifyCeilingCategory(ceilingFt, icao, minimaSettings);
  const flightCategory = getFlightCategory(visibility, ceilingFt, icao, minimaSettings);
  const metarTimeText = metarTime.trim();
  const metarBadgeText = getMetarBadgeText(target.header, metarData?.type);
  const specialWeather = hasSpecialWeather(target.observation);
  const precipitationWeather = hasPrecipitationWeather(target.observation);
  const highWind = hasHighWindCondition(wind);
  const crosswindComponentKt = getCrosswindComponentKt(wind, airportMeta?.runway_hdg ?? null);
  const crosswindAlert = Number.isFinite(crosswindComponentKt) && crosswindComponentKt >= CROSSWIND_ALERT_THRESHOLD_KT;
  const precipitationCardStyle = precipitationWeather
    ? (isDarkTheme()
      ? { backgroundColor: "rgba(14, 116, 144, 0.34)", borderColor: "rgba(125, 211, 252, 0.5)" }
      : { backgroundColor: "rgba(186, 230, 253, 0.72)", borderColor: "rgba(125, 211, 252, 0.9)" })
    : null;
  const sunTimes = computeSunTimes(airportMeta?.lat, airportMeta?.lon, new Date(), tz);

  if (mobileLayout) {
    return (
      <section className="metar-panel metar-panel--mobile">
        <div className="metar-section-head metar-section-head--mobile">
          <div className="metar-mobile-head-row">
            <div className="metar-section-time">
              <span className="panel-kind-badge">{metarBadgeText}</span>
              <span>{metarTimeText}</span>
            </div>
            <div className="metar-mobile-suntime">☀ 일출 {sunTimes.sunrise} / 일몰 {sunTimes.sunset}</div>
          </div>
        </div>

        <article className="flight-category-panel metar-mobile-flight-category" style={{ backgroundColor: flightCategory.color }}>
          <div className="flight-category-panel-code">{flightCategory.category}</div>
          <div className="flight-category-panel-label">{flightCategory.labelKo}</div>
        </article>

        <div className="metar-mobile-grid">
          <article
            className="metar-mobile-card"
            style={{
              backgroundColor: catColors(visibilityCategory).bg,
              borderLeft: `3px solid ${visibilityCategory.border}`,
              borderTop: `0.5px solid ${catColors(visibilityCategory).borderSoft}`,
              borderRight: `0.5px solid ${catColors(visibilityCategory).borderSoft}`,
              borderBottom: `0.5px solid ${catColors(visibilityCategory).borderSoft}`,
            }}
          >
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">시정</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--placeholder" aria-hidden="true" />
            </div>
            <div className="metar-mobile-card-value" style={{ color: catColors(visibilityCategory).valueColor }}>{visibilityValue}</div>
            {minimumVisibilityDetail ? <div className="metar-mobile-card-sub">{minimumVisibilityDetail}</div> : null}
          </article>

          <article
            className="metar-mobile-card"
            style={{
              backgroundColor: catColors(ceilingCategory).bg,
              borderLeft: `3px solid ${ceilingCategory.border}`,
              borderTop: `0.5px solid ${catColors(ceilingCategory).borderSoft}`,
              borderRight: `0.5px solid ${catColors(ceilingCategory).borderSoft}`,
              borderBottom: `0.5px solid ${catColors(ceilingCategory).borderSoft}`,
            }}
          >
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">운고</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--placeholder" aria-hidden="true" />
            </div>
            <div className="metar-mobile-card-value" style={{ color: catColors(ceilingCategory).valueColor }}>{ceilingValue}</div>
          </article>

          <article className={`metar-mobile-card${highWind ? " metar-card--alert-outline" : ""}`}>
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">바람</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--wind" aria-hidden="true">
                <span className="wind-arrow-inline" style={{ transform: `rotate(${windDirectionRotation}deg)` }}>↑</span>
              </div>
            </div>
            <div className="metar-mobile-card-value">{`${windDirectionText}/${windSpeedText}kt`}</div>
            {windGustText ? <div className="metar-mobile-card-sub">{windGustText}</div> : null}
          </article>

          <article className={`metar-mobile-card${crosswindAlert ? " metar-card--alert-outline" : ""}`}>
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">측풍</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--crosswind" aria-hidden="true">
                <span className="metar-direction-arrow">{crosswindArrow}</span>
              </div>
            </div>
            <div className="metar-mobile-card-value">{crosswindValue}</div>
          </article>

          <article
            className={`metar-mobile-card${specialWeather ? " metar-card--special-weather" : ""}${precipitationWeather ? " metar-card--precip-weather" : ""}`}
            style={precipitationCardStyle || undefined}
          >
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">현재 날씨</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--weather" aria-hidden="true">
                <WeatherIcon visual={weatherVisual} className="mini" />
              </div>
            </div>
            <div className="metar-mobile-card-value">{weatherKorean}</div>
          </article>

          <article className="metar-mobile-card">
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">온도</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--temp" aria-hidden="true">
                <img src="/temp_icon.png" alt="" aria-hidden="true" />
              </div>
            </div>
            <div className="metar-mobile-card-value">{tempDisplay}</div>
            <div className="metar-mobile-card-sub">습도 {rhDisplay}{feelsLikeText ? ` / ${feelsLikeText}` : ""}</div>
          </article>

          <article className="metar-mobile-card">
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">일강수량</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--placeholder" aria-hidden="true" />
            </div>
            <div className="metar-mobile-card-value">{rainValueText || "-"}</div>
          </article>

          <article className="metar-mobile-card">
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">QNH</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--placeholder" aria-hidden="true" />
            </div>
            <div className="metar-mobile-card-value">{qnhDisplay}</div>
          </article>
        </div>

        {hasRvrDetails && (
          <article
            className="metar-mobile-card metar-mobile-card--rvr"
            style={{
              backgroundColor: catColors(rvrPanelCategory).bg,
              borderLeft: `3px solid ${rvrPanelCategory.border}`,
              borderTop: `0.5px solid ${catColors(rvrPanelCategory).borderSoft}`,
              borderRight: `0.5px solid ${catColors(rvrPanelCategory).borderSoft}`,
              borderBottom: `0.5px solid ${catColors(rvrPanelCategory).borderSoft}`,
            }}
          >
            <div className="metar-mobile-card-head">
              <div className="metar-mobile-card-title">RVR</div>
              <div className="metar-mobile-card-icon metar-mobile-card-icon--placeholder" aria-hidden="true" />
            </div>
            <div className="rvr-panel-values rvr-panel-values--mobile">
              <div
                className="rvr-panel-grid"
                style={{ gridTemplateColumns: `repeat(${Math.min(rvrEntries.length, 2)}, minmax(0, 1fr))` }}
              >
                {rvrEntries.slice(0, 4).map(({ runway, value, cat }, idx) => {
                  const cs = getRvrEntryStyle(cat);
                  return (
                    <div key={`${runway}-${idx}`} className="rvr-panel-entry" style={{ backgroundColor: cs.bg }}>
                      <div className="rvr-panel-entry-runway" style={{ color: cs.labelColor }}>{runway}</div>
                      <div className="rvr-panel-entry-value" style={{ color: cs.valueColor }}>{value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        )}
      </section>
    );
  }

  return (
    <section className="metar-panel">
      <div className="metar-panel-grid">
        <div className="metar-section">
          <div className="metar-section-head">
            <div className="metar-section-time">
              <span className="panel-kind-badge">{metarBadgeText}</span>
              <span>{metarTimeText}</span>
            </div>
          </div>
          <div className="metar-section-body metar-section-body--conditions">
            <div className="flight-condition-layout">
              <article className="flight-category-panel" style={{ backgroundColor: flightCategory.color }}>
                <div className="flight-category-panel-code">{flightCategory.category}</div>
                <div className="flight-category-panel-label">{flightCategory.labelKo}</div>
              </article>

              <div className="flight-condition-stack" style={{ gridTemplateRows: hasRvrDetails ? "1fr 1fr 1fr" : "1fr 1fr" }}>
                <article
                  className="metar-surface-card metar-surface-card--weather"
                  style={{
                    backgroundColor: catColors(visibilityCategory).bg,
                    borderLeft: `3px solid ${visibilityCategory.border}`,
                    borderTop: `0.5px solid ${catColors(visibilityCategory).borderSoft}`,
                    borderRight: `0.5px solid ${catColors(visibilityCategory).borderSoft}`,
                    borderBottom: `0.5px solid ${catColors(visibilityCategory).borderSoft}`,
                  }}
                >
                  <div className="metar-side-label metar-side-label--text">
                    <div className="metar-side-text">시정</div>
                  </div>
                  <div className="metar-side-value metar-side-value--anchored metar-side-value--stack">
                    <div className="metar-side-anchor">
                      <div className="metar-side-main">
                        <div className="metar-wind-row" style={{ minHeight: "unset" }}>
                          <span className="metar-wind-inline-text" style={{ color: catColors(visibilityCategory).valueColor }}>{visibilityValue}</span>
                        </div>
                      </div>
                      {minimumVisibilityDetail ? (
                        <div className="metar-side-secondary metar-side-secondary--compact">
                          <div className="metar-compact-sub">{minimumVisibilityDetail}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>

                {hasRvrDetails && (
                  <article
                    className="metar-surface-card metar-surface-card--rvr"
                    style={{
                      backgroundColor: catColors(rvrPanelCategory).bg,
                      borderLeft: `3px solid ${rvrPanelCategory.border}`,
                      borderTop: `0.5px solid ${catColors(rvrPanelCategory).borderSoft}`,
                      borderRight: `0.5px solid ${catColors(rvrPanelCategory).borderSoft}`,
                      borderBottom: `0.5px solid ${catColors(rvrPanelCategory).borderSoft}`,
                    }}
                  >
                    <div className="metar-side-label metar-side-label--icon">
                      <div className="metar-side-icon metar-side-icon--metric">
                        <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--muted)" }}>RVR</span>
                      </div>
                    </div>
                    <div className="rvr-panel-values">
                      <div
                        className="rvr-panel-grid"
                        style={{ gridTemplateColumns: `repeat(${Math.min(rvrEntries.length, 2)}, minmax(0, 1fr))` }}
                      >
                        {rvrEntries.slice(0, 4).map(({ runway, value, cat }, idx) => {
                          const cs = getRvrEntryStyle(cat);
                          return (
                            <div key={`${runway}-${idx}`} className="rvr-panel-entry" style={{ backgroundColor: cs.bg }}>
                              <div className="rvr-panel-entry-runway" style={{ color: cs.labelColor }}>{runway}</div>
                              <div className="rvr-panel-entry-value" style={{ color: cs.valueColor }}>{value}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                )}

                <article
                  className="metar-surface-card metar-surface-card--weather"
                  style={{
                    backgroundColor: catColors(ceilingCategory).bg,
                    borderLeft: `3px solid ${ceilingCategory.border}`,
                    borderTop: `0.5px solid ${catColors(ceilingCategory).borderSoft}`,
                    borderRight: `0.5px solid ${catColors(ceilingCategory).borderSoft}`,
                    borderBottom: `0.5px solid ${catColors(ceilingCategory).borderSoft}`,
                  }}
                >
                  <div className="metar-side-label metar-side-label--text">
                    <div className="metar-side-text">운고</div>
                  </div>
                  <div className="metar-side-value metar-side-value--anchored metar-side-value--only">
                    <div className="metar-side-anchor">
                      <div className="metar-side-main">
                        <div className="metar-wind-row">
                          <span className="metar-wind-inline-text" style={{ color: catColors(ceilingCategory).valueColor }}>{ceilingValue}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>

        <div className="metar-section">
          <div className="metar-section-head" />
          <div className="metar-section-body metar-section-body--weather">
            {rainText ? (
              <div className="metar-panel-rain-badge">
                <span className="metar-panel-rain-label">일강수량 </span>
                <span className="metar-panel-rain-value">{`${dailyRain.mm.toFixed(1)} mm`}</span>
              </div>
            ) : null}
            <div className="metar-weather-grid">
              <article className={`metar-surface-card metar-surface-card--wind${highWind ? " metar-card--alert-outline" : ""}`}>
                <div className="metar-side-label metar-side-label--icon">
                  <div className="metar-side-icon metar-side-icon--wind">
                    <span
                      className="metar-direction-arrow"
                      aria-hidden="true"
                      style={{ transform: `rotate(${windDirectionRotation}deg)` }}
                    >
                      ↑
                    </span>
                  </div>
                  <div className="metar-side-text">바람</div>
                </div>
                <div className="metar-side-value metar-side-value--anchored metar-side-value--stack">
                  <div className="metar-side-anchor">
                    <div className="metar-side-main">
                      <div className="metar-wind-row">
                        <span className="metar-wind-inline-text">{`${windDirectionText}/${windSpeedText}kt`}</span>
                      </div>
                    </div>
                    <div className="metar-side-secondary">
                      {windGustText ? <div className="metar-wind-layer metar-wind-layer--gust">{windGustText}</div> : null}
                    </div>
                  </div>
                </div>
              </article>

              <article
                className={`metar-surface-card metar-surface-card--weather${specialWeather ? " metar-card--special-weather" : ""}${precipitationWeather ? " metar-card--precip-weather" : ""}`}
                style={precipitationCardStyle || undefined}
              >
                <div className="metar-side-label metar-side-label--icon">
                  <div className="metar-side-icon metar-side-icon--weather-image">
                    <img src={weatherTitleImage} alt="" aria-hidden="true" />
                  </div>
                  <div className="metar-side-text">현재 날씨</div>
                </div>
                <div className="metar-side-value metar-side-value--anchored metar-side-value--visual">
                  <div className="metar-side-anchor">
                    <div className="metar-side-main">
                      <div className="metar-weather-inline-icon">
                        <WeatherIcon visual={weatherVisual} />
                      </div>
                      <div className="metar-weather-text">{weatherKorean}</div>
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div className="metar-weather-grid metar-weather-grid--bottom">
              <article className={`metar-surface-card metar-surface-card--compact${crosswindAlert ? " metar-card--alert-outline" : ""}`}>
                <div className="metar-side-label metar-side-label--icon">
                  <div className="metar-side-icon metar-side-icon--metric">
                    <span className="metar-direction-arrow" aria-hidden="true">{crosswindArrow}</span>
                  </div>
                  <div className="metar-side-text">측풍</div>
                </div>
                <div className="metar-side-value metar-side-value--only">
                  <div className="metar-side-main">
                    <div className="metar-compact-value">{crosswindValue}</div>
                  </div>
                </div>
              </article>

              <article className="metar-surface-card metar-surface-card--compact">
                <div className="metar-side-label metar-side-label--icon">
                  <div className="metar-side-icon metar-side-icon--metric metar-side-icon--temp">
                    <img src="/temp_icon.png" alt="" aria-hidden="true" />
                  </div>
                  <div className="metar-side-text">온도/습도</div>
                </div>
                <div className="metar-side-value metar-side-value--anchored metar-side-value--stack">
                  <div className="metar-side-anchor">
                    <div className="metar-side-main">
                      <div className="metar-compact-value metar-compact-value--paired">{tempDisplay} / {rhDisplay}</div>
                    </div>
                    <div className="metar-side-secondary metar-side-secondary--compact">
                      {feelsLikeText ? <div className="metar-compact-sub">{feelsLikeText}</div> : null}
                    </div>
                  </div>
                </div>
              </article>
              </div>
            </div>
          </div>
      </div>
    </section>
  );
}
