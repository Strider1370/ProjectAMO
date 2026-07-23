
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { KO_DISPLAY_GRID, displayPixelToSourceIndex } from '../lib/satellite-ko-grid.js'

const { width: BASE_OUTPUT_WIDTH } = KO_DISPLAY_GRID

// KO-domain defaults (shared by all KO-region NC files)
const KO_DEFAULTS = { width: 900, height: 900, pixelSize: 2000, ulEasting: -899000, ulNorthing: 899000 };
const IR_BT_COLD_K = 190;
const IR_BT_WARM_K = 310;
const IR_DISPLAY_GAMMA = 1.15;



/**
 * Resolve h5wasm attribute to a usable JS value.
 * h5wasm may return raw values or Attribute objects with .value property.
 */
function resolveAttr(attr) {
  if (attr == null) return null;
  if (typeof attr === "object" && "value" in attr) return attr.value;
  return attr;
}

function getNumAttr(attrs, key) {
  const raw = resolveAttr(attrs[key]);
  if (raw == null) return NaN;
  if (ArrayBuffer.isView(raw) && raw.length > 0) return Number(raw[0]);
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "object" && raw[0] !== undefined) return Number(raw[0]);
  return Number(raw);
}

/**
 * Read projection attributes from a KO-domain NC file.
 * Tries root attrs first, then gk2a_imager_projection dataset (LE2 format).
 */
function readProjection(f) {
  let source = f.attrs;

  // LE2 files store projection in a separate dataset
  if (f.keys().includes("gk2a_imager_projection")) {
    const projDs = f.get("gk2a_imager_projection");
    if (projDs && projDs.attrs) source = projDs.attrs;
  }

  const attrs = {
    width: getNumAttr(source, "image_width"),
    height: getNumAttr(source, "image_height"),
    pixelSize: getNumAttr(source, "pixel_size"),
    ulEasting: getNumAttr(source, "upper_left_easting"),
    ulNorthing: getNumAttr(source, "upper_left_northing"),
  };

  // Fallback to KO defaults
  for (const [key, def] of Object.entries(KO_DEFAULTS)) {
    if (!Number.isFinite(attrs[key])) attrs[key] = def;
  }

  return attrs;
}

/**
 * Parse a GK2A LE1B (raw imagery) NetCDF buffer.
 */
async function parseSatelliteNC(buffer) {
  return withNcFile(buffer, 'sat', async (file) => {
    const data = requiredDataset(file, 'image_pixel_values').value
    const attrs = readProjection(file)
    assertArrayLength(data, attrs, 'image_pixel_values')
    return { data, attrs }
  })
}

/**
 * Parse a GK2A LE2 FOG NetCDF buffer.
 * Returns FOG category, Del_Fta temperature difference, and projection.
 */
async function parseFogNC(buffer) {
  return withNcFile(buffer, 'fog', async (file) => {
    const fogData = requiredDataset(file, 'FOG').value
    const delFta = requiredDataset(file, 'Del_Fta').value
    const attrs = readProjection(file)
    assertArrayLength(fogData, attrs, 'FOG')
    assertArrayLength(delFta, attrs, 'Del_Fta')
    return { fogData, delFta, attrs }
  })
}


function assertHdf5(buffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x48 || bytes[2] !== 0x44 || bytes[3] !== 0x46) throw new Error('Invalid HDF5 magic')
}

async function getH5wasm(runtime) {
  if (runtime) return runtime
  const h5wasm = await import('h5wasm')
  await h5wasm.ready
  return h5wasm
}

async function withNcFile(buffer, prefix, read, runtime) {
  assertHdf5(buffer)
  const h5wasm = await getH5wasm(runtime)
  const filename = `${prefix}_${randomUUID()}.nc`
  let file
  try {
    h5wasm.FS.writeFile(filename, new Uint8Array(buffer))
    file = new h5wasm.File(filename, 'r')
    return await read(file)
  } finally {
    try { file?.close() } catch { /* best effort close */ }
    try { h5wasm.FS.unlink(filename) } catch { /* best effort cleanup */ }
  }
}

function requiredDataset(file, name) {
  try {
    const dataset = file.get(name)
    if (!dataset?.value) throw new Error('missing value')
    return dataset
  } catch {
    throw new Error(`Missing required dataset: ${name}`)
  }
}

function requiredNumberAttr(attrs, key, datasetName) {
  const value = getNumAttr(attrs, key)
  if (!Number.isFinite(value)) throw new Error(`Missing required attribute ${key} on ${datasetName}`)
  return value
}

function fillValue(dataset, name) { return requiredNumberAttr(dataset.attrs || {}, '_FillValue', name) }

function assertArrayLength(values, attrs, datasetName) {
  if (!ArrayBuffer.isView(values) || values.length !== attrs.width * attrs.height) throw new Error(`Invalid ${datasetName} array length`)
}

async function parseCiNC(buffer, runtime) {
  return withNcFile(buffer, 'ci', async (file) => {
    const signalDs = requiredDataset(file, 'CI1_prob')
    const dqfDs = requiredDataset(file, 'DQF_CI1')
    const attrs = readProjection(file)
    assertArrayLength(signalDs.value, attrs, 'CI1_prob')
    assertArrayLength(dqfDs.value, attrs, 'DQF_CI1')
    return { signal: signalDs.value, dqf: dqfDs.value, attrs: { ...attrs, signalFill: fillValue(signalDs, 'CI1_prob'), dqfFill: fillValue(dqfDs, 'DQF_CI1') } }
  }, runtime)
}

