import https from 'https'
import config from '../config.js'
import store from '../store.js'
import { latLonToGrid } from '../utils/kma-grid.js'
import apiHubUsage from '../api-hub-usage.js'

const VILLAGE_BASE_TIMES = [2, 5, 8, 11, 14, 17, 20, 23] // 동네예보 발표시각 (KST)
const VILLAGE_PUBLISH_DELAY_MIN = 15 // 발표 후 제공까지 버퍼
// 기상청 동네예보는 1시간 단위로 온다. 원본 해상도 그대로 담는다.
// 3시간 간격이 필요한 화면은 받는 쪽에서 솎아 쓴다(GroundHourlyStrip).
// 2안·3안 사이니지가 3일치 예보를 그린다. 단기예보는 원래 3일을 주는데 24칸에서 잘라 쓰고 있었다.
const HOURLY_SLOT_COUNT = 72
const HOURLY_STEP_HOURS = 1

const DAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function getKstShiftedDate(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function formatKstDate(value = Date.now()) {
  const kst = getKstShiftedDate(value);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatCompactKstDate(value = Date.now()) {
  const kst = getKstShiftedDate(value);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}`;
}

function addKstDays(dateString, days) {
  const base = new Date(`${dateString}T00:00:00Z`);
  return formatKstDate(base.getTime() + days * 24 * 60 * 60 * 1000 - 9 * 60 * 60 * 1000);
}

function getDayLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return DAY_LABELS_KO[date.getUTCDay()] || "";
}

function createEmptyDay(dateString, todayString) {
  return {
    date: dateString,
    dayOfWeek: getDayLabel(dateString),
    isToday: dateString === todayString,
    am: null,
    pm: null,
    tempMin: null,
    tempMax: null,
    source: null,
  };
}

function createInitialForecastWindow(todayString) {
  return Array.from({ length: 7 }, (_, index) => createEmptyDay(addKstDays(todayString, index), todayString));
}

function safeNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildJsonUrl(endpoint, params) {
  const searchParams = new URLSearchParams({
    pageNo: "1",
    dataType: "JSON",
    authKey: config.api.auth_key,
    ...params,
  });
  return `${config.api.base_url}${endpoint}?${searchParams.toString()}`;
}

async function fetchJson(url, timeoutMs = config.ground_forecast.timeout_ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      const response = await fetch(url, { signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
      return JSON.parse(body);
    } catch (error) {
      if (error?.cause?.code !== "SELF_SIGNED_CERT_IN_CHAIN") {
        throw error;
      }
      return await fetchJsonViaHttpsRequest(url, timeoutMs);
    }
  } finally {
    clearTimeout(timer);
  }
}

function fetchJsonViaHttpsRequest(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    apiHubUsage.assertAllowed(config.api.auth_key)
    const request = https.request(url, {
      method: "GET",
      rejectUnauthorized: false,
      headers: {
        "User-Agent": "KMA-Weather-Dashboard/1.0"
      }
    }, (response) => {
      const chunks = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        chunks.push(chunk);
      });
      response.on("end", async () => {
        const body = chunks.join('');
        try {
          await apiHubUsage.record(config.api.auth_key, { bytes: Buffer.byteLength(body), status: response.statusCode || 500, endpoint: 'ground_forecast' });
        } catch (error) {
          reject(error);
          return;
        }
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });
    request.end();
  });
}

function getResponseItems(payload) {
  const candidates = [
    payload?.response?.body?.items?.item,
    payload?.response?.body?.items,
    payload?.response?.items?.item,
    payload?.response?.items,
    payload?.body?.items?.item,
    payload?.body?.items,
    payload?.items?.item,
    payload?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") return [candidate];
  }

  return [];
}

function mapShortNumEfToPeriod(announceTime, numEf) {
  const hour = Number(String(announceTime || "").slice(8, 10));
  if (!Number.isFinite(hour)) return null;

  let dayOffset;
  let period;

  if (hour === 5) {
    dayOffset = Math.floor(numEf / 2);
    period = numEf % 2 === 0 ? "am" : "pm";
  } else if (hour === 11 || hour === 17) {
    const adjusted = numEf + 1;
    dayOffset = Math.floor(adjusted / 2);
    period = numEf % 2 === 0 ? "pm" : "am";
  } else if (hour === 23) {
    dayOffset = Math.floor(numEf / 2) + 1;
    period = numEf % 2 === 0 ? "am" : "pm";
  } else {
    return null;
  }

  return { dayOffset, period, announceHour: hour };
}

function mapWeatherToIcon(weatherText, weatherCode = null, rainType = null) {
  if (weatherCode) {
    const baseIcon = {
      DB01: "sunny",
      DB02: "partly_cloudy",
      DB03: "mostly_cloudy",
      DB04: "cloudy",
    }[weatherCode] || "cloudy";

    if (rainType === 1) return "rain";
    if (rainType === 2) return "sleet";
    if (rainType === 3) return "snow";
    return baseIcon;
  }

  const text = String(weatherText || "");
  if (text.includes("비/눈") || text.includes("눈/비")) return "sleet";
  if (text.includes("소나기")) return "shower";
  if (text.includes("눈")) return "snow";
  if (text.includes("비")) return "rain";
  if (text.includes("흐림") || text.includes("흐리고")) return "cloudy";
  if (text.includes("구름많")) return "mostly_cloudy";
  if (text.includes("구름조금")) return "partly_cloudy";
  if (text.includes("맑음")) return "sunny";
  return "cloudy";
}

function skyPtyToIcon(sky, pty) {
  const ptyCode = Number(pty)
  if (ptyCode === 1) return "rain"
  if (ptyCode === 2) return "sleet"
  if (ptyCode === 3) return "snow"
  if (ptyCode === 4) return "shower"
  const skyCode = Number(sky)
  if (skyCode === 1) return "sunny"
  if (skyCode === 3) return "mostly_cloudy"
  if (skyCode === 4) return "cloudy"
  return "cloudy"
}

// 현재 시각 기준 가장 최근 동네예보 발표(base_date/base_time)를 KST로 산출.
function getLatestVillageBase(now = new Date()) {
  const kst = getKstShiftedDate(now);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  let base = null;
  for (let i = VILLAGE_BASE_TIMES.length - 1; i >= 0; i -= 1) {
    const hour = VILLAGE_BASE_TIMES[i];
    if (minutes >= hour * 60 + VILLAGE_PUBLISH_DELAY_MIN) {
      base = { date: formatKstDate(now), hour };
      break;
    }
  }
  if (!base) {
    // 02:15 이전 → 전날 23시 발표
    const yesterday = addKstDays(formatKstDate(now), -1);
    base = { date: yesterday, hour: 23 };
  }
  return { baseDate: base.date.replace(/-/g, ""), baseTime: `${String(base.hour).padStart(2, "0")}00` };
}

// 동네예보 item 목록 → 향후 24h를 3시간 간격 8슬롯으로 추출.
function extractHourlySlots(items, now = new Date()) {
  const byTime = new Map();
  for (const item of items) {
    const key = `${item?.fcstDate}${item?.fcstTime}`;
    if (!byTime.has(key)) {
      byTime.set(key, { fcstDate: String(item?.fcstDate || ""), fcstTime: String(item?.fcstTime || "") });
    }
    byTime.get(key)[item?.category] = item?.fcstValue;
  }

  const nowKst = getKstShiftedDate(now).getTime();
  const slots = [...byTime.values()]
    .map((entry) => {
      const y = Number(entry.fcstDate.slice(0, 4));
      const m = Number(entry.fcstDate.slice(4, 6));
      const d = Number(entry.fcstDate.slice(6, 8));
      const hh = Number(entry.fcstTime.slice(0, 2));
      const ts = Date.UTC(y, m - 1, d, hh, 0, 0); // KST-shifted timeline과 직접 비교
      return { ...entry, hour: hh, ts };
    })
    .filter((entry) => Number.isFinite(entry.ts) && entry.hour % HOURLY_STEP_HOURS === 0 && entry.ts >= nowKst - 60 * 60 * 1000)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, HOURLY_SLOT_COUNT)
    .map((entry) => ({
      date: entry.fcstDate,
      time: entry.fcstTime,
      temp: safeNumber(entry.TMP),
      rainProb: safeNumber(entry.POP),
      icon: skyPtyToIcon(entry.SKY, entry.PTY),
    }));

  return slots;
}

function createShortPeriod(item) {
  const weather = String(item?.wf || "").trim();
  if (!weather) return null;
  const weatherCode = String(item?.wfCd || "").trim() || null;
  const rainProb = safeNumber(item?.rnSt);
  const rainType = safeNumber(item?.rnYn);
  return {
    weather,
    weatherCode,
    rainProb,
    icon: mapWeatherToIcon(weather, weatherCode, rainType),
  };
}

function getLatestMidTmfc(now = new Date()) {
  const kst = getKstShiftedDate(now);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const base06 = new Date(Date.UTC(y, m, d, 6, 0, 0));
  const base18 = new Date(Date.UTC(y, m, d, 18, 0, 0));
  const nowMs = kst.getTime();
  const sixThirty = base06.getTime() + 30 * 60 * 1000;
  const eighteenThirty = base18.getTime() + 30 * 60 * 1000;
  let target;

  if (nowMs >= eighteenThirty) {
    target = base18;
  } else if (nowMs >= sixThirty) {
    target = base06;
  } else {
    target = new Date(base18.getTime() - 24 * 60 * 60 * 1000);
  }

  return formatCompactKstDate(target.getTime() - 9 * 60 * 60 * 1000);
}

function buildRequestCaches() {
  return {
    short: new Map(),
    village: new Map(),
    midLand: new Map(),
    midTemp: new Map(),
  };
}

function getOrCreateRequest(cache, key, factory) {
  if (!cache.has(key)) {
    cache.set(key, factory());
  }
  return cache.get(key);
}

async function fetchShortForecast(regId, requestCaches) {
  return getOrCreateRequest(requestCaches.short, regId, async () => {
    const url = buildJsonUrl(config.ground_forecast.short_endpoint, {
      numOfRows: "50",
      regId,
    });
    const payload = await fetchJson(url);
    const items = getResponseItems(payload);
    if (items.length === 0) {
      throw new Error(`No short forecast items for regId ${regId}`);
    }
    return items;
  });
}

async function fetchVillageForecast(nx, ny, requestCaches, base) {
  const key = `${nx}:${ny}`;
  return getOrCreateRequest(requestCaches.village, key, async () => {
    const url = buildJsonUrl(config.ground_forecast.village_endpoint, {
      numOfRows: "300",
      base_date: base.baseDate,
      base_time: base.baseTime,
      nx: String(nx),
      ny: String(ny),
    });
    const payload = await fetchJson(url);
    const items = getResponseItems(payload);
    if (items.length === 0) {
      throw new Error(`No village forecast items for nx ${nx} ny ${ny}`);
    }
    return items;
  });
}

async function fetchMidLandForecast(regId, tmFc, requestCaches) {
  const key = `${regId}:${tmFc}`;
  return getOrCreateRequest(requestCaches.midLand, key, async () => {
    const url = buildJsonUrl(config.ground_forecast.mid_land_endpoint, {
      numOfRows: "10",
      regId,
      tmFc,
    });
    const payload = await fetchJson(url);
    const items = getResponseItems(payload);
    if (items.length === 0) {
      throw new Error(`No mid land forecast items for regId ${regId} tmFc ${tmFc}`);
    }
    return items[0];
  });
}

async function fetchMidTempForecast(regId, tmFc, requestCaches) {
  const key = `${regId}:${tmFc}`;
  return getOrCreateRequest(requestCaches.midTemp, key, async () => {
    const url = buildJsonUrl(config.ground_forecast.mid_temp_endpoint, {
      numOfRows: "10",
      regId,
      tmFc,
    });
    const payload = await fetchJson(url);
    const items = getResponseItems(payload);
    if (items.length === 0) {
      throw new Error(`No mid temp forecast items for regId ${regId} tmFc ${tmFc}`);
    }
    return items[0];
  });
}

function applyShortForecast(days, shortItems, todayString) {
  const announceTime = String(shortItems[0]?.announceTime || "");

  for (const item of shortItems) {
    const numEf = safeNumber(item?.numEf);
    if (!Number.isFinite(numEf)) continue;
    const mapped = mapShortNumEfToPeriod(announceTime, numEf);
    if (!mapped) continue;

    const dateString = addKstDays(todayString, mapped.dayOffset);
    const day = days.find((entry) => entry.date === dateString);
    if (!day) continue;

    const period = createShortPeriod(item);
    if (period) {
      day[mapped.period] = period;
      day.source = day.source || "short";
    }

    const temperature = safeNumber(item?.ta);
    if (temperature != null) {
      if (mapped.period === "am") day.tempMin = temperature;
      if (mapped.period === "pm") day.tempMax = temperature;
    }
  }

  return announceTime || null;
}

function applyMidForecast(days, midLandItem, midTempItem, todayString) {
  for (let offset = 4; offset <= 6; offset += 1) {
    const dateString = addKstDays(todayString, offset);
    const day = days.find((entry) => entry.date === dateString);
    if (!day) continue;
    if (day.source === "short") continue;

    if (midLandItem) {
      const amWeather = String(midLandItem?.[`wf${offset}Am`] || "").trim();
      const pmWeather = String(midLandItem?.[`wf${offset}Pm`] || "").trim();
      const amRainProb = safeNumber(midLandItem?.[`rnSt${offset}Am`]);
      const pmRainProb = safeNumber(midLandItem?.[`rnSt${offset}Pm`]);

      day.am = amWeather
        ? { weather: amWeather, weatherCode: null, rainProb: amRainProb, icon: mapWeatherToIcon(amWeather) }
        : day.am;
      day.pm = pmWeather
        ? { weather: pmWeather, weatherCode: null, rainProb: pmRainProb, icon: mapWeatherToIcon(pmWeather) }
        : day.pm;
    }

    if (midTempItem) {
      day.tempMin = safeNumber(midTempItem?.[`taMin${offset}`]);
      day.tempMax = safeNumber(midTempItem?.[`taMax${offset}`]);
    }

    if (midLandItem || midTempItem) {
      day.source = day.source || "mid";
    }
  }
}

function countForecastCoverage(forecast) {
  return (forecast || []).reduce((sum, day) => {
    return sum
      + (day?.am ? 1 : 0)
      + (day?.pm ? 1 : 0)
      + (day?.tempMin != null ? 1 : 0)
      + (day?.tempMax != null ? 1 : 0);
  }, 0);
}

function mergeMissingWithPreviousForecast(nextForecast, previousForecast) {
  if (!Array.isArray(previousForecast) || previousForecast.length === 0) {
    return { forecast: nextForecast, usedPrevious: false };
  }

  const previousByDate = new Map(previousForecast.map((day) => [day.date, day]));
  let usedPrevious = false;
  const merged = nextForecast.map((day) => {
    const previous = previousByDate.get(day.date);
    if (!previous) return day;

    const mergedDay = {
      ...day,
      am: day.am || previous.am || null,
      pm: day.pm || previous.pm || null,
      tempMin: day.tempMin != null ? day.tempMin : (previous.tempMin ?? null),
      tempMax: day.tempMax != null ? day.tempMax : (previous.tempMax ?? null),
      source: day.source || previous.source || null,
    };
    if (
      mergedDay.am !== day.am ||
      mergedDay.pm !== day.pm ||
      mergedDay.tempMin !== day.tempMin ||
      mergedDay.tempMax !== day.tempMax
    ) {
      usedPrevious = true;
    }
    return mergedDay;
  });

  return { forecast: merged, usedPrevious };
}

function buildAirportResult(icao, shortItems, midLandItem, midTempItem, previousAirport, tmFc, sourceStatus) {
  const todayString = formatKstDate();
  const baseForecast = createInitialForecastWindow(todayString);

  if (Array.isArray(shortItems) && shortItems.length > 0) {
    const announceTime = applyShortForecast(baseForecast, shortItems, todayString);
    sourceStatus.short = {
      ...sourceStatus.short,
      ok: true,
      announce_time: announceTime,
    };
  }

  if (midLandItem || midTempItem) {
    applyMidForecast(baseForecast, midLandItem, midTempItem, todayString);
  }

  const merged = mergeMissingWithPreviousForecast(baseForecast, previousAirport?.forecast || []);
  const nextScore = countForecastCoverage(merged.forecast);
  const previousScore = countForecastCoverage(previousAirport?.forecast || []);
  const hasFailedSource = Object.values(sourceStatus).some((status) => status?.ok === false);
  const qualityDropTolerance = Number(config.ground_forecast.quality_drop_tolerance || 0);

  if (previousAirport && (nextScore === 0 || (hasFailedSource && nextScore + qualityDropTolerance < previousScore))) {
    return {
      ...previousAirport,
      icao,
      source_status: sourceStatus,
      _stale: true,
    };
  }

  return {
    icao,
    forecast: merged.forecast,
    source_status: sourceStatus,
    tmFc,
    coverage_score: nextScore,
    _stale: merged.usedPrevious,
  };
}

async function process() {
  const result = {
    type: "ground_forecast",
    fetched_at: new Date().toISOString(),
    airports: {},
  };
  const requestCaches = buildRequestCaches();
  const tmFc = getLatestMidTmfc(new Date(result.fetched_at));
  const villageBase = getLatestVillageBase(new Date(result.fetched_at));
  const previous = store.getCached("ground_forecast");
  const airportErrors = {};
  const failedAirports = [];

  for (const airport of config.airports) {
    const icao = airport.icao;
    const mapping = config.ground_forecast.airports[icao];
    const previousAirport = previous?.airports?.[icao] || null;

    // 주간예보(단기·중기)는 기상청 구역코드가 있어야 하지만, 시간별 동네예보는 위경도만 있으면 된다.
    // 구역코드가 없다고 시간별 예보까지 버리면 청주·광주·대구처럼 코드를 등록하지 않은 공항이
    // 도착지 예보를 통째로 잃는다. 여기서는 시간별만 받고 주간예보는 비워 둔다.
    const grid = latLonToGrid(airport.lat, airport.lon);

    if (!mapping) {
      airportErrors[icao] = "Missing ground forecast regId mapping";
      let hourlyOnly = [];
      const hourlyOnlyStatus = { ok: false, nx: grid.nx, ny: grid.ny, base_date: villageBase.baseDate, base_time: villageBase.baseTime, error: null };
      try {
        hourlyOnly = extractHourlySlots(await fetchVillageForecast(grid.nx, grid.ny, requestCaches, villageBase));
        hourlyOnlyStatus.ok = hourlyOnly.length > 0;
      } catch (error) {
        hourlyOnlyStatus.error = error.message || "Unknown error";
      }
      if (!hourlyOnlyStatus.ok) failedAirports.push(icao);
      result.airports[icao] = {
        ...(previousAirport || {}),
        icao,
        forecast: previousAirport?.forecast || [],
        hourly: hourlyOnly.length > 0 ? hourlyOnly : (previousAirport?.hourly || []),
        hourly_status: hourlyOnlyStatus,
        _stale: hourlyOnly.length === 0 && Boolean(previousAirport),
      };
      continue;
    }

    // 시간별(동네예보)은 주간예보 품질 판정과 무관하므로 sourceStatus와 분리한다.
    const hourlyStatus = { ok: false, nx: grid.nx, ny: grid.ny, base_date: villageBase.baseDate, base_time: villageBase.baseTime, error: null };
    const sourceStatus = {
      short: { ok: false, regId: mapping.short_reg_id, error: null },
      mid_land: { ok: false, regId: mapping.mid_land_reg_id, tmFc, error: null },
      mid_ta: { ok: false, regId: mapping.mid_temp_reg_id, tmFc, error: null },
    };

    let shortItems = null;
    let hourly = [];
    let midLandItem = null;
    let midTempItem = null;

    try {
      shortItems = await fetchShortForecast(mapping.short_reg_id, requestCaches);
      sourceStatus.short.ok = true;
    } catch (error) {
      sourceStatus.short.error = error.message || "Unknown error";
    }

    try {
      const villageItems = await fetchVillageForecast(grid.nx, grid.ny, requestCaches, villageBase);
      hourly = extractHourlySlots(villageItems);
      hourlyStatus.ok = hourly.length > 0;
    } catch (error) {
      hourlyStatus.error = error.message || "Unknown error";
    }

    try {
      midLandItem = await fetchMidLandForecast(mapping.mid_land_reg_id, tmFc, requestCaches);
      sourceStatus.mid_land.ok = true;
    } catch (error) {
      sourceStatus.mid_land.error = error.message || "Unknown error";
    }

    try {
      midTempItem = await fetchMidTempForecast(mapping.mid_temp_reg_id, tmFc, requestCaches);
      sourceStatus.mid_ta.ok = true;
    } catch (error) {
      sourceStatus.mid_ta.error = error.message || "Unknown error";
    }

    const airportResult = buildAirportResult(icao, shortItems, midLandItem, midTempItem, previousAirport, tmFc, sourceStatus);
    airportResult.hourly = hourly.length > 0 ? hourly : (previousAirport?.hourly || []);
    airportResult.hourly_status = hourlyStatus;
    result.airports[icao] = airportResult;

    if (Object.values(sourceStatus).some((status) => status.ok === false)) {
      failedAirports.push(icao);
      airportErrors[icao] = Object.entries(sourceStatus)
        .filter(([, status]) => status.ok === false)
        .map(([key, status]) => `${key}: ${status.error || "failed"}`)
        .join("; ");
    }
  }

  const hasAnyForecast = Object.values(result.airports).some((airport) => countForecastCoverage(airport?.forecast || []) > 0);
  if (!hasAnyForecast) {
    throw new Error("Ground forecast fetch returned no usable airport forecasts");
  }

  const saveResult = store.save("ground_forecast", result);
  return {
    type: "ground_forecast",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    airports: Object.keys(result.airports).length,
    failedAirports,
    airportErrors,
  };
}

export { process, getLatestMidTmfc, mapShortNumEfToPeriod, mapWeatherToIcon, getLatestVillageBase, skyPtyToIcon, extractHourlySlots }
export default { process, getLatestMidTmfc, mapShortNumEfToPeriod, mapWeatherToIcon, getLatestVillageBase, skyPtyToIcon, extractHourlySlots }
