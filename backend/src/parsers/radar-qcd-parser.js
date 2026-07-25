// KMA 레이더 사이트 QCD(CF-Radial v2.2, HDF5) 리더. h5wasm는 이미 위성 파서가 쓰는 의존성이다.
// 여기서는 읽기만 하고 과학 계산은 하지 않는다(계산은 echo-top-model.js).
import { randomUUID } from 'node:crypto'

const FIVE_MIN_MS = 5 * 60 * 1000

function attrValue(attr) {
  if (attr == null) return null
  const raw = typeof attr === 'object' && 'value' in attr ? attr.value : attr
  if (ArrayBuffer.isView(raw) && raw.length > 0) return raw.length === 1 ? Number(raw[0]) : raw
  if (Array.isArray(raw) && raw.length === 1) return raw[0]
  return raw
}

function datasetValue(file, name) {
  const dataset = file.get(name)
  if (!dataset) throw new Error(`Missing required dataset: ${name}`)
  return dataset.value
}

function firstNumber(value, fallback = null) {
  if (value == null) return fallback
  if (ArrayBuffer.isView(value) || Array.isArray(value)) return value.length ? Number(value[0]) : fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function charArrayToString(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    return String.fromCharCode(...Array.from(value).filter(c => c !== 0))
  }
  return String(value)
}

export async function parseQcdVolume(buffer, { stn } = {}) {
  const h5wasm = await import('h5wasm')
  await h5wasm.ready
  const name = `/qcd-${randomUUID()}.h5`
  h5wasm.FS.writeFile(name, new Uint8Array(buffer))
  const file = new h5wasm.File(name, 'r')

  try {
    const dbzhDataset = file.get('DBZH')
    if (!dbzhDataset) throw new Error('Missing required dataset: DBZH')
    const attrs = dbzhDataset.attrs || {}
    const scaleFactor = firstNumber(attrValue(attrs.scale_factor), 1)
    const fillValue = firstNumber(attrValue(attrs._FillValue), -32768)
    const dbz = dbzhDataset.value

    const rangeM = Float32Array.from(datasetValue(file, 'range'))
    const elevation = Float32Array.from(datasetValue(file, 'elevation'))
    const azimuth = Float32Array.from(datasetValue(file, 'azimuth'))
    const sweepStart = Int32Array.from(datasetValue(file, 'sweep_start_ray_index'))
    const sweepEnd = Int32Array.from(datasetValue(file, 'sweep_end_ray_index'))

    const gateCount = rangeM.length
    const sweeps = []

    // CF-Radial ragged arrays: ray_n_gates and ray_start_index allow variable gates per ray
    const rayNGatesDataset = file.get('ray_n_gates')
    const rayStartIndexDataset = file.get('ray_start_index')
    const hasRagged = rayNGatesDataset && rayStartIndexDataset

    for (let s = 0; s < sweepStart.length; s += 1) {
      const start = sweepStart[s]
      const end = sweepEnd[s]
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) continue

      const rays = end - start + 1
      let sweepDbz

      if (hasRagged) {
        // Ragged layout: each ray has variable gate count, pad to uniform gateCount for Task 4
        const rayNGates = Uint32Array.from(rayNGatesDataset.value)
        const rayStartIndex = Uint32Array.from(rayStartIndexDataset.value)

        sweepDbz = new Int16Array(rays * gateCount).fill(fillValue)

        for (let r = 0; r < rays; r++) {
          const rayIdx = start + r
          const nGates = rayNGates[rayIdx]
          const srcIdx = rayStartIndex[rayIdx]

          if (srcIdx + nGates > dbz.length) {
            throw new Error(`Ragged index out of bounds: ray ${rayIdx} exceeds DBZH length`)
          }

          const destOffset = r * gateCount
          for (let g = 0; g < nGates; g++) {
            sweepDbz[destOffset + g] = dbz[srcIdx + g]
          }
        }
      } else {
        // Uniform layout: all rays have gateCount gates
        const startIdx = start * gateCount
        const endIdx = (end + 1) * gateCount
        if (endIdx > dbz.length) {
          throw new Error(`Uniform index out of bounds: sweep ${s} exceeds DBZH length`)
        }
        sweepDbz = dbz.slice(startIdx, endIdx)
      }

      sweeps.push({
        elevationDeg: elevation[start],
        azimuthDeg: azimuth.slice(start, end + 1),
        dbz: sweepDbz,
        scaleFactor,
        fillValue,
        rayCount: rays,
      })
    }

    const rootAttrs = file.attrs || {}

    // Try to get time_coverage_start and time_coverage_end
    // They can be root attributes or datasets, and may be strings or character arrays
    let timeCoverageStart = ''
    let timeCoverageEnd = ''

    try {
      const tcsAttr = attrValue(rootAttrs.time_coverage_start)
      if (tcsAttr) {
        timeCoverageStart = charArrayToString(tcsAttr)
      } else {
        const tcsDataset = file.get('time_coverage_start')
        if (tcsDataset) {
          timeCoverageStart = charArrayToString(tcsDataset.value)
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      const tceAttr = attrValue(rootAttrs.time_coverage_end)
      if (tceAttr) {
        timeCoverageEnd = charArrayToString(tceAttr)
      } else {
        const tceDataset = file.get('time_coverage_end')
        if (tceDataset) {
          timeCoverageEnd = charArrayToString(tceDataset.value)
        }
      }
    } catch (e) {
      // ignore
    }

    return {
      stn: stn || String(attrValue(rootAttrs.instrument_name) || '').trim() || 'UNKNOWN',
      latitude: firstNumber(datasetValue(file, 'latitude')),
      longitude: firstNumber(datasetValue(file, 'longitude')),
      altitudeM: firstNumber(datasetValue(file, 'altitude'), 0),
      rangeM,
      sweeps,
      timeCoverageStart,
      timeCoverageEnd,
    }
  } finally {
    file.close()
    try { h5wasm.FS.unlink(name) } catch { /* 임시 파일은 이미 정리됐을 수 있다 */ }
  }
}

export function observedBucketMs(volume) {
  const ms = Date.parse(volume?.timeCoverageStart || '')
  return Number.isFinite(ms) ? Math.floor(ms / FIVE_MIN_MS) * FIVE_MIN_MS : null
}

export function isSameFiveMinuteBucket(observedMs, requestedMs) {
  if (!Number.isFinite(observedMs) || !Number.isFinite(requestedMs)) return false
  return Math.floor(observedMs / FIVE_MIN_MS) === Math.floor(requestedMs / FIVE_MIN_MS)
}
