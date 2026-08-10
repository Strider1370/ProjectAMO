import { getWeatherIconSrc } from "../../../../shared/weather/weather-icon-registry.js";
import { mapGroundForecastIcon, isPrecipitationIcon, formatIssuedAt } from "./GroundForecastClassicPanel";

const W = 720;
const H = 172;
const PAD_L = 40;
const PAD_R = 40;
const ICON_Y = 14;
const ICON_SIZE = 30;
const T_TOP = 60;
const T_BOT = 104;
const BAR_BASE = 150;
const BAR_MAX = 30;
const BAR_W = 18;
const AXIS_Y = 166;

function hourLabel(time) {
  const h = Number(String(time || "").slice(0, 2));
  return Number.isFinite(h) ? `${h}시` : "-";
}

function dateChip(date) {
  if (!date) return null;
  const d = Number(String(date).slice(6, 8));
  if (!Number.isFinite(d)) return null;
  return `${d}일`;
}

// 수집기는 기상청 원본대로 1시간 간격 24개를 담는다. 이 띠는 24시간을 한눈에 보여주는
// 용도라 3시간 간격 8칸으로 솎아 쓴다. 도착지 예보처럼 촘촘한 값이 필요한 화면은 원본을 쓴다.
const DISPLAY_STEP_HOURS = 3;

function everyThirdHour(slots) {
  return slots.filter((slot) => Number(String(slot?.time).slice(0, 2)) % DISPLAY_STEP_HOURS === 0);
}

export default function GroundHourlyStripClassic({ groundForecastData, icao }) {
  const airport = groundForecastData?.airports?.[icao] || null;
  const slots = everyThirdHour(airport?.hourly || []);
  if (slots.length === 0) return null;

  const issuedAt = formatIssuedAt(`${airport?.hourly_status?.base_date || ""}${airport?.hourly_status?.base_time || ""}`);

  const n = slots.length;
  const step = n > 1 ? (W - PAD_L - PAD_R) / (n - 1) : 0;
  const xs = slots.map((_, i) => PAD_L + i * step);

  const temps = slots.map((s) => s.temp).filter(Number.isFinite);
  const tMin = temps.length ? Math.min(...temps) : 0;
  const tMax = temps.length ? Math.max(...temps) : 1;
  const tRange = tMax - tMin || 1;
  const tempY = (t) => T_BOT - ((t - tMin) / tRange) * (T_BOT - T_TOP);

  const linePoints = slots
    .map((s, i) => (Number.isFinite(s.temp) ? `${xs[i]},${tempY(s.temp)}` : null))
    .filter(Boolean)
    .join(" ");

  const bandX = xs[0] - 22;
  const bandW = xs[n - 1] - xs[0] + 44;

  // Per-slot cell boundaries (midpoints between neighboring icons, band edges at the ends),
  // so consecutive rainy slots merge into one continuous rect instead of being cut per-icon.
  const cellBounds = [bandX, ...slots.slice(1).map((_, i) => (xs[i] + xs[i + 1]) / 2), bandX + bandW];
  const rainRuns = [];
  let runStart = null;
  slots.forEach((s, i) => {
    const rainy = isPrecipitationIcon(s.icon);
    if (rainy && runStart === null) runStart = i;
    if (!rainy && runStart !== null) {
      rainRuns.push([runStart, i - 1]);
      runStart = null;
    }
  });
  if (runStart !== null) rainRuns.push([runStart, n - 1]);

  return (
    <section className="ground-hourly-strip panel" aria-label="시간별 예보">
      <div className="ground-hourly-header">
        <span>시간별 예보</span>
        {issuedAt && <span className="ground-forecast-issued">동네예보 {issuedAt} 발표</span>}
      </div>
      <svg
        className="ground-hourly-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="향후 24시간 3시간 간격 기온 곡선과 강수확률 그래프"
      >
        <rect className="ghs-iconband" x={bandX} y={ICON_Y - 6} width={bandW} height={ICON_SIZE + 12} rx="10" />
        {rainRuns.map(([start, end]) => (
          <rect
            key={`rain-${start}-${end}`}
            className="ghs-iconband-rain"
            x={cellBounds[start]}
            y={ICON_Y - 6}
            width={cellBounds[end + 1] - cellBounds[start]}
            height={ICON_SIZE + 12}
            rx="10"
          />
        ))}

        {slots.map((s, i) =>
          Number.isFinite(s.rainProb) ? (
            <g key={`bar-${i}`}>
              <rect
                className="ghs-bar"
                x={xs[i] - BAR_W / 2}
                y={BAR_BASE - (s.rainProb / 100) * BAR_MAX}
                width={BAR_W}
                height={(s.rainProb / 100) * BAR_MAX}
                rx="3"
              />
              <text className="ghs-pop" x={xs[i]} y={BAR_BASE - (s.rainProb / 100) * BAR_MAX - 4} textAnchor="middle">
                {s.rainProb}%
              </text>
            </g>
          ) : null,
        )}

        <polyline className="ghs-line" points={linePoints} fill="none" />

        {slots.map((s, i) => {
          const src = getWeatherIconSrc(mapGroundForecastIcon(s.icon));
          return (
            <g key={`pt-${i}`}>
              <image className="ghs-icon" href={src} x={xs[i] - ICON_SIZE / 2} y={ICON_Y} width={ICON_SIZE} height={ICON_SIZE} />
              {Number.isFinite(s.temp) && (
                <>
                  <circle
                    className={`ghs-dot${s.temp === tMax ? " is-max" : ""}${s.temp === tMin ? " is-min" : ""}`}
                    cx={xs[i]}
                    cy={tempY(s.temp)}
                    r="3.5"
                  />
                  <text
                    className={`ghs-temp${s.temp === tMax ? " is-max" : ""}${s.temp === tMin ? " is-min" : ""}`}
                    x={xs[i]}
                    y={tempY(s.temp) - 9}
                    textAnchor="middle"
                  >
                    {Math.round(s.temp)}°
                  </text>
                </>
              )}
            </g>
          );
        })}

        {slots.map((s, i) => {
          const prev = slots[i - 1];
          const changed = prev && s.date && s.date !== prev.date;
          const dc = dateChip(s.date);
          const label = (i === 0 || changed) && dc ? `${dc} ${hourLabel(s.time)}` : hourLabel(s.time);
          return (
            <text
              key={`ax-${i}`}
              className={`ghs-time${i === 0 ? " is-now" : ""}${changed ? " is-daybreak" : ""}`}
              x={xs[i]}
              y={AXIS_Y}
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </section>
  );
}
