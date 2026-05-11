function isDaytime(isoString) {
  if (!isoString) return true;
  const hour = new Date(isoString).getUTCHours() + 9;
  const kstHour = hour % 24;
  return kstHour >= 6 && kstHour < 18;
}

function resolveWeatherIconKey(weather) {
  const knownIconKeys = new Set([
    "RA", "DZ", "SN", "SG", "IC", "PL", "GR", "GS", "UP",
    "SHRA", "SHSN", "SHGR", "SHGS", "SHRASN", "SH",
    "TS", "TSRA", "TSSN", "TSGR", "TSGS", "TSRASN", "TSSNGR",
    "FZRA", "FZDZ", "FZFG",
    "BLSN", "BLSA", "BLDU", "DRSN", "DRSA", "DRDU",
    "FG", "MIFG", "BCFG", "PRFG", "BR", "HZ", "FU", "VA", "DU", "SA",
    "PO", "SQ", "FC", "SS", "DS",
    "CAVOK", "NSW"
  ]);

  if (!weather) return "UNKNOWN";

  if (weather.descriptor) {
    const joined = `${weather.descriptor}${(weather.phenomena || []).join("")}`;
    if (joined && knownIconKeys.has(joined)) return joined;
    if (knownIconKeys.has(weather.descriptor)) return weather.descriptor;
  }

  if (Array.isArray(weather.phenomena) && weather.phenomena.length > 0) {
    const first = weather.phenomena[0];
    if (knownIconKeys.has(first)) return first;
  }

  return "UNKNOWN";
}

function iconRank(iconKey) {
  if (iconKey.startsWith("TS")) return 1;
  if (iconKey.startsWith("FZ")) return 2;
  if (iconKey.startsWith("SH")) return 3;
  if (["RA", "SN", "PL", "GR", "GS", "DZ", "SG", "IC", "UP"].includes(iconKey)) return 4;
  if (["FG", "BR", "HZ", "FU", "VA", "DU", "SA", "MIFG", "BCFG", "PRFG"].includes(iconKey)) return 5;
  return 6;
}

function pickRepresentativeWeather(weatherList) {
  if (!Array.isArray(weatherList) || weatherList.length === 0) return null;

  return weatherList
    .map((weather) => ({ ...weather, resolved_icon_key: weather.icon_key || resolveWeatherIconKey(weather) }))
    .sort((a, b) => iconRank(a.resolved_icon_key) - iconRank(b.resolved_icon_key))[0];
}

function toIntensityOverlay(intensity) {
  switch (String(intensity || "").toUpperCase()) {
    case "LIGHT":
      return "light";
    case "HEAVY":
      return "heavy";
    case "VICINITY":
      return "vicinity";
    default:
      return null;
  }
}

function mapWeatherCodeToIconId(iconKey, day) {
  const suffix = day ? "day" : "night";

  if (!iconKey || iconKey === "UNKNOWN" || iconKey === "NSW") return null;
  if (iconKey === "CAVOK") return `clear-${suffix}`;

  if (iconKey.startsWith("TS")) {
    if (iconKey.includes("SN")) return "thunderstorms-snow";
    if (iconKey.includes("RA") || iconKey.includes("DZ")) return "thunderstorms-rain";
    return `thunderstorm-${suffix}`;
  }
  if (iconKey === "FZFG") return "fog";
  if (iconKey.startsWith("FZ")) return "freezing-rain";
  if (iconKey.startsWith("SH")) {
    if (iconKey.includes("SN")) return "snow";
    if (iconKey.includes("GR") || iconKey.includes("GS")) return "hail";
    return "rain";
  }

  if (["RA", "DZ", "UP"].includes(iconKey)) return "rain";
  if (["SN", "SG", "IC", "PL"].includes(iconKey)) return "snow";
  if (["GR", "GS"].includes(iconKey)) return "hail";
  if (["FG", "MIFG", "BCFG", "PRFG"].includes(iconKey)) return "fog";
  if (iconKey === "BR") return "mist";
  if (["HZ", "FU", "DU", "SA", "VA"].includes(iconKey)) return "haze";
  if (["PO", "SQ", "FC", "SS", "DS", "BLSN", "BLSA", "BLDU", "DRSN", "DRSA", "DRDU"].includes(iconKey)) {
    return "severe-wind";
  }

  return null;
}

