export function safe(value, fallback = '-') {
  return value == null || value === '' ? fallback : value;
}

export function getDisplayDate(isoString, tz) {
  const base = new Date(isoString);
  if (tz === 'KST') return new Date(base.getTime() + 9 * 60 * 60 * 1000);
  return base;
}

export function formatUtc(value, tz = 'UTC') {
  if (!value) return '-';
  if (tz === 'KST') {
    const d = getDisplayDate(value, 'KST');
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} KST`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return String(value).replace('T', ' ').replace(/:\d{2}(?:\.\d+)?Z$/, ' UTC').replace('Z', ' UTC');
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function getSeverityLevel({ visibility, wind, gust }) {
  if (visibility != null && visibility < 800) return 'danger';
  if (gust != null && gust >= 35) return 'danger';
  if (wind != null && wind >= 25) return 'danger';
  if (visibility != null && visibility < 1500) return 'warn';
  if (gust != null && gust >= 25) return 'warn';
  if (wind != null && wind >= 15) return 'warn';
  return 'ok';
}

const PRECIPITATION_WEATHER_TOKENS = ['RA', 'SN', 'DZ', 'SG', 'PL', 'GR', 'GS', 'UP', 'SH', 'IC'];

export function hasPrecipitationWeather(source) {
  const raw = String(source?.display?.weather || source || '').toUpperCase();
  if (!raw || raw === 'NSW') return false;
  return PRECIPITATION_WEATHER_TOKENS.some((token) => raw.includes(token));
}

export function hasHighWindCondition(wind, speedThreshold = 25, gustThreshold = 35) {
  if (!wind || wind.calm) return false;
  const speed = Number.isFinite(wind.speed) ? wind.speed : null;
  const gust = Number.isFinite(wind.gust) ? wind.gust : null;
  return (speed != null && speed >= speedThreshold) || (gust != null && gust >= gustThreshold);
}

export function pickRunwayDirection(runwayHdg, windDir) {
  if (!Number.isFinite(runwayHdg)) return null;
  if (!Number.isFinite(windDir)) return runwayHdg;
  const optionA = runwayHdg;
  const optionB = (runwayHdg + 180) % 360;
  const diffA = Math.abs(((windDir - optionA + 180 + 360) % 360) - 180);
  const diffB = Math.abs(((windDir - optionB + 180 + 360) % 360) - 180);
  return diffA <= diffB ? optionA : optionB;
}

export function getCrosswindComponentKt(wind, runwayHdg) {
  if (!wind || wind.calm) return 0;
  if (!Number.isFinite(wind.speed) || !Number.isFinite(wind.direction) || !Number.isFinite(runwayHdg)) {
    return null;
  }
  const selectedRunwayHdg = pickRunwayDirection(runwayHdg, wind.direction);
  const relative = ((wind.direction - selectedRunwayHdg + 540) % 360) - 180;
  return Math.abs(wind.speed * Math.sin((relative * Math.PI) / 180));
}

export function computeRelativeHumidity(tempC, dewpointC) {
  if (!Number.isFinite(tempC) || !Number.isFinite(dewpointC)) return null;
  const es = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
  const e = 6.112 * Math.exp((17.67 * dewpointC) / (dewpointC + 243.5));
  const rh = (e / es) * 100;
  if (!Number.isFinite(rh)) return null;
  return Math.max(0, Math.min(100, rh));
}

function estimateWetBulbStull(tempC, rh) {
  const t1 = tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659));
  const t2 = Math.atan(tempC + rh);
  const t3 = Math.atan(rh - 1.67633);
  const t4 = 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh);
  return t1 + t2 - t3 + t4 - 4.686035;
}

function toKstDate(value) {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

export function computeFeelsLikeC({ tempC, dewpointC, windKt, observedAt }) {
  if (!Number.isFinite(tempC)) return { value: null, season: null };
  const kst = toKstDate(observedAt);
  if (!kst) return { value: null, season: null };
  const month = kst.getUTCMonth() + 1;
  const isSummer = month >= 5 && month <= 9;
  if (isSummer) {
    const rh = computeRelativeHumidity(tempC, dewpointC);
    if (!Number.isFinite(rh)) return { value: null, season: 'summer' };
    const tw = estimateWetBulbStull(tempC, rh);
    const value = -0.2442 + 0.55399 * tw + 0.45535 * tempC - 0.0022 * tw * tw + 0.00278 * tw * tempC + 3.0;
    return { value: Number.isFinite(value) ? value : null, season: 'summer' };
  }
  const windKmh = Number.isFinite(windKt) ? windKt * 1.852 : null;
  const windMs = Number.isFinite(windKmh) ? windKmh / 3.6 : null;
  if (!(tempC <= 10 && Number.isFinite(windMs) && windMs >= 1.3 && Number.isFinite(windKmh))) {
    return { value: null, season: 'winter' };
  }
  const v16 = Math.pow(windKmh, 0.16);
  const value = 13.12 + 0.6215 * tempC - 11.37 * v16 + 0.3965 * v16 * tempC;
  return { value: Number.isFinite(value) ? value : null, season: 'winter' };
}

export const FLIGHT_CATEGORY_META = {
  VFR: {
    category: 'VFR',
    color: '#15803d',
    labelKo: '시계비행규칙',
    bg: '#f0fdf4',
    border: '#15803d',
    borderSoft: '#bbf7d0',
    valueColor: '#166534',
  },
  MVFR: {
    category: 'MVFR',
    color: '#2563eb',
    labelKo: '한계시계비행규칙',
    bg: '#eff6ff',
    border: '#2563eb',
    borderSoft: '#bfdbfe',
    valueColor: '#1d4ed8',
  },
  IFR: {
    category: 'IFR',
    color: '#f59e0b',
    labelKo: '계기비행규칙',
    bg: '#fffbeb',
    border: '#f59e0b',
    borderSoft: '#fde68a',
    valueColor: '#b45309',
  },
  LIFR: {
    category: 'LIFR',
    color: '#dc2626',
    labelKo: '최저기상제한치 미만',
    bg: '#fef2f2',
    border: '#dc2626',
    borderSoft: '#fecaca',
    valueColor: '#b91c1c',
  },
};

export const DEFAULT_AIRPORT_MINIMA_RULES = {
  RKSI: { visibilityM: 175, ceilingFt: null },
  RKSS: { visibilityM: 175, ceilingFt: null },
  RKPC: { visibilityM: 300, ceilingFt: 100 },
  RKPK: { visibilityM: 300, ceilingFt: 100 },
  RKJY: { visibilityM: 550, ceilingFt: 200 },
  RKJB: { visibilityM: 550, ceilingFt: 200 },
  RKPU: { visibilityM: 550, ceilingFt: 200 },
  RKNY: { visibilityM: 550, ceilingFt: 200 },
};

function getAirportMinimaRule(icao, minimaSettings = null) {
  const rules = minimaSettings || DEFAULT_AIRPORT_MINIMA_RULES;
  return rules[String(icao || '').toUpperCase()] || null;
}

function getFlightCategoryMeta(category) {
  return FLIGHT_CATEGORY_META[category] || FLIGHT_CATEGORY_META.VFR;
}

export function classifyVisibilityCategory(visibilityM, icao = null, minimaSettings = null) {
  const vis = Number.isFinite(visibilityM) ? visibilityM : 99999;
  const minima = getAirportMinimaRule(icao, minimaSettings);
  if (minima && Number.isFinite(minima.visibilityM) && vis < minima.visibilityM) {
    return getFlightCategoryMeta('LIFR');
  }
  if (vis < 5000) return getFlightCategoryMeta('IFR');
  return getFlightCategoryMeta('VFR');
}

export function classifyCeilingCategory(ceilingFt, icao = null, minimaSettings = null) {
  const ceil = Number.isFinite(ceilingFt) ? ceilingFt : 99999;
  const minima = getAirportMinimaRule(icao, minimaSettings);
  if (minima && Number.isFinite(minima.ceilingFt) && ceil < minima.ceilingFt) {
    return getFlightCategoryMeta('LIFR');
  }
  if (ceil < 1500) return getFlightCategoryMeta('IFR');
  return getFlightCategoryMeta('VFR');
}

export function getFlightCategory(visibilityM, ceilingFt, icao = null, minimaSettings = null) {
  const vis = Number.isFinite(visibilityM) ? visibilityM : 99999;
  const ceil = Number.isFinite(ceilingFt) ? ceilingFt : 99999;
  const minima = getAirportMinimaRule(icao, minimaSettings);
  if (minima) {
    const visibilityBelowMinima = Number.isFinite(minima.visibilityM) && vis < minima.visibilityM;
    const ceilingBelowMinima = Number.isFinite(minima.ceilingFt) && ceil < minima.ceilingFt;
    if (visibilityBelowMinima || ceilingBelowMinima) return FLIGHT_CATEGORY_META.LIFR;
  }
  if (vis < 5000 || ceil < 1500) return FLIGHT_CATEGORY_META.IFR;
  return FLIGHT_CATEGORY_META.VFR;
}

export function pickCrosswindArrow(wind, runwayHdg) {
  if (!wind || wind.calm) return '↑';
  if (!Number.isFinite(wind.speed) || !Number.isFinite(wind.direction) || !Number.isFinite(runwayHdg)) return '↑';
  const selectedRunwayHdg = pickRunwayDirection(runwayHdg, wind.direction);
  const relative = ((wind.direction - selectedRunwayHdg + 540) % 360) - 180;
  const crosswindComponent = wind.speed * Math.sin((relative * Math.PI) / 180);
  if (crosswindComponent > 0) return '←';
  if (crosswindComponent < 0) return '→';
  return '↑';
}

export function getCrosswindSide(wind, runwayHdg) {
  if (!wind || wind.calm) return '';
  if (!Number.isFinite(wind.speed) || !Number.isFinite(wind.direction) || !Number.isFinite(runwayHdg)) return '';
  const selectedRunwayHdg = pickRunwayDirection(runwayHdg, wind.direction);
  const relative = ((wind.direction - selectedRunwayHdg + 540) % 360) - 180;
  const crosswindComponent = wind.speed * Math.sin((relative * Math.PI) / 180);
  if (crosswindComponent > 0) return 'R';
  if (crosswindComponent < 0) return 'L';
  return '';
}
