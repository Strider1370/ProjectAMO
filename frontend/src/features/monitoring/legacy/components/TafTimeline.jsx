import React from "react";
import {
  safe,
  formatUtc,
  getSeverityLevel,
  getDisplayDate,
  getFlightCategory,
  FLIGHT_CATEGORY_META,
  classifyVisibilityCategory,
  classifyCeilingCategory,
  isDarkTheme,
  hasPrecipitationWeather,
  hasHighWindCondition,
} from "../utils/helpers";
import WeatherIcon from "./WeatherIcon";
import {
  groupElementsByValue,
  convertWeatherToKorean,
} from "../utils/visual-mapper";
import { resolveWeatherVisual } from "../utils/weather-visual-resolver";
import { getCurrentRouteContext } from "../utils/route-mode";

const FC_COLORS = { VFR: "#15803d", MVFR: "#2563eb", IFR: "#f59e0b", LIFR: "#dc2626" };
const WIND_STYLE = { backgroundColor: "var(--card-bg)", color: "var(--muted)" };
const TAF_SEGMENT_DENSITY = {
  SOLO: "solo",
  COMPACT: "compact",
  FULL: "full",
};
const TINT_STYLE = {
  VFR: { backgroundColor: "rgba(21, 128, 61, 0.08)", borderLeft: "3px solid #15803d", color: "#166534" },
  MVFR: { backgroundColor: "rgba(37, 99, 235, 0.08)", borderLeft: "3px solid #2563eb", color: "#1d4ed8" },
  IFR: { backgroundColor: "rgba(245, 158, 11, 0.08)", borderLeft: "3px solid #f59e0b", color: "#b45309" },
  LIFR: { backgroundColor: "rgba(220, 38, 38, 0.08)", borderLeft: "3px solid #dc2626", color: "#b91c1c" },
};
const TINT_STYLE_DARK = {
  VFR: { backgroundColor: "rgba(21, 128, 61, 0.18)", borderLeft: "3px solid #15803d", color: "#4ade80" },
  MVFR: { backgroundColor: "rgba(37, 99, 235, 0.18)", borderLeft: "3px solid #2563eb", color: "#93c5fd" },
  IFR: { backgroundColor: "rgba(245, 158, 11, 0.25)", borderLeft: "3px solid #f59e0b", color: "#fbbf24" },
  LIFR: { backgroundColor: "rgba(220, 38, 38, 0.18)", borderLeft: "3px solid #dc2626", color: "#f87171" },
};

function getTintStyle(category) {
  return isDarkTheme() ? (TINT_STYLE_DARK[category] || TINT_STYLE_DARK.VFR) : (TINT_STYLE[category] || TINT_STYLE.VFR);
}

function getWeatherStyle(hasPrecipitation) {
  if (hasPrecipitation) {
    return isDarkTheme()
      ? { backgroundColor: "rgba(14, 116, 144, 0.34)", color: "#e0f2fe" }
      : { backgroundColor: "rgba(186, 230, 253, 0.72)", color: "#0c4a6e" };
  }
  return { backgroundColor: "var(--card-bg)", color: isDarkTheme() ? "#ffffff" : "#111111" };
}

function getCeiling(slot) {
  return slot.clouds
    ?.filter((cloud) => cloud.amount === "BKN" || cloud.amount === "OVC")
    .sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity))[0]?.base ?? null;
}

function formatCeiling(base) {
  return base != null ? `${base}ft` : "NSC";
}

function formatVisibility(vis, displayValue) {
  if (Number.isFinite(vis)) {
    return `${vis}m`;
  }
  if (displayValue && displayValue !== "//" && displayValue !== "-") {
    const numeric = displayValue.replace(/\D/g, "");
    return numeric ? `${Number(numeric)}m` : displayValue;
  }
  return "-";
}

function formatVisibilityValue(vis, displayValue) {
  const meters = parseVisibilityMeters(vis, displayValue);
  if (!Number.isFinite(meters)) return "-";
  return `${meters}m`;
}

