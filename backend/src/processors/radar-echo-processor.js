import fs from 'fs'
import path from 'path'
import config from '../config.js'
import { gridToLatLon, parseRadarBinary, renderFullCoverageEcho } from '../parsers/radar-echo-parser.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { createMotionInput, deriveMotionGeoJSON, deserializeMotionInput, serializeMotionInput } from './radar-motion.js'

let backgroundFillRunning = false;
const RENDER_VERSION = "rainrate-reproject-full-v5-motion-dense";
const IMMEDIATE_FRAME_COUNT = 4;
const MOTION_INPUT_FILENAME = 'motion_input_latest.bin';

function ensureRadarDir() {
  const radarDir = path.join(config.storage.base_path, "radar");
  fs.mkdirSync(radarDir, { recursive: true });
  return radarDir;
}

function formatKstTm(dateKst) {
  const y = dateKst.getUTCFullYear();
  const m = String(dateKst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateKst.getUTCDate()).padStart(2, "0");
  const h = String(dateKst.getUTCHours()).padStart(2, "0");
  const mi = String(dateKst.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${mi}`;
}

function getCandidateTms(delayMinutes = config.radar_echo.delay_minutes, referenceTime = new Date()) {
  const nowUtc = new Date(referenceTime);
  const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  nowKst.setUTCMinutes(nowKst.getUTCMinutes() - delayMinutes);

  const minute = Math.floor(nowKst.getUTCMinutes() / 5) * 5;
  nowKst.setUTCMinutes(minute, 0, 0);

  return [0, 1, 2].map((i) => {
    const t = new Date(nowKst.getTime() - i * 5 * 60 * 1000);
    return formatKstTm(t);
  });
}

function buildEchoUrl(tm) {
  const params = new URLSearchParams({
    tm,
    data: "bin",
    cmp: config.radar_echo.cmp,
    authKey: config.api.radar_satellite_auth_key,
  });
  return `${config.api.radar_url}?${params.toString()}`;
}


/**
 * Download radar binary (.bin.gz) for a given timestamp.
 * Returns raw gzipped Buffer or null on failure.
 */
async function fetchRadarBinary(tm) {
  const url = buildEchoUrl(tm);
  try {
    const response = await fetchWithTimeout(url, config.radar_echo.timeout_ms);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    // Sanity check: gzip starts with 0x1f 0x8b, minimum reasonable size
    if (buffer.length < 10000 || buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
      return null;
    }
    return buffer;
  } catch (error) {
    return null;
  }
}

function loadExistingMeta(radarDir) {
  const metaPath = path.join(radarDir, "echo_meta.json");
  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (error) {
    return null;
  }
}

function buildFrameTms(latestTm, frameCount) {
  const frameTms = [];
  const latestDate = new Date(Date.UTC(
    Number(latestTm.slice(0, 4)),
    Number(latestTm.slice(4, 6)) - 1,
    Number(latestTm.slice(6, 8)),
    Number(latestTm.slice(8, 10)) - 9,
    Number(latestTm.slice(10, 12)),
    0,
    0
  ));

  for (let i = frameCount - 1; i >= 0; i--) {
    const frameDate = new Date(latestDate.getTime() - i * 5 * 60 * 1000);
    const frameKst = new Date(frameDate.getTime() + 9 * 60 * 60 * 1000);
    frameTms.push(formatKstTm(frameKst));
  }

  return frameTms;
}

function frameTmToMs(tm) {
  if (!/^\d{12}$/.test(String(tm))) return null;
  return Date.UTC(
    Number(tm.slice(0, 4)), Number(tm.slice(4, 6)) - 1, Number(tm.slice(6, 8)),
    Number(tm.slice(8, 10)) - 9, Number(tm.slice(10, 12)), 0, 0,
  );
}

function isAdjacentFrame(previousTm, currentTm) {
  const previousMs = frameTmToMs(previousTm);
  const currentMs = frameTmToMs(currentTm);
  return Number.isFinite(previousMs) && Number.isFinite(currentMs) && currentMs - previousMs === 5 * 60 * 1000;
}

function writeAtomic(filePath, contents) {
  const tempPath = `${filePath}.${globalThis.process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, contents);
  fs.renameSync(tempPath, filePath);
}

function loadLatestMotionInput(radarDir) {
  const inputPath = path.join(radarDir, MOTION_INPUT_FILENAME);
  if (!fs.existsSync(inputPath)) return null;
  try {
    return deserializeMotionInput(fs.readFileSync(inputPath));
  } catch {
    return null;
  }
}

function saveLatestMotionInput(radarDir, input) {
  writeAtomic(path.join(radarDir, MOTION_INPUT_FILENAME), serializeMotionInput(input));
}

function attachMotionFrame(radarDir, frame, previousInput, currentInput) {
  if (!previousInput?.tm || !isAdjacentFrame(previousInput.tm, currentInput.tm)) return frame;
  try {
    const startedAt = Date.now();
    const observedAtMs = frameTmToMs(currentInput.tm);
    const comparedFromMs = frameTmToMs(previousInput.tm);
    const settings = {
      workStride: config.radar_echo_motion.work_stride,
      patchRadiusKm: config.radar_echo_motion.patch_radius_km,
      spacingKm: config.radar_echo_motion.spacing_km,
      maxSpeedKmh: config.radar_echo_motion.max_speed_kmh,
      minSpeedKt: config.radar_echo_motion.min_speed_kt,
      edgeLookaheadKm: config.radar_echo_motion.edge_lookahead_km,
      minReflectivity: config.radar_echo_motion.min_reflectivity,
      frameIntervalMs: 5 * 60 * 1000,
    };
    const geojson = deriveMotionGeoJSON(previousInput, currentInput, {
      settings,
      gridToLatLon,
      deadlineAtMs: startedAt + config.radar_echo_motion.max_calculation_ms,
    });
    if (!geojson.features.length) {
      console.warn(`radar_echo: motion unavailable for ${currentInput.tm}`);
      return frame;
    }
    const filename = `motion_korea_${currentInput.tm}.geojson`;
    writeAtomic(path.join(radarDir, filename), `${JSON.stringify(geojson)}\n`);
    return {
      ...frame,
      motion: {
        tm: currentInput.tm,
        observedAtMs,
        comparedFromMs,
        path: `/data/radar/${filename}`,
      },
    };
  } catch (error) {
    console.warn(`radar_echo: motion publication failed for ${currentInput.tm}:`, error.message);
    return frame;
  }
}

async function renderFrame(radarDir, tm) {
  const filename = `echo_korea_${tm}.png`;
  const filePath = path.join(radarDir, filename);
  const gzBuffer = await fetchRadarBinary(tm);
  if (!gzBuffer) return null;

  const { refl, nx, ny } = parseRadarBinary(gzBuffer);
  const motionInput = config.radar_echo_motion.enabled
    ? createMotionInput(refl, { nx, ny }, { tm, stride: config.radar_echo_motion.work_stride })
    : null;
  const nationwide = await renderFullCoverageEcho(refl);
  fs.writeFileSync(filePath, nationwide.pngBuffer);

  return {
    frame: {
      tm,
      cmp: config.radar_echo.cmp,
      render_version: RENDER_VERSION,
      path: `/data/radar/${filename}`,
      bounds: nationwide.bounds,
      width: nationwide.width,
      height: nationwide.height,
      echoCount: nationwide.echoCount,
      scale: nationwide.scale,
    },
    motionInput,
  };
}

function writeMeta(radarDir, latestTm, frameTms, existingFrames, { updatedAt = new Date() } = {}) {
  const frames = frameTms
    .map((tm) => existingFrames.get(tm))
    .filter(Boolean)
    .sort((a, b) => a.tm.localeCompare(b.tm));

  const meta = {
    type: "RADAR_ECHO",
    cmp: config.radar_echo.cmp,
    render_version: RENDER_VERSION,
    updated_at: new Date(updatedAt).toISOString(),
    tm: latestTm,
    nationwide: frames.find((frame) => frame.tm === latestTm) || null,
    frames,
  };

  if (!meta.nationwide && frames.length) {
    meta.nationwide = frames[frames.length - 1];
  }

  const validNames = new Set(frames.map((frame) => path.basename(frame.path)));
  const validMotionNames = new Set(frames.map((frame) => frame.motion?.path && path.basename(frame.motion.path)).filter(Boolean));

  for (const filename of fs.readdirSync(radarDir)) {
    if (filename === "echo_korea.png") {
      fs.unlinkSync(path.join(radarDir, filename));
      continue;
    }
    if (/^echo_korea_\d{12}\.png$/.test(filename) && !validNames.has(filename)) {
      fs.unlinkSync(path.join(radarDir, filename));
    }
    if (/^motion_korea_\d{12}\.geojson$/.test(filename) && !validMotionNames.has(filename)) {
      fs.unlinkSync(path.join(radarDir, filename));
    }
  }

  const metaPath = path.join(radarDir, "echo_meta.json");
  writeAtomic(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

function scheduleBackgroundFill(radarDir, pendingTms, existingFrames, latestTm, frameTms) {
  if (!pendingTms.length || backgroundFillRunning) return;

  backgroundFillRunning = true;
  setTimeout(async () => {
    try {
      let previousInput = null;
      for (const tm of pendingTms) {
        const filename = `echo_korea_${tm}.png`;
        const filePath = path.join(radarDir, filename);
        if (fs.existsSync(filePath) && existingFrames.get(tm)) continue;

        try {
          const rendered = await renderFrame(radarDir, tm);
          if (rendered) {
            const frame = attachMotionFrame(radarDir, rendered.frame, previousInput, rendered.motionInput);
            previousInput = rendered.motionInput;
            existingFrames.set(tm, frame);
            writeMeta(radarDir, latestTm, frameTms, existingFrames);
          }
        } catch (err) {
          console.warn(`radar_echo: failed background frame ${tm}:`, err.message);
        }
      }
    } finally {
      backgroundFillRunning = false;
    }
  }, 0);
}

async function process({ now = new Date(), fillAll = false } = {}) {
  if (!config.api.radar_satellite_auth_key) {
    throw new Error("Radar echo auth key missing (set KMA_RADAR_SATELLITE_AUTH_KEY)");
  }

  const radarDir = ensureRadarDir();
  const frameCount = config.radar_echo.max_images || 36;
  const candidates = getCandidateTms(config.radar_echo.delay_minutes, now);
  const latestTm = candidates[0] || null;

  if (!latestTm) {
    return {
      type: "radar_echo",
      saved: false,
      reason: "no data available",
    };
  }

  const frameTms = buildFrameTms(latestTm, frameCount);

  const existingMeta = loadExistingMeta(radarDir);
  const sameCmp = existingMeta?.cmp === config.radar_echo.cmp;
  const sameRenderVersion = existingMeta?.render_version === RENDER_VERSION;
  const existingFrames = new Map(
    ((sameCmp && sameRenderVersion ? existingMeta?.frames : []) || []).map((frame) => [frame.tm, frame])
  );
  const missingTms = frameTms.filter((tm) => {
    const filename = `echo_korea_${tm}.png`;
    const filePath = path.join(radarDir, filename);
    return !(fs.existsSync(filePath) && existingFrames.get(tm));
  });

  const immediateTms = fillAll ? missingTms : missingTms.slice(-IMMEDIATE_FRAME_COUNT);
  const deferredTms = fillAll ? [] : missingTms.slice(0, -IMMEDIATE_FRAME_COUNT);
  let previousInput = config.radar_echo_motion.enabled ? loadLatestMotionInput(radarDir) : null;

  for (const tm of immediateTms) {
    try {
      const rendered = await renderFrame(radarDir, tm);
      if (rendered) {
        const frame = attachMotionFrame(radarDir, rendered.frame, previousInput, rendered.motionInput);
        previousInput = rendered.motionInput;
        existingFrames.set(tm, frame);
        if (config.radar_echo_motion.enabled && tm === latestTm) saveLatestMotionInput(radarDir, rendered.motionInput);
      }
    } catch (err) {
      console.warn(`radar_echo: failed to render nationwide frame ${tm}:`, err.message);
    }
  }

  const meta = writeMeta(radarDir, latestTm, frameTms, existingFrames, { updatedAt: now });
  scheduleBackgroundFill(radarDir, deferredTms, existingFrames, latestTm, frameTms);

  return {
    type: "radar_echo",
    saved: immediateTms.length > 0 || meta.frames.length > 0,
    frameCount: meta.frames.length,
    tm: meta.tm,
    deferredCount: deferredTms.length,
    backgroundFillRunning,
  };
}

export { attachMotionFrame, getCandidateTms, isAdjacentFrame, process, writeMeta }
export default { process }