async function parseCtpsNC(buffer, runtime) {
  return withNcFile(buffer, 'ctps', async (file) => {
    const cthDs = requiredDataset(file, 'CTH')
    const cttDs = requiredDataset(file, 'CTT')
    const flagDs = requiredDataset(file, 'CTPS_flag')
    const attrs = readProjection(file)
    for (const [name, dataset] of [['CTH', cthDs], ['CTT', cttDs], ['CTPS_flag', flagDs]]) assertArrayLength(dataset.value, attrs, name)
    return { cth: cthDs.value, ctt: cttDs.value, flag: flagDs.value, attrs: { ...attrs, cthScale: requiredNumberAttr(cthDs.attrs || {}, 'scale_factor', 'CTH'), cthOffset: requiredNumberAttr(cthDs.attrs || {}, 'add_offset', 'CTH'), cthFill: fillValue(cthDs, 'CTH'), cttScale: requiredNumberAttr(cttDs.attrs || {}, 'scale_factor', 'CTT'), cttOffset: requiredNumberAttr(cttDs.attrs || {}, 'add_offset', 'CTT'), cttFill: fillValue(cttDs, 'CTT'), flagFill: fillValue(flagDs, 'CTPS_flag') } }
  }, runtime)
}
/**
 * Del_Fta temperature difference → fog overlay color.
 * Matches KMA official fog image color scale:
 *   red (cold/0) → orange → yellow → green → teal (warm/6+)
 */
function lerp(a, b, t) {
  return a + ((b - a) * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * ratio)));
  return sorted[index];
}

function resolveIrDisplayRange(irData) {
  const sorted = Array.from(irData).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  // When IR105 values already look like brightness temperature in Kelvin,
  // use a fixed cold/warm stretch so dark oceans and bright cold cloud tops
  // stay visually consistent across frames.
  if (min >= 150 && max <= 350) {
    return {
      cold: IR_BT_COLD_K,
      warm: IR_BT_WARM_K,
      invert: false,
    };
  }

  // Fallback for non-BT encoded values: use a tighter percentile window
  // and invert the grayscale so colder-looking cloud tops remain brighter.
  return {
    cold: percentile(sorted, 0.02),
    warm: percentile(sorted, 0.98),
    invert: false,
  };
}

function irGrayByte(irValue, displayRange) {
  const { cold, warm, invert } = displayRange;
  const normalized = clamp((irValue - cold) / ((warm - cold) || 1), 0, 1);
  const scaled = invert ? (1 - normalized) : normalized;
  const curved = Math.pow(scaled, IR_DISPLAY_GAMMA);
  return Math.round(curved * 255);
}

function fogColor(delFtaVal) {
  const legendValue = Math.max(0, Math.min(6, (delFtaVal + 10) / 10));
  const stops = [
    { value: 0, rgb: [244, 34, 24] },
    { value: 1, rgb: [248, 92, 20] },
    { value: 2, rgb: [252, 148, 18] },
    { value: 3, rgb: [255, 214, 26] },
    { value: 4, rgb: [244, 238, 72] },
    { value: 5, rgb: [170, 214, 68] },
    { value: 6, rgb: [52, 168, 76] },
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const left = stops[i];
    const right = stops[i + 1];
    if (legendValue <= right.value) {
      const t = (legendValue - left.value) / (right.value - left.value || 1);
      return [
        Math.round(lerp(left.rgb[0], right.rgb[0], t)),
        Math.round(lerp(left.rgb[1], right.rgb[1], t)),
        Math.round(lerp(left.rgb[2], right.rgb[2], t)),
      ];
    }
  }

  return stops[stops.length - 1].rgb;
}

/**
 * Render a FOG composite image: IR105 grayscale background + colored fog overlay.
 */
async function renderFogImage(irParsed, fogParsed) {
  const { data: irData, attrs } = irParsed;
  const { fogData, delFta } = fogParsed;
  const { width: srcW, height: srcH, pixelSize, ulEasting, ulNorthing } = attrs;

  const outW = BASE_OUTPUT_WIDTH;
  const outH = KO_DISPLAY_GRID.height;

  const irDisplayRange = resolveIrDisplayRange(irData);

  const buf = Buffer.alloc(outW * outH * 4);
  let fogPixelCount = 0;

  for (let py = 0; py < outH; py++) {
    for (let px = 0; px < outW; px++) {
      const idx = displayPixelToSourceIndex(px, py, { width: srcW, height: srcH, pixelSize, ulEasting, ulNorthing });
      if (idx === null) continue;
      const o = (py * outW + px) * 4;

      const fogVal = fogData ? fogData[idx] : 0;
      const delta = delFta ? delFta[idx] : -32768;

      // FOG=5 (Fog) with valid Del_Fta → color overlay
      if (fogVal === 5 && delta !== -32768) {
        const [r, g, b] = fogColor(delta);
        buf[o] = r;
        buf[o + 1] = g;
        buf[o + 2] = b;
        buf[o + 3] = 220;
        fogPixelCount++;
      } else {
        // IR grayscale background: colder cloud tops brighter, warmer surfaces darker.
        const byte = irGrayByte(irData[idx], irDisplayRange);
        buf[o] = byte;
        buf[o + 1] = byte;
        buf[o + 2] = byte;
        buf[o + 3] = 200;
      }
    }
  }

  const bounds = KO_DISPLAY_GRID.bounds;

  const pngBuffer = await sharp(buf, {
    raw: { width: outW, height: outH, channels: 4 },
  }).png({ compressionLevel: 3 }).toBuffer();

  return { pngBuffer, bounds, width: outW, height: outH, fogPixelCount };
}

export { parseSatelliteNC, parseFogNC, parseCiNC, parseCtpsNC, renderFogImage }
export default { parseSatelliteNC, parseFogNC, parseCiNC, parseCtpsNC, renderFogImage }
