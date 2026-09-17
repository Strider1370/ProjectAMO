
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { SIGWX_ZOOM_LEVELS } from './sigwx-overlay-zoom.js'

const DEG2RAD = Math.PI / 180;
const OUTPUT_WIDTH = 1400;
const PADDING_RATIO = 0.06;
const SAMPLE_REPEAT = 36;
const RENDER_VERSION = "sigwx-cloud-overlay-zoom-v6";
const CB_COLOR = "#a52a2a";

function lonToMercatorX(lon) {
  return (lon * Math.PI) / 180;
}

function latToMercatorY(lat) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = clamped * DEG2RAD;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function mercatorYToLat(y) {
  return Math.atan(Math.sinh(y)) / DEG2RAD;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isCbCloudBoundary(item) {
  return Number(item?.item_type) === 4
    && String(item?.contour_name || "").toLowerCase() === "cld"
    && String(item?.item_name || "").toLowerCase() === "cloud"
    && /\bCB\b/i.test(String(item?.label || item?.text_label || "").replace(/&#10;/g, " "));
}

function buildBounds(items) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    for (const [lat, lon] of item.lat_lngs || []) {
      const x = lonToMercatorX(lon);
      const y = latToMercatorY(lat);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  const padX = Math.max((maxX - minX) * PADDING_RATIO, 0.01);
  const padY = Math.max((maxY - minY) * PADDING_RATIO, 0.01);
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  };
}

function projectPoint(lat, lon, bounds, width, height) {
  const x = lonToMercatorX(lon);
  const y = latToMercatorY(lat);
  return {
    x: ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * width,
    y: ((bounds.maxY - y) / (bounds.maxY - bounds.minY)) * height,
  };
}

function smoothClosedRing(points, iterations = 4) {
  if (!Array.isArray(points) || points.length < 3) return points;
  const samePoint = (a, b) => a.x === b.x && a.y === b.y;
  let current = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  if (current.length > 1 && samePoint(current[0], current[current.length - 1])) current = current.slice(0, -1);
  for (let i = 0; i < iterations; i += 1) {
    if (current.length < 3) break;
    const next = [];
    // The closing edge receives the same smoothing as every other edge.
    for (let j = 0; j < current.length; j += 1) {
      const p0 = current[j];
      const p1 = current[(j + 1) % current.length];
      next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
      next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
    }
    current = next;
  }
  return current;
}

function sampleClosedRing(points, repeat = SAMPLE_REPEAT) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length <= 0.0001) continue;
    segments.push({ a, b, dx, dy, length, start: totalLength, end: totalLength + length });
    totalLength += length;
  }
  if (!segments.length) return [];
  // Fit an integer number of scallops around the entire ring, leaving no remainder at the seam.
  const count = Math.max(3, Math.round(totalLength / repeat));
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    const distance = i * totalLength / count;
    const segment = segments.find((entry) => distance >= entry.start && distance <= entry.end);
    if (!segment) continue;
    const local = distance - segment.start;
    const ratio = local / segment.length;
    const x = segment.a.x + segment.dx * ratio;
    const y = segment.a.y + segment.dy * ratio;
    samples.push({ x, y });
  }
  return samples;
}

function polygonSignedArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += (a.x * b.y) - (b.x * a.y);
  }
  return area / 2;
}