function parseVisibilityMeters(vis, displayValue) {
  if (Number.isFinite(vis)) return vis;
  if (displayValue && displayValue !== "//" && displayValue !== "-") {
    const numeric = Number(displayValue.replace(/\D/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }
  return null;
}

function formatCompactVisibility(vis, displayValue) {
  const meters = parseVisibilityMeters(vis, displayValue);
  if (!Number.isFinite(meters)) return formatVisibility(vis, displayValue);
  return `${meters}m`;
}

function getSegmentDensity(hourCount) {
  if (hourCount <= 1) return TAF_SEGMENT_DENSITY.SOLO;
  if (hourCount === 2) return TAF_SEGMENT_DENSITY.COMPACT;
  return TAF_SEGMENT_DENSITY.FULL;
}

function getDensityContainerClass(density) {
  if (density === TAF_SEGMENT_DENSITY.SOLO) return " taf-new-seg--solo";
  if (density === TAF_SEGMENT_DENSITY.COMPACT) return " taf-new-seg--compact";
  return "";
}

function getBasicLabelClass(density) {
  if (density === TAF_SEGMENT_DENSITY.FULL) return "segment-label";
  return "segment-label taf-new-seg-small";
}

function shouldShowWeatherText(density) {
  return density !== TAF_SEGMENT_DENSITY.SOLO;
}

function shouldShowWindText(density) {
  return density !== TAF_SEGMENT_DENSITY.SOLO;
}

function getWeatherLabelClass(density) {
  if (density === TAF_SEGMENT_DENSITY.COMPACT) return "segment-label taf-new-seg-small";
  return "segment-label";
}

function getWindLabelClass() {
  return "segment-label";
}

function getVisibilityText(vis, displayValue, density) {
  if (density === TAF_SEGMENT_DENSITY.FULL) return formatVisibilityValue(vis, displayValue);
  return formatCompactVisibility(vis, displayValue);
}

function getVisibilityLabelClass(density) {
  if (density === TAF_SEGMENT_DENSITY.SOLO) return "segment-label taf-new-seg-xsmall";
  if (density === TAF_SEGMENT_DENSITY.COMPACT) return "segment-label taf-new-seg-medium";
  return "segment-label";
}

function getVisibilitySegmentExtraClass(density) {
  return density === TAF_SEGMENT_DENSITY.SOLO ? " taf-new-seg--visibility-solo" : "";
}

function getSegmentClassName(baseClass, density, extraClasses = "") {
  return `taf-new-seg ${baseClass}${getDensityContainerClass(density)}${extraClasses}`;
}

function hasSpecialWeather(slot) {
  const raw = String(slot?.display?.weather || "").toUpperCase();
  return ["TS", "SN", "FG"].some((token) => raw.includes(token));
}

function hasAlertWind(slot) {
  return hasHighWindCondition(slot?.wind);
}

function getTafBadgeText(header) {
  const combined = `${header?.report_type || ""} ${header?.report_status || ""}`.toUpperCase();
  if (combined.includes("CORR") || /\bCOR\b/.test(combined)) return "TAF COR";
  if (combined.includes("AMEND") || /\bAMD\b/.test(combined)) return "TAF AMD";
  return "TAF";
}

function buildTafDisplaySlots(timeline, icao, minimaSettings) {
  return timeline.map((slot) => {
    const visibilityValue = slot.visibility?.value ?? null;
    const ceiling = getCeiling(slot);
    const flightCategory = getFlightCategory(visibilityValue, ceiling, icao, minimaSettings).category;
    const visibilityCategory = classifyVisibilityCategory(visibilityValue, icao, minimaSettings).category;
    const ceilingCategory = classifyCeilingCategory(ceiling, icao, minimaSettings).category;
    const weatherVisual = resolveWeatherVisual(slot, slot.time);
    const miniWeatherVisual = weatherVisual
      ? { ...weatherVisual, intensityOverlay: null }
      : weatherVisual;
    const weatherLabel = convertWeatherToKorean(
      slot.display?.weather,
      slot.visibility?.cavok ?? slot.cavok,
      slot.clouds || []
    );
    const wind = slot.wind;
    const windRotation = (wind?.direction || 0) + 180;
    const windText = `${wind?.speed ?? 0}${wind?.gust ? `G${wind.gust}` : ""}kt`;

    return {
      slot,
      time: slot.time,
      visibilityValue,
      ceiling,
      flightCategory,
      visibilityCategory,
      ceilingCategory,
      visibilityStyle: getTintStyle(visibilityCategory),
      ceilingStyle: getTintStyle(ceilingCategory),
      weatherVisual,
      miniWeatherVisual,
      weatherLabel,
      wind,
      windRotation,
      windText,
      visibilityText: formatVisibilityValue(visibilityValue, slot.display?.visibility),
      ceilingText: formatCeiling(ceiling),
      isSpecialWeather: hasSpecialWeather(slot),
      hasPrecipitation: hasPrecipitationWeather(slot),
      highWind: hasAlertWind(slot),
    };
  });
}

function buildTafTableSegments(displaySlots) {
  const segments = [];

  for (const displaySlot of displaySlots) {
    const slot = displaySlot.slot;
    const signature = JSON.stringify({
      flightCategory: displaySlot.flightCategory,
      wind: slot.display?.wind || "",
      visibility: slot.display?.visibility || "",
      weather: slot.display?.weather || "",
      clouds: slot.display?.clouds || "",
    });

    const previous = segments[segments.length - 1];
    if (previous && previous.signature === signature) {
      previous.end = displaySlot.time;
      previous.hourCount += 1;
      continue;
    }

    segments.push({
      signature,
      start: displaySlot.time,
      end: displaySlot.time,
      hourCount: 1,
      displaySlot,
    });
  }

  return segments;
}

function formatTafRange(start, end, tz) {
  const startDate = getDisplayDate(start, tz);
  const endDate = getDisplayDate(end, tz);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "-";
  }

  const startDay = startDate.getUTCDate();
  const endDay = endDate.getUTCDate();
  const startHour = String(startDate.getUTCHours()).padStart(2, "0");
  const rawExclusiveHour = endDate.getUTCHours() + 1;
  const isMidnight = rawExclusiveHour === 24;
  const endHourExclusive = isMidnight ? "24" : String(rawExclusiveHour).padStart(2, "0");
  const endDayLabel = endDay !== startDay ? ` ${endDay}일` : "";

  return `${startDay}일 ${startHour}시 ~${endDayLabel} ${endHourExclusive}시`;
}

export default function TafTimeline({ tafData, icao, minimaSettings = null, version = "v2", onVersionToggle, tz = "UTC", mobileLayout = false }) {
  const target = tafData?.airports?.[icao];
  const rawTimeline = target?.timeline || [];
  const now = Date.now();
  const { isTestPage } = getCurrentRouteContext();
  const timeline = isTestPage
    ? rawTimeline
    : rawTimeline.filter(
      (slot) => new Date(slot.time).getTime() + 3600 * 1000 > now
    );
  const displaySlots = buildTafDisplaySlots(timeline, icao, minimaSettings);
  const effectiveVersion = mobileLayout ? (version === "v3" ? "v3" : "table") : version;
  const isTimelineView = effectiveVersion === "v2";
  const isTableView = effectiveVersion === "table";
  const tableSegments = buildTafTableSegments(displaySlots);
  const lastEnd = target?.header?.valid_end;
  const tafTime = formatUtc(target?.header?.valid_start, tz);
  const tafTimeText = tafTime || "";
  const tafBadgeText = getTafBadgeText(target?.header);

  if (rawTimeline.length === 0) {
    return (
      <section className="taf-panel-empty">
        <p>No TAF timeline data for selected airport.</p>
      </section>
    );
  }

  if (timeline.length === 0) {
    return (
      <section className="taf-panel-empty">
        <p>TAF 유효 기간이 만료됐습니다.</p>
      </section>
    );
  }

  const viewToggle = (
    <div className="taf-view-toggle" role="tablist" aria-label="TAF view mode">
      {!mobileLayout && (
        <button
          type="button"
          className={`taf-view-toggle-btn${isTimelineView ? " active" : ""}`}
          onClick={() => onVersionToggle?.("v2")}
          aria-pressed={isTimelineView}
        >
          타임라인
        </button>
      )}
      <button
        type="button"
        className={`taf-view-toggle-btn${isTableView ? " active" : ""}`}
        onClick={() => onVersionToggle?.("table")}
        aria-pressed={isTableView}
      >
        카드
      </button>
      <button
        type="button"
        className={`taf-view-toggle-btn${effectiveVersion === "v3" ? " active" : ""}`}
        onClick={() => onVersionToggle?.("v3")}
        aria-pressed={effectiveVersion === "v3"}
      >
        표
      </button>
    </div>
  );

  if (effectiveVersion === "v2") {
    const flightCatGroups = groupElementsByValue(displaySlots, (displaySlot) => displaySlot.flightCategory);
    const weatherGroups = groupElementsByValue(displaySlots, (displaySlot) => {
      const baseIconId = String(displaySlot.weatherVisual?.iconId || "unknown").replace(/-(day|night)$/, "");
      return `${baseIconId}|${displaySlot.weatherLabel}`;
    });
    const windGroups = groupElementsByValue(displaySlots, (displaySlot) => {
      const wind = displaySlot.wind;
      return `${wind?.direction ?? "VRB"}_${wind?.speed ?? 0}_${wind?.gust ?? 0}`;
    });
    const ceilingGroups = groupElementsByValue(displaySlots, (displaySlot) => String(displaySlot.ceiling ?? "null"));
    const visibilityGroups = groupElementsByValue(displaySlots, (displaySlot) => String(displaySlot.visibilityValue ?? "null"));

    return (
      <section className="taf-new-panel">
        <div className="taf-new-header">
          <span className="taf-new-validity">
            <span className="panel-kind-badge">{tafBadgeText}</span>
            <span>{tafTimeText}</span>
          </span>
          {viewToggle}
        </div>
        <div className="taf-new-container">
          <div className="taf-new-row time-row">
            <div className="taf-new-label"></div>
            <div className="taf-new-scale" style={{ "--taf-hour-count": String(displaySlots.length) }}>
              {displaySlots.map((displaySlot, i) => {
                const dateObj = getDisplayDate(displaySlot.time, tz);
                const hour = dateObj.getUTCHours();
                const isFirst = i === 0;
                const isNewDay = hour === 0;
                if (hour % 3 === 0 || isFirst || isNewDay) {
                  return (
                    <div key={i} className="taf-scale-item" style={{ left: `${(i / displaySlots.length) * 100}%` }}>
                      {(isFirst || isNewDay) && <span className="taf-scale-date">{dateObj.getUTCDate()}일</span>}
                      <span className="taf-scale-hour">{hour}시</span>
                    </div>
                  );
                }
                return null;
              })}
              {lastEnd && (() => {
                const endDate = getDisplayDate(lastEnd, tz);
                return (
                  <div className="taf-scale-item taf-scale-end" style={{ left: "100%" }}>
                    <span className="taf-scale-hour">{endDate.getUTCHours()}시</span>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="taf-new-row taf-new-row--flight">
            <div className="taf-new-label">비행조건</div>
            <div className="taf-new-timeline">
              {flightCatGroups.map((group, i) => {
                const density = getSegmentDensity(group.hourCount);
                return (
                  <div
                    key={i}
                    className={getSegmentClassName("taf-new-seg--flight", density)}
                    style={{
                      width: `${group.width}%`,
                      backgroundColor: FC_COLORS[group.value] || FC_COLORS.VFR,
                      color: "#fff",
                    }}
                    title={group.value}
                  >
                    <span className={getBasicLabelClass(density)}>{group.value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row taf-new-row--visibility">
            <div className="taf-new-label">날씨</div>
            <div className="taf-new-timeline">
              {weatherGroups.map((group, i) => {
                const density = getSegmentDensity(group.hourCount);
                const [, weatherLabel = group.value] = String(group.value).split("|");
                const precipitationWeather = group.data.hasPrecipitation;

                return (
                  <div
                    key={i}
                    className={getSegmentClassName(
                      "taf-new-seg--weather",
                      density,
                      `${group.data.isSpecialWeather ? " taf-new-seg--special-weather" : ""}${precipitationWeather ? " taf-new-seg--precip-weather" : ""}`
                    )}
                    style={{ width: `${group.width}%`, ...getWeatherStyle(precipitationWeather) }}
                    title={weatherLabel}
                  >
                    <WeatherIcon visual={group.data.miniWeatherVisual} className="mini" />
                    {shouldShowWeatherText(density) && <span className={getWeatherLabelClass(density)}>{weatherLabel}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row taf-new-row--ceiling">
            <div className="taf-new-label">바람</div>
            <div className="taf-new-timeline">
              {windGroups.map((group, i) => {
                const density = getSegmentDensity(group.hourCount);
                return (
                  <div
                    key={i}
                    className={getSegmentClassName("taf-new-seg--wind", density, group.data.highWind ? " taf-new-seg--wind-alert" : "")}
                    style={{ width: `${group.width}%`, ...WIND_STYLE }}
                    title={`${group.data.wind?.direction ?? "VRB"}° ${group.data.windText}`}
                  >
                    <span className="wind-arrow-inline" style={{ transform: `rotate(${group.data.windRotation}deg)` }}>↑</span>
                    {shouldShowWindText(density) && <span className={getWindLabelClass(density)}>{group.data.windText}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row">
            <div className="taf-new-label">시정</div>
            <div className="taf-new-timeline">
              {visibilityGroups.map((group, i) => {
                const density = getSegmentDensity(group.hourCount);
                const visibilityText = getVisibilityText(
                  group.data.visibilityValue,
                  group.data.slot.display?.visibility,
                  density
                );
                return (
                  <div
                    key={i}
                    className={getSegmentClassName("taf-new-seg--tint", density, getVisibilitySegmentExtraClass(density))}
                    style={{ width: `${group.width}%`, ...group.data.visibilityStyle }}
                    title={visibilityText}
                  >
                    <span className={getVisibilityLabelClass(density)}>{visibilityText}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="taf-new-row">
            <div className="taf-new-label">운고</div>
            <div className="taf-new-timeline">
              {ceilingGroups.map((group, i) => {
                const density = getSegmentDensity(group.hourCount);
                return (
                  <div
                    key={i}
                    className={getSegmentClassName("taf-new-seg--tint", density)}
                    style={{ width: `${group.width}%`, ...group.data.ceilingStyle }}
                    title={group.data.ceilingText}
                  >
                    <span className={getBasicLabelClass(density)}>{group.data.ceilingText}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (effectiveVersion === "v3") {
    if (mobileLayout) {
      return (
        <section className="panel taf-mobile-v3-panel">
          <div className="taf-legacy-header taf-legacy-header--mobile-v3">
            <span className="taf-new-validity">
              <span className="panel-kind-badge">{tafBadgeText}</span>
              <span>{tafTimeText}</span>
            </span>
            {viewToggle}
          </div>
          <div className="taf-mobile-v3-table" role="table" aria-label="TAF 카드형 표">
            <div className="taf-mobile-v3-head" role="row">
              <div className="taf-mobile-v3-head-cell" role="columnheader">시간</div>
              <div className="taf-mobile-v3-head-cell" role="columnheader">날씨</div>
              <div className="taf-mobile-v3-head-cell" role="columnheader">바람</div>
              <div className="taf-mobile-v3-head-cell" role="columnheader">운고</div>
              <div className="taf-mobile-v3-head-cell" role="columnheader">시정</div>
            </div>
            <div className="taf-mobile-v3-body" role="rowgroup">
              {timeline.map((slot, i) => {
                const displayDate = getDisplayDate(slot.time, tz);
                const prevDisplayDate = i > 0 ? getDisplayDate(timeline[i - 1].time, tz) : null;
                const showDateLabel = i === 0 || !prevDisplayDate
                  || displayDate.getUTCMonth() !== prevDisplayDate.getUTCMonth()
                  || displayDate.getUTCDate() !== prevDisplayDate.getUTCDate();
                const weatherVisual = resolveWeatherVisual(slot, slot.time);
                const wind = slot.wind;
                const visibilityValue = slot.visibility?.value ?? null;
                const ceiling = getCeiling(slot);
                const visibilityStyle = getTintStyle(classifyVisibilityCategory(visibilityValue, icao, minimaSettings).category);
                const ceilingStyle = getTintStyle(classifyCeilingCategory(ceiling, icao, minimaSettings).category);
                const isSpecialWeather = hasSpecialWeather(slot);
                const hasPrecipitation = hasPrecipitationWeather(slot);
                const highWind = hasAlertWind(slot);
                const rotation = (wind?.direction || 0) + 180;
                const windText = `${wind?.speed}${wind?.gust ? `G${wind.gust}` : ""}kt`;
                return (
                  <div key={i} className="taf-mobile-v3-row" role="row">
                    <div className="taf-mobile-v3-cell taf-mobile-v3-cell--time" role="cell">
                      {showDateLabel ? (
                        <span className="taf-mobile-v3-date">{displayDate.getUTCMonth() + 1}/{displayDate.getUTCDate()}</span>
                      ) : null}
                      <span className="taf-mobile-v3-hour">{displayDate.getUTCHours()}시</span>
                    </div>
                    <div
                      className={`taf-mobile-v3-cell taf-mobile-v3-cell--icon${isSpecialWeather ? " taf-mobile-v3-cell--special" : ""}${hasPrecipitation ? " taf-mobile-v3-cell--precip" : ""}`}
                      role="cell"
                    >
                      <WeatherIcon visual={weatherVisual} />
                    </div>
                    <div className={`taf-mobile-v3-cell taf-mobile-v3-cell--wind${highWind ? " taf-mobile-v3-cell--alert" : ""}`} role="cell">
                      <span className="wind-arrow-inline" style={{ transform: `rotate(${rotation}deg)` }}>↑</span>
                      {windText}
                    </div>
                    <div className="taf-mobile-v3-cell taf-mobile-v3-cell--ceil" style={ceilingStyle} role="cell">{formatCeiling(ceiling)}</div>
                    <div className="taf-mobile-v3-cell taf-mobile-v3-cell--vis" style={visibilityStyle} role="cell">{formatVisibilityValue(visibilityValue, slot.display?.visibility)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="taf-new-panel taf-new-panel--grid">
        <div className="taf-legacy-header">
          <span className="taf-new-validity">
            <span className="panel-kind-badge">{tafBadgeText}</span>
            <span>{tafTimeText}</span>
          </span>
          {viewToggle}
        </div>
        <div className="taf-v3-layout">
          <div className="taf-v3-labels" aria-hidden="true">
            <div className="taf-v3-label">시간</div>
            <div className="taf-v3-label">비행조건</div>
            <div className="taf-v3-label">날씨</div>
            <div className="taf-v3-label">바람</div>
            <div className="taf-v3-label">시정</div>
            <div className="taf-v3-label">운고</div>
          </div>
          <div className="taf-v3-grid">
            {displaySlots.map((displaySlot, i) => {
              const date = getDisplayDate(displaySlot.time, tz);
              const previousDate = i > 0 ? getDisplayDate(displaySlots[i - 1].time, tz) : null;
              const shouldShowDate = i === 0 || !previousDate || previousDate.getUTCDate() !== date.getUTCDate();
              return (
                <article key={i} className="taf-v3-card">
                  <div className="taf-v3-data-time">
                    {shouldShowDate && <span className="taf-v3-time-date">{date.getUTCDate()}일</span>}
                    <span className="taf-v3-time-hour">{date.getUTCHours()}시</span>
                  </div>
                  <div className="taf-v3-data-flight">
                    <span
                      className="taf-flight-badge"
                      style={{
                        backgroundColor: FC_COLORS[displaySlot.flightCategory] || FC_COLORS.VFR,
                        color: "#fff",
                      }}
                    >
                      {displaySlot.flightCategory}
                    </span>
                  </div>
                  <div className={`taf-v3-data-weather${displaySlot.isSpecialWeather ? " taf-v3-data-weather--special taf-v3-data-row--alert" : ""}${displaySlot.hasPrecipitation ? " taf-v3-data-weather--precip" : ""}`}>
                    <WeatherIcon visual={displaySlot.miniWeatherVisual} />
                    <span className="taf-v3-data-weather-text">{displaySlot.weatherLabel}</span>
                  </div>
                  <div className={`taf-v3-data-wind${displaySlot.highWind ? " taf-v3-data-wind--alert taf-v3-data-row--alert" : ""}`}>
                    <span className="wind-arrow-inline" style={{ transform: `rotate(${displaySlot.windRotation}deg)` }}>↑</span>
                    <span>{displaySlot.windText}</span>
                  </div>
                  <div className="taf-v3-data-metric" style={displaySlot.visibilityStyle}>
                    <span className="taf-v3-data-value">{displaySlot.visibilityText}</span>
                  </div>
                  <div className="taf-v3-data-metric" style={displaySlot.ceilingStyle}>
                    <span className="taf-v3-data-value">{displaySlot.ceilingText}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  if (mobileLayout) {
    const mobileTimelineSegments = tableSegments.map((segment) => {
      const visibilityValue = segment.displaySlot.visibilityValue ?? null;
      const ceiling = segment.displaySlot.ceiling;
      const flightCategoryMeta = getFlightCategory(visibilityValue, ceiling, icao, minimaSettings);
      const startMs = new Date(segment.start).getTime();
      const endMs = new Date(segment.end).getTime();
      const durationMs = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? endMs - startMs
        : 60 * 60 * 1000;
      return {
        start: segment.start,
        end: segment.end,
        durationMs,
        flightCategoryMeta,
      };
    });
    const totalTimelineDurationMs = mobileTimelineSegments.reduce((sum, item) => sum + item.durationMs, 0) || 1;

    return (
      <section className="taf-new-panel taf-new-panel--mobile-table">
        <div className="taf-legacy-header taf-legacy-header--mobile-table">
          <span className="taf-new-validity">
            <span className="panel-kind-badge">{tafBadgeText}</span>
            <span>{tafTimeText}</span>
          </span>
          {viewToggle}
        </div>
        <div className="taf-mobile-table-layout">
          <div className="taf-mobile-timeline-bar" aria-hidden="true">
            {mobileTimelineSegments.map((segment, i) => {
              const startDate = getDisplayDate(segment.start, tz);
              const prevStartDate = i > 0 ? getDisplayDate(mobileTimelineSegments[i - 1].start, tz) : null;
              const showDateLabel = i === 0 || !prevStartDate
                || startDate.getUTCMonth() !== prevStartDate.getUTCMonth()
                || startDate.getUTCDate() !== prevStartDate.getUTCDate();
              const startLabel = `${startDate.getUTCHours()}시`;
              const color = segment.flightCategoryMeta?.color || FC_COLORS[segment.flightCategoryMeta?.category] || FC_COLORS.VFR;
              return (
                <div key={`timeline-${i}`} className="taf-mobile-timeline-segment" style={{ flex: `${segment.durationMs} 0 0` }}>
                  <span className="taf-mobile-timeline-label">
                    {showDateLabel ? <span className="taf-mobile-timeline-date">{startDate.getUTCMonth() + 1}/{startDate.getUTCDate()}</span> : null}
                    <span className="taf-mobile-timeline-hour">{startLabel}</span>
                  </span>
                  <span className="taf-mobile-timeline-track">
                    <span
                      className="taf-mobile-timeline-fill"
                      style={{
                        height: "100%",
                        backgroundColor: color,
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
          <div className="taf-mobile-table-list">
          {tableSegments.map((segment, i) => {
            const displaySlot = segment.displaySlot;
            const slot = displaySlot.slot;
            const visibilityValue = displaySlot.visibilityValue ?? null;
            const ceiling = displaySlot.ceiling;
            const flightCategoryMeta = getFlightCategory(visibilityValue, ceiling, icao, minimaSettings);
            const flightCategory = flightCategoryMeta.category;
            const visibilityStyle = displaySlot.visibilityStyle;
            const ceilingStyle = displaySlot.ceilingStyle;
            const weatherLabel = displaySlot.weatherLabel;
            const isSpecialWeather = displaySlot.isSpecialWeather;
            const hasPrecipitation = displaySlot.hasPrecipitation;
            const highWind = displaySlot.highWind;

            return (
              <article key={i} className="taf-mobile-card">
                <div className="taf-mobile-card-top">
                  <div className="taf-mobile-card-time">{formatTafRange(segment.start, segment.end, tz)}</div>
                </div>
                <div className="taf-mobile-card-grid">
                  <article
                    className="taf-mobile-card-status taf-mobile-card-status--panel flight-category-panel"
                    style={{ backgroundColor: flightCategoryMeta?.color || FLIGHT_CATEGORY_META[flightCategory]?.color || FC_COLORS[flightCategory] || FC_COLORS.VFR }}
                  >
                    <span className="flight-category-panel-code taf-mobile-card-status-code">{flightCategory}</span>
                    <span className="flight-category-panel-label taf-mobile-card-status-label">{flightCategoryMeta?.labelKo || FLIGHT_CATEGORY_META[flightCategory]?.labelKo || flightCategory}</span>
                  </article>
                  <div className="taf-mobile-card-cell" style={visibilityStyle}>
                    <span className="taf-mobile-card-label">시정</span>
                    <span className="taf-mobile-card-value">{formatVisibilityValue(visibilityValue, slot.display?.visibility)}</span>
                  </div>
                  <div className={`taf-mobile-card-cell taf-mobile-card-cell--wind${highWind ? " taf-mobile-card-cell--alert" : ""}`}>
                    <span className="taf-mobile-card-label">바람</span>
                    <span className="taf-mobile-card-value">{safe(slot.display?.wind)}</span>
                  </div>
                  <div className="taf-mobile-card-cell" style={ceilingStyle}>
                    <span className="taf-mobile-card-label">운고</span>
                    <span className="taf-mobile-card-value">{formatCeiling(ceiling)}</span>
                  </div>
                  <div className={`taf-mobile-card-cell taf-mobile-card-cell--weather${isSpecialWeather ? " taf-mobile-card-cell--special" : ""}${hasPrecipitation ? " taf-mobile-card-cell--precip" : ""}`}>
                    <span className="taf-mobile-card-label">날씨</span>
                    <span className="taf-mobile-card-value">{weatherLabel}</span>
                  </div>
                </div>
              </article>
            );
          })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="taf-new-panel taf-new-panel--table">
      <div className="taf-legacy-header">
        <span className="taf-new-validity">
          <span className="panel-kind-badge">{tafBadgeText}</span>
          <span>{tafTimeText}</span>
        </span>
        {viewToggle}
      </div>
      <div className="table-wrap">
        <table className="taf-compact-table">
          <thead>
            <tr>
              <th>시간 ({tz})</th>
              <th>비행조건</th>
              <th>시정</th>
              <th>운고</th>
              <th>바람</th>
              <th>날씨</th>
            </tr>
          </thead>
          <tbody>
            {tableSegments.map((segment, i) => {
              const displaySlot = segment.displaySlot;
              const level = getSeverityLevel({
                visibility: displaySlot.visibilityValue,
                wind: displaySlot.slot.wind?.speed,
                gust: displaySlot.slot.wind?.gust,
              });

              return (
                <tr key={i} className={`row-${level}`}>
                  <td>{formatTafRange(segment.start, segment.end, tz)}</td>
                  <td className="taf-compact-table-cell taf-compact-table-cell--flight">
                    <span
                      className="taf-flight-badge"
                      style={{
                        backgroundColor: FC_COLORS[displaySlot.flightCategory] || FC_COLORS.VFR,
                        color: "#fff",
                      }}
                    >
                      {displaySlot.flightCategory}
                    </span>
                  </td>
                  <td className="taf-compact-table-cell" style={displaySlot.visibilityStyle}>
                    {displaySlot.visibilityText}
                  </td>
                  <td className="taf-compact-table-cell" style={displaySlot.ceilingStyle}>
                    {displaySlot.ceilingText}
                  </td>
                  <td className="taf-table-center">
                    <span className={`taf-wind-cell${displaySlot.highWind ? " taf-wind-cell--alert" : ""}`}>
                      <span className="wind-arrow-inline" style={{ transform: `rotate(${displaySlot.windRotation}deg)` }}>↑</span>
                      <span>{safe(displaySlot.slot.display?.wind)}</span>
                    </span>
                  </td>
                  <td className="taf-table-center">
                    <span className={`taf-weather-cell${displaySlot.isSpecialWeather ? " taf-weather-cell--special" : ""}${displaySlot.hasPrecipitation ? " taf-weather-cell--precip" : ""}`}>
                      <WeatherIcon visual={displaySlot.weatherVisual} className="mini" />
                      <span>{displaySlot.weatherLabel}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
