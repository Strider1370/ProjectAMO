import crypto from 'crypto'
import fs from 'fs'
import https from 'https'
import path from 'path'
import { fileURLToPath } from 'url'
import config from '../config.js'
import { isDemoMode } from '../dev/demo-mode.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FEET_TO_METERS = 1 / 3.28084
const KNOTS_TO_MPS = 1 / 1.94384
const FPM_TO_MPS = 1 / 196.85

let _firPolygon = null;
function loadFirPolygon() {
  if (_firPolygon) return _firPolygon;
  try {
    const firPath = path.join(__dirname, "../../../frontend/public/data/fir.geojson");
    const geojson = JSON.parse(fs.readFileSync(firPath, "utf8"));
    const feature = geojson.features?.find((item) => item?.properties?.role === "incheon-fir")
      || geojson.features?.[0];
    if (feature?.geometry?.type === "Polygon") {
      _firPolygon = [feature.geometry.coordinates[0]];
    } else if (feature?.geometry?.type === "MultiPolygon") {
      _firPolygon = feature.geometry.coordinates.map((polygon) => polygon[0]).filter(Boolean);
    }
  } catch (_) {
    _firPolygon = null;
  }
  return _firPolygon;
}

function pointInPolygon(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isInFir(lon, lat) {
  const rings = loadFirPolygon();
  if (!rings) return true;
  return rings.some((ring) => pointInPolygon(lon, lat, ring));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    const out = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      if (key === "updated_at" || key === "fetched_at" || key === "content_hash") {
        continue;
      }
      out[key] = canonicalize(value[key]);
    }
    return out;
  }

  return value;
}

function contentHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function getAdsbDir() {
  return path.join(config.storage.base_path, "adsb");
}

async function fetchWithTimeout(url, timeoutMs = config.adsb.timeout_ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = buildRequestHeaders()
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error?.cause?.code !== "SELF_SIGNED_CERT_IN_CHAIN") {
        throw error;
      }

      return await fetchViaHttpsRequest(url, timeoutMs, headers);
    }
  } finally {
    clearTimeout(timer);
  }
}

function buildRequestHeaders() {
  return {
    "User-Agent": "KMA-Weather-Dashboard/1.0",
    "Accept": "application/json",
  }
}

function fetchViaHttpsRequest(url, timeoutMs, headers) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "GET",
      rejectUnauthorized: false,
      headers,
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Request timeout"));
    });
    request.on("error", reject);
    request.end();
  });
}

function buildUrl() {
  const { lat, lon } = config.adsb.center;
  return `${config.adsb.url}/lat/${lat}/lon/${lon}/dist/${config.adsb.dist_nm}`;
}

// adsb.lol returns feet / knots / fpm; convert to OpenSky-compatible meters / m·s⁻¹
// so the snapshot schema and frontend consumers stay unchanged.
function normalizeState(ac) {
  const latitude = ac.lat;
  const longitude = ac.lon;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  const on_ground = ac.alt_baro === "ground";
  const baroFt = typeof ac.alt_baro === "number" ? ac.alt_baro : null;
  const geomFt = typeof ac.alt_geom === "number" ? ac.alt_geom : null;
  const gsKt = typeof ac.gs === "number" ? ac.gs : null;
  const rateFpm = typeof ac.baro_rate === "number" ? ac.baro_rate
    : (typeof ac.geom_rate === "number" ? ac.geom_rate : null);

  const callsign = typeof ac.flight === "string" ? ac.flight.trim() : "";

  return {
    icao24: ac.hex || null,
    callsign: /[A-Za-z0-9]/.test(callsign) ? callsign : null,
    origin_country: null,
    time_position: typeof ac.seen_pos === "number" ? ac.seen_pos : null,
    last_contact: typeof ac.seen === "number" ? ac.seen : null,
    lat: latitude,
    lon: longitude,
    baro_altitude: baroFt !== null ? baroFt * FEET_TO_METERS : null,
    geo_altitude: geomFt !== null ? geomFt * FEET_TO_METERS : null,
    velocity: gsKt !== null ? gsKt * KNOTS_TO_MPS : null,
    true_track: typeof ac.track === "number" ? ac.track : null,
    vertical_rate: rateFpm !== null ? rateFpm * FPM_TO_MPS : null,
    wind_direction: typeof ac.wd === "number" ? ac.wd : null,
    wind_speed: typeof ac.ws === "number" ? ac.ws : null,
    outside_air_temperature: typeof ac.oat === "number" ? ac.oat : null,
    squawk: ac.squawk || null,
    spi: false,
    position_source: null,
    on_ground,
    type_code: typeof ac.t === "string" ? ac.t : null,
    category: typeof ac.category === "string" ? ac.category : null,
    registration: typeof ac.r === "string" ? ac.r : null
  };
}

async function process({ demoMode = isDemoMode, fetchPayload = () => fetchWithTimeout(buildUrl()) } = {}) {
  if (demoMode()) return { type: 'adsb', skipped: true, reason: 'demo_mode' }
  const dir = getAdsbDir();
  fs.mkdirSync(dir, { recursive: true });

  const raw = await fetchPayload();
  const aircraft = (raw.ac || [])
    .map(normalizeState)
    .filter(Boolean)
    .filter((a) => !a.on_ground)
    .filter((a) => isInFir(a.lon, a.lat))
    .sort((a, b) => {
      const left = `${a.callsign || ""}-${a.icao24 || ""}`;
      const right = `${b.callsign || ""}-${b.icao24 || ""}`;
      return left.localeCompare(right);
    });

  const snapshot = {
    type: "adsb",
    source: "adsb.lol",
    fetched_at: new Date().toISOString(),
    updated_at: new Date(typeof raw.now === "number" ? raw.now : Date.now()).toISOString(),
    bounds: { ...config.adsb.bounds },
    total_aircraft: aircraft.length,
    aircraft
  };

  if (demoMode()) return { type: 'adsb', skipped: true, reason: 'demo_mode' }
  snapshot.content_hash = contentHash(snapshot);
  writeJson(path.join(dir, "latest.json"), snapshot);

  return {
    type: "adsb",
    saved: true,
    totalAircraft: snapshot.total_aircraft,
    updatedAt: snapshot.updated_at
  };
}

export { buildUrl, isInFir, loadFirPolygon, normalizeState, process }
export default { process }
