// 순서: 뇌우 → 난류 → 착빙 → 바람/시정 → 산악 → 특수
export const SIGMET_FILTER_GROUPS = {
  thunderstorm:     ["TS", "EMBD_TS", "OBSC_TS", "FRQ_TS", "SQL_TS", "CB"],
  turbulence:       ["SEV_TURB", "MOD_TURB", "MTW"],
  icing:            ["SEV_ICE", "MOD_ICE"],
  hail:             ["GR"],
  tropical_cyclone: ["TC"],
  volcanic_ash:     ["VA"],
  duststorm:        ["HVY_DS", "HVY_SS"],
};

// 순서: 난류 → 착빙 → 바람/시정 → 윈드시어 → 산악
export const AIRMET_FILTER_GROUPS = {
  turbulence:           ["MOD_TURB"],
  icing:                ["MOD_ICE"],
  sfc_wind:             ["SFC_WIND"],
  sfc_vis:              ["SFC_VIS", "IFR"],
  llws:                 ["LLWS"],
  mountain_obscuration: ["MT_OBSC"],
};

// 순서: 뇌우/CB → 난류 → 착빙 → 바람/시정 → 산악 → 기상계(기압/전선/제트)
export const SIGWX_FILTER_GROUPS = {
  cloud:                ["cld"],
  turbulence:           ["ktg"],
  icing_area:           ["icing_area"],
  freezing_level:       ["freezing_level"],
  sfc_wind:             ["sfc_wind"],
  sfc_vis:              ["sfc_vis"],
  mountain_obscuration: ["mountain_obscu"],
  pressure:             ["pressure"],
  front_line:           ["font_line"],
  jet_stream:           ["z_stream"],
};

const SIGMET_CODE_TO_KEY = {};
for (const [key, codes] of Object.entries(SIGMET_FILTER_GROUPS)) {
  for (const code of codes) SIGMET_CODE_TO_KEY[code] = key;
}

const AIRMET_CODE_TO_KEY = {};
for (const [key, codes] of Object.entries(AIRMET_FILTER_GROUPS)) {
  for (const code of codes) AIRMET_CODE_TO_KEY[code] = key;
}

const SIGWX_CONTOUR_TO_KEY = {};
for (const [key, contours] of Object.entries(SIGWX_FILTER_GROUPS)) {
  for (const c of contours) SIGWX_CONTOUR_TO_KEY[c] = key;
}

export function getSigmetFilterKey(phenomenonCode) {
  return SIGMET_CODE_TO_KEY[phenomenonCode] || null;
}

export function getAirmetFilterKey(phenomenonCode) {
  return AIRMET_CODE_TO_KEY[phenomenonCode] || null;
}

export function getSigwxFilterKey(contourName) {
  return SIGWX_CONTOUR_TO_KEY[String(contourName || "").toLowerCase()] || null;
}

export function getDefaultAdvisoryFilterSettings() {
  return {
    sigmet: Object.fromEntries(Object.keys(SIGMET_FILTER_GROUPS).map((k) => [k, true])),
    airmet: Object.fromEntries(Object.keys(AIRMET_FILTER_GROUPS).map((k) => [k, true])),
    sigwx:  Object.fromEntries(Object.keys(SIGWX_FILTER_GROUPS).map((k) => [k, true])),
  };
}

export function loadAdvisoryFilterSettings() {
  try {
    const raw = localStorage.getItem("advisory_filter_settings");
    if (!raw) return getDefaultAdvisoryFilterSettings();
    const parsed = JSON.parse(raw);
    const defaults = getDefaultAdvisoryFilterSettings();
    return {
      sigmet: { ...defaults.sigmet, ...(parsed.sigmet || {}) },
      airmet: { ...defaults.airmet, ...(parsed.airmet || {}) },
      sigwx:  { ...defaults.sigwx,  ...(parsed.sigwx  || {}) },
    };
  } catch {
    return getDefaultAdvisoryFilterSettings();
  }
}

export function saveAdvisoryFilterSettings(settings) {
  localStorage.setItem("advisory_filter_settings", JSON.stringify(settings));
}