function buildCbBoundaryPath(points, repeat = SAMPLE_REPEAT) {
  if (!Number.isFinite(repeat) || repeat <= 0) return "";
  if (!Array.isArray(points) || points.length < 3 || points.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) return "";
  const ring = smoothClosedRing(points);
  const area = polygonSignedArea(ring);
  if (Math.abs(area) < 0.0001) return "";
  const samples = sampleClosedRing(ring, repeat);
  if (samples.length < 3) return "";
  const sweep = area > 0 ? 1 : 0;
  let d = `M${samples[0].x.toFixed(2)} ${samples[0].y.toFixed(2)}`;
  samples.forEach((point, index) => {
    const next = samples[(index + 1) % samples.length];
    const radius = (Math.hypot(next.x - point.x, next.y - point.y) / 2).toFixed(2);
    // Adjacent arcs share endpoints, including the last and first arcs.
    d += ` A${radius} ${radius} 0 0 ${sweep} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  });
  return `${d} Z`;
}

async function renderSigwxCloudOverlay(sigwxLow, dataRoot, canonicalHash) {
  const cloudItems = (sigwxLow?.items || [])
    .filter((item) => isCbCloudBoundary(item) && Array.isArray(item.lat_lngs) && item.lat_lngs.length >= 3);

  if (!cloudItems.length) return null;
  const boundsMerc = buildBounds(cloudItems);
  if (!boundsMerc) return null;

  const width = OUTPUT_WIDTH;
  const height = Math.max(1, Math.round(((boundsMerc.maxY - boundsMerc.minY) / (boundsMerc.maxX - boundsMerc.minX)) * width));
  const projected = cloudItems.map((item) => ({
    ...item,
    color: CB_COLOR,
    points: item.lat_lngs.map(([lat, lon]) => projectPoint(lat, lon, boundsMerc, width, height)),
  }));

  const dir = path.join(dataRoot, "sigwx_low");
  fs.mkdirSync(dir, { recursive: true });
  const tmfc = sigwxLow?.tmfc || "latest";
  const metaFilename = `clouds_meta_${tmfc}.json`;
  const variants = [];
  for (const level of SIGWX_ZOOM_LEVELS) {
    const screenWidth = 512 * (2 ** level.reference_zoom) * (boundsMerc.maxX - boundsMerc.minX) / (2 * Math.PI);
    const pixelsPerSvgUnit = screenWidth / width;
    // Keep each scallop near 14 screen pixels and its stroke near 1.5px.
    const repeat = 14 / pixelsPerSvgUnit;
    const strokeWidth = 1.5 / pixelsPerSvgUnit;
    const svgParts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ];
    for (const item of projected) {
      const pathD = buildCbBoundaryPath(item.points, repeat);
      if (!pathD) continue;
      svgParts.push(`<path d="${escapeXml(pathD)}" fill="none" stroke="${item.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`);
    }
    svgParts.push(`</svg>`);
    const density = 72 * Math.max(1, Math.min(4096 / Math.max(width, height), screenWidth * 1.5 / width));
    const { data, info } = await sharp(Buffer.from(svgParts.join("")), { density }).png({ compressionLevel: 3 }).toBuffer({ resolveWithObject: true });
    const filename = level.id === 'overview' ? `clouds_${tmfc}.png` : `clouds_${tmfc}_${level.id}.png`;
    fs.writeFileSync(path.join(dir, filename), data);
    variants.push({ ...level, path: `/data/sigwx_low/${filename}`, width: info.width, height: info.height });
  }

  const south = mercatorYToLat(boundsMerc.minY);
  const north = mercatorYToLat(boundsMerc.maxY);
  const west = (boundsMerc.minX * 180) / Math.PI;
  const east = (boundsMerc.maxX * 180) / Math.PI;

  const meta = {
    type: "SIGWX_LOW_CLOUDS",
    render_version: RENDER_VERSION,
    updated_at: new Date().toISOString(),
    tmfc,
    source_hash: canonicalHash || null,
    latest: {
      tmfc,
      render_version: RENDER_VERSION,
      path: variants[0].path,
      bounds: [
        [south, west],
        [north, east],
      ],
      width: variants[0].width,
      height: variants[0].height,
      cloudCount: projected.length,
      variants,
    },
  };

  fs.writeFileSync(path.join(dir, metaFilename), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return meta;
}

export { RENDER_VERSION, renderSigwxCloudOverlay, buildCbBoundaryPath }
export default { RENDER_VERSION, renderSigwxCloudOverlay }