function mapCloudsToIconId(clouds, day) {
  if (!Array.isArray(clouds) || clouds.length === 0) return null;

  const cloudPriority = { OVC: 5, BKN: 4, SCT: 3, FEW: 2, SKC: 1, CLR: 1 };
  const topLayer = clouds.reduce((prev, curr) => (
    (cloudPriority[curr.amount] || 0) > (cloudPriority[prev.amount] || 0) ? curr : prev
  ));

  switch (topLayer?.amount) {
    case "FEW":
      return `clear-${day ? "day" : "night"}`;
    case "SCT":
      return `scattered-clouds-${day ? "day" : "night"}`;
    case "BKN":
      return "broken-clouds";
    case "OVC":
      return "overcast";
    case "SKC":
    case "CLR":
      return `clear-${day ? "day" : "night"}`;
    default:
      return null;
  }
}

function mapDisplayCloudsToIconId(displayClouds, day) {
  const normalized = String(displayClouds || "").toUpperCase().trim();

  if (!normalized) return null;
  if (normalized === "NSC" || normalized === "NCD" || normalized === "SKC" || normalized === "CLR") {
    return `clear-${day ? "day" : "night"}`;
  }
  if (normalized.includes("OVC")) return "overcast";
  if (normalized.includes("BKN")) return "broken-clouds";
  if (normalized.includes("SCT")) return `scattered-clouds-${day ? "day" : "night"}`;
  if (normalized.includes("FEW")) return `clear-${day ? "day" : "night"}`;

  return null;
}

export function resolveWeatherVisual(data, time) {
  const day = isDaytime(time);
  const representativeWeather = pickRepresentativeWeather(data?.weather || []);
  const explicitIcon = data?.display?.weather_icon;
  const explicitId = mapWeatherCodeToIconId(explicitIcon, day);

  if (explicitId) {
    return {
      iconId: explicitId,
      intensityOverlay: toIntensityOverlay(representativeWeather?.intensity || data?.display?.weather_intensity),
      source: "weather",
      code: explicitIcon,
      isDay: day
    };
  }

  if (representativeWeather) {
    const iconId = mapWeatherCodeToIconId(representativeWeather.resolved_icon_key, day);
    if (iconId) {
      return {
        iconId,
        intensityOverlay: toIntensityOverlay(representativeWeather.intensity),
        source: "weather",
        code: representativeWeather.resolved_icon_key,
        isDay: day
      };
    }
  }

  const cloudId = mapCloudsToIconId(data?.clouds || [], day);
  if (cloudId) {
    return {
      iconId: cloudId,
      intensityOverlay: null,
      source: "clouds",
      code: null,
      isDay: day
    };
  }

  const displayCloudId = mapDisplayCloudsToIconId(data?.display?.clouds, day);
  if (displayCloudId) {
    return {
      iconId: displayCloudId,
      intensityOverlay: null,
      source: "display-clouds",
      code: data?.display?.clouds || null,
      isDay: day
    };
  }

  if (data?.cavok) {
    return {
      iconId: `clear-${day ? "day" : "night"}`,
      intensityOverlay: null,
      source: "cavok",
      code: "CAVOK",
      isDay: day
    };
  }

  return {
    iconId: "unknown",
    intensityOverlay: null,
    source: "fallback",
    code: null,
    isDay: day
  };
}

export function resolveLegacyWeatherVisual(iconKey) {
  if (!iconKey) {
    return { iconId: "unknown", intensityOverlay: null };
  }

  const normalized = String(iconKey).replace(/^wx_/, "");
  const parts = normalized.split("_");
  const code = parts[0];
  const day = parts[1] !== "N";

  return {
    iconId: mapWeatherCodeToIconId(code, day) || "unknown",
    intensityOverlay: null,
    source: "legacy",
    code,
    isDay: day
  };
}
