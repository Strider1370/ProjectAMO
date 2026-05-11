import React from "react";
import { getWeatherIconSrc } from "../utils/weather-icon-registry";
import { resolveLegacyWeatherVisual } from "../utils/weather-visual-resolver";

const OVERLAY_TEXT = {
  light: "-",
  heavy: "+",
  vicinity: "VC"
};

export default function WeatherIcon({
  visual = null,
  iconId = null,
  intensityOverlay = null,
  iconKey = null,
  className = "",
  alt = ""
}) {
  const resolvedVisual = visual || (iconId
    ? { iconId, intensityOverlay }
    : resolveLegacyWeatherVisual(iconKey));
  const resolvedIconId = resolvedVisual?.iconId || "unknown";
  const overlay = resolvedVisual?.intensityOverlay || null;
  const src = getWeatherIconSrc(resolvedIconId);
  const badgeText = OVERLAY_TEXT[overlay] || null;
  const label = alt || resolvedIconId;

  return (
    <span className={`weather-icon-wrapper ${className}`.trim()} title={resolvedIconId}>
      <img src={src} alt={label} loading="lazy" />
      {badgeText ? (
        <span className={`weather-icon-overlay weather-icon-overlay--${overlay}`} aria-hidden="true">
          {badgeText}
        </span>
      ) : null}
    </span>
  );
}

export function WindBarb({ barbKey, rotation, className = "" }) {
  return (
    <div
      className={`wind-barb-wrapper ${className}`}
      style={{
        display: "inline-block",
        transform: `rotate(${rotation}deg)`,
        fontSize: "1.5rem"
      }}
      title={`${barbKey} at ${rotation}째`}
    >
      ↑
    </div>
  );
}
