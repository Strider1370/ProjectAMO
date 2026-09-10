import path from 'path'
import config from '../config.js'
import { requestObservedApi } from '../lib/request-observability.js'
import store from '../store.js'
import lightningParser from '../parsers/lightning-parser.js'

const LIGHTNING_HISTORY_WINDOW_MINUTES = 240;
const LIGHTNING_BACKFILL_STEP_MINUTES = 5;

function formatKstTm(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}`;
}

function getCurrentKstTm() {
  return formatKstTm(new Date());
}

function getAlignedKstTm(stepMinutes = config.lightning.itv_minutes) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCSeconds(0, 0);
  const minute = kst.getUTCMinutes();
  kst.setUTCMinutes(minute - (minute % stepMinutes));
  return formatKstTm(new Date(kst.getTime() - 9 * 60 * 60 * 1000));
}

function kstTmToUtcDate(tm) {
  const raw = String(tm || "");
  if (!/^\d{12}$/.test(raw)) {
    throw new Error(`Invalid KST tm: ${tm}`);
  }
  return new Date(Date.UTC(
    Number(raw.slice(0, 4)),
    Number(raw.slice(4, 6)) - 1,
    Number(raw.slice(6, 8)),
    Number(raw.slice(8, 10)) - 9,
    Number(raw.slice(10, 12)),
    0,
    0
  ));
}

function shiftKstTm(tm, deltaMinutes) {
  const shifted = new Date(kstTmToUtcDate(tm).getTime() + deltaMinutes * 60 * 1000);
  return formatKstTm(shifted);
}

function buildBackfillTms(baseTm, windowMinutes = LIGHTNING_HISTORY_WINDOW_MINUTES, stepMinutes = config.lightning.itv_minutes) {
  const steps = Math.ceil(windowMinutes / stepMinutes);
  const tms = [];
  for (let index = steps - 1; index >= 0; index -= 1) {
    tms.push(shiftKstTm(baseTm, -index * stepMinutes));
  }
  return tms;
}

function tmWindow(tm, stepMinutes = config.lightning.itv_minutes) {
  const to = kstTmToUtcDate(tm)
  return { from: new Date(to.getTime() - stepMinutes * 60_000).toISOString(), to: to.toISOString() }
}

function priorCoversTm(coverage, tm, stepMinutes = config.lightning.itv_minutes) {
  const expected = tmWindow(tm, stepMinutes)
  return (coverage?.successfulWindows ?? []).some((window) => {
    const from = new Date(window.from).getTime()
    const to = new Date(window.to).getTime()
    return Number.isFinite(from) && Number.isFinite(to)
      && from <= new Date(expected.from).getTime() && to >= new Date(expected.to).getTime()
  })
}

function mergeCoverageWindows(windows) {
  const ordered = windows.map((window) => ({ from: new Date(window.from).getTime(), to: new Date(window.to).getTime() }))
    .filter((window) => Number.isFinite(window.from) && Number.isFinite(window.to) && window.from < window.to)
    .sort((a, b) => a.from - b.from)
  const merged = []
  for (const window of ordered) {
    const prior = merged.at(-1)
    if (prior && window.from <= prior.to) prior.to = Math.max(prior.to, window.to)
    else merged.push({ ...window })
  }
  return merged.map((window) => ({ from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString() }))
}

export function buildLightningCoverage({
  baseTm,
  successfulTms = [],
  failedTms = [],
  previousCoverage = null,
  windowMinutes = LIGHTNING_HISTORY_WINDOW_MINUTES,
  stepMinutes = config.lightning.itv_minutes,
} = {}) {
  const expectedTms = buildBackfillTms(baseTm, windowMinutes, stepMinutes)
  const successful = new Set(successfulTms)
  for (const tm of expectedTms) if (priorCoversTm(previousCoverage, tm, stepMinutes)) successful.add(tm)
  const successfulWindows = mergeCoverageWindows(expectedTms.filter((tm) => successful.has(tm)).map((tm) => tmWindow(tm, stepMinutes)))
  const expectedFrom = tmWindow(expectedTms[0], stepMinutes).from
  const expectedTo = tmWindow(expectedTms.at(-1), stepMinutes).to
  const coveredCount = expectedTms.filter((tm) => successful.has(tm)).length
  const failed = new Set(failedTms.map((value) => typeof value === 'string' ? value : value.tm))
  return {
    status: coveredCount === expectedTms.length ? 'complete' : coveredCount > 0 ? 'partial' : 'unknown',
    referenceTime: kstTmToUtcDate(baseTm).toISOString(),
    from: expectedFrom,
    to: expectedTo,
    successfulWindows,
    failedWindows: expectedTms.filter((tm) => failed.has(tm)).map((tm) => ({ tm, ...tmWindow(tm, stepMinutes) })),
    expectedWindowCount: expectedTms.length,
    successfulWindowCount: coveredCount,
    spatial: {
      kind: 'circle',
      center: [Number(config.lightning.nationwide?.lon), Number(config.lightning.nationwide?.lat)],
      radiusKm: Number(config.lightning.nationwide?.range_km),
    },
  }
}

function buildNationwideLightningUrl(tm) {
  const nationwide = config.lightning.nationwide || {};
  const params = new URLSearchParams({
    tm,
    itv: String(config.lightning.itv_minutes),
    lon: String(nationwide.lon),
    lat: String(nationwide.lat),
    range: String(nationwide.range_km),
    gc: "T",
    authKey: config.api.auth_key,
  });
  return `${config.api.lightning_url}?${params.toString()}`;
}

async function fetchWithRetry(url) {
  const response = await requestObservedApi({
    operation: 'lightning', url,
    validate: async (value) => { if (!value.ok) throw new Error(`HTTP ${value.status}`) },
  })
  return response.text()
}

function buildStrikeKey(strike) {
  return [
    strike.time || "",
    strike.lon ?? "",
    strike.lat ?? "",
    strike.type || "",
    strike.intensity ?? "",
  ].join("|");
}

function mergeRecentStrikes(previousStrikes, incomingStrikes, nowMs) {
  const cutoffMs = nowMs - (LIGHTNING_HISTORY_WINDOW_MINUTES * 60 * 1000);
  const merged = new Map();

  for (const strike of previousStrikes || []) {
    const timeMs = new Date(strike.time).getTime();
    if (!Number.isFinite(timeMs) || timeMs < cutoffMs) continue;
    merged.set(buildStrikeKey(strike), strike);
  }

  for (const strike of incomingStrikes || []) {
    const timeMs = new Date(strike.time).getTime();
    if (!Number.isFinite(timeMs) || timeMs < cutoffMs) continue;
    merged.set(buildStrikeKey(strike), strike);
  }

  return Array.from(merged.values()).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function summarize(strikes) {
  const byZone = { alert: 0, danger: 0, caution: 0 };
  const byType = { ground: 0, cloud: 0 };
  let maxIntensity = null;
  let latestTime = null;

  for (const strike of strikes) {
    if (byZone[strike.zone] != null) byZone[strike.zone] += 1;
    if (strike.type === "G") byType.ground += 1;
    if (strike.type === "C") byType.cloud += 1;
    if (maxIntensity == null || strike.intensity_abs > maxIntensity) {
      maxIntensity = strike.intensity_abs;
    }
    if (latestTime == null || new Date(strike.time).getTime() > new Date(latestTime).getTime()) {
      latestTime = strike.time;
    }
  }

  return {
    total_count: strikes.length,
    by_zone: byZone,
    by_type: byType,
    max_intensity: maxIntensity,
    latest_time: latestTime,
  };
}

function classifyForAirport(strikes, airport, zones) {
  return strikes
    .map((strike) => lightningParser.classifyStrike(strike, airport, zones))
    .filter((strike) => strike.zone !== "outside")
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function buildAirportPayloads(strikes) {
  const airports = {};

  for (const airport of config.airports) {
    const airportStrikes = classifyForAirport(strikes, airport, config.lightning.zones);
    airports[airport.icao] = {
      airport_name: airport.name,
      arp: { lat: airport.lat, lon: airport.lon },
      summary: summarize(airportStrikes),
      strikes: airportStrikes,
    };
  }

  return airports;
}

function emptyNationwidePayload() {
  return {
    summary: {
      total_count: 0,
      by_zone: { alert: 0, danger: 0, caution: 0 },
      by_type: { ground: 0, cloud: 0 },
      max_intensity: null,
      latest_time: null,
    },
    strikes: [],
  };
}

function buildLightningResult(tm, strikes, extraQuery = {}, coverage = null) {
  const airports = buildAirportPayloads(strikes);
  return {
    type: "lightning",
    fetched_at: new Date().toISOString(),
    query: {
      tm,
      itv_minutes: config.lightning.itv_minutes,
      nationwide_range_km: config.lightning.nationwide?.range_km || null,
      ...extraQuery,
    },
    history_window_minutes: LIGHTNING_HISTORY_WINDOW_MINUTES,
    airports,
    nationwide: {
      summary: summarize(strikes),
      strikes,
      coverage: coverage ?? { status: 'unknown', from: null, to: null, successfulWindows: [], failedWindows: [] },
    },
  };
}

function buildProcessResponse(result, saveResult, airportErrors = {}) {
  return {
    type: "lightning",
    saved: saveResult.saved,
    filePath: saveResult.filePath || null,
    airports: Object.keys(result.airports || {}).length,
    nationwideStrikes: Number(result.nationwide?.summary?.total_count || 0),
    totalStrikes: Number(result.nationwide?.summary?.total_count || 0),
    failedAirports: [],
    airportErrors,
  };
}

async function fetchNationwideStrikes(tm) {
  const rawNationwide = await fetchWithRetry(buildNationwideLightningUrl(tm));
  const nationwidePoint = {
    lat: config.lightning.nationwide?.lat,
    lon: config.lightning.nationwide?.lon,
  };
  return lightningParser.parse(
    rawNationwide,
    nationwidePoint,
    config.lightning.zones,
    { classify: false }
  );
}

// ponytail: 12→3. 이전 실행분(previous)은 아래에서 병합·보존되므로 옛 창을 다시 받을 필요 없음.
// 3창(=15분)만 재조회 = 낙뢰 지연도착 보정용. 콜 -2,592/일, 신선도 손실 0. 지연도착 우려 시 4로.
const INCREMENTAL_LOOKBACK_STEPS = 3; // 3 × 5min = 최근 15분치만 재조회

async function process() {
  const baseTm = shiftKstTm(getAlignedKstTm(), -config.lightning.itv_minutes);
  const previous = store.loadLatest(path.join(config.storage.base_path, "lightning"));
  const nowMs = Date.now();

  // 최근 창은 지연 도착을 위해 다시 읽고, 과거 coverage의 누락 창도 함께 복구한다.
  const recentTms = [];
  for (let i = INCREMENTAL_LOOKBACK_STEPS - 1; i >= 0; i--) {
    recentTms.push(shiftKstTm(baseTm, -i * config.lightning.itv_minutes));
  }
  const expectedTms = buildBackfillTms(baseTm)
  const missingTms = expectedTms.filter((tm) => !priorCoversTm(previous?.nationwide?.coverage, tm))
  const tms = [...new Set([...missingTms, ...recentTms])].sort()

  const merged = new Map();
  for (const strike of mergeRecentStrikes(previous?.nationwide?.strikes || [], [], nowMs)) {
    merged.set(buildStrikeKey(strike), strike);
  }

  const failedTms = [];
  const successfulTms = [];
  let fetchedCount = 0;

  for (const tm of tms) {
    try {
      const strikes = await fetchNationwideStrikes(tm);
      for (const strike of strikes) {
        const timeMs = new Date(strike.time).getTime();
        if (!Number.isFinite(timeMs) || timeMs < nowMs - LIGHTNING_HISTORY_WINDOW_MINUTES * 60 * 1000) continue;
        merged.set(buildStrikeKey(strike), strike);
      }
      successfulTms.push(tm);
      fetchedCount++;
    } catch {
      failedTms.push(tm);
    }
  }

  if (fetchedCount === 0 && previous) {
    return buildProcessResponse(previous, { saved: false, reason: "fetch_failed" }, { nationwide: `all ${tms.length} windows failed` });
  }

  const mergedStrikes = Array.from(merged.values())
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const coverage = buildLightningCoverage({ baseTm, successfulTms, failedTms, previousCoverage: previous?.nationwide?.coverage })
  const result = buildLightningResult(baseTm, mergedStrikes, {}, coverage);
  const saveResult = store.save("lightning", result);
  return {
    ...buildProcessResponse(result, saveResult, failedTms.length ? { nationwide: `${failedTms.length}/${tms.length} windows failed` } : {}),
    fetchedWindows: fetchedCount,
    failedWindows: failedTms.length,
  };
}

async function processBackfill() {
  const baseTm = getAlignedKstTm(LIGHTNING_BACKFILL_STEP_MINUTES);
  const tms = buildBackfillTms(baseTm, LIGHTNING_HISTORY_WINDOW_MINUTES, LIGHTNING_BACKFILL_STEP_MINUTES);
  const merged = new Map();
  const failedTms = [];
  const successfulTms = [];
  const nowMs = Date.now();

  for (const tm of tms) {
    try {
      const strikes = await fetchNationwideStrikes(tm);
      for (const strike of mergeRecentStrikes([], strikes, nowMs)) {
        merged.set(buildStrikeKey(strike), strike);
      }
      successfulTms.push(tm);
    } catch (error) {
      failedTms.push({ tm, error: error.message || "Unknown error" });
    }
  }

  if (merged.size === 0 && failedTms.length === tms.length) {
    throw new Error(`Lightning backfill failed for all windows (${failedTms.length})`);
  }

  const mergedNationwideStrikes = mergeRecentStrikes([], Array.from(merged.values()), nowMs);
  const coverage = buildLightningCoverage({ baseTm, successfulTms, failedTms, stepMinutes: LIGHTNING_BACKFILL_STEP_MINUTES })
  const result = buildLightningResult(baseTm, mergedNationwideStrikes, {
    backfill: true,
    backfill_from_tm: tms[0] || null,
    backfill_to_tm: tms[tms.length - 1] || null,
  }, coverage);
  const saveResult = store.save("lightning", result);

  return {
    ...buildProcessResponse(result, saveResult, failedTms.length ? { backfill: `${failedTms.length} windows failed` } : {}),
    backfillWindows: tms.length,
    failedWindows: failedTms.length,
    failedTms,
  };
}

export { process, processBackfill }
export default { process, processBackfill }
