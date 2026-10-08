import test from 'node:test'
import assert from 'node:assert/strict'

import {
  WIND_SPEED_COLOR_RAMP,
  createDownsampledWindField,
  createWindFieldSampler,
  decodeWindComponent,
  formatKimWindMetaLabel,
  interpolateWindSpeedColor,
  pickWindSpeedColor,
} from './windField.js'

const FIELD = {
  type: 'kim_surface_wind',
  encoding: 'int16-scaled-json-v1',
  scale: 0.01,
  offset: 0,
  grid: {
    nx: 2,
    ny: 2,
    lonMin: 126,
    latMin: 36,
    lonMax: 127,
    latMax: 37,
    dx: 1,
    dy: 1,
  },
  time: {
    tmfc: '2026051800',
    hf: 3,
    validTime: '2026-05-18T03:00:00.000Z',
  },
  u: [0, 1000, 2000, 3000],
  v: [0, 0, 1000, 1000],
}

test('decodeWindComponent applies int16 scale and offset', () => {
  assert.equal(decodeWindComponent(1234, FIELD), 12.34)
})

test('createWindFieldSampler returns 2x2 bilinear interpolation results', () => {
  const sampler = createWindFieldSampler(FIELD)
  const vector = sampler.sample(126.5, 36.5)

  assert.equal(vector.u, 15)
  assert.equal(vector.v, 5)
  assert.equal(Number(vector.speed.toFixed(3)), 15.811)
})

test('createWindFieldSampler returns null outside the grid', () => {
  const sampler = createWindFieldSampler(FIELD)

  assert.equal(sampler.sample(125.99, 36.5), null)
  assert.equal(sampler.sample(126.5, 37.01), null)
})

test('createWindFieldSampler samples exact max bounds when dx/dy are rounded', () => {
  const field = {
    encoding: 'int16-scaled-json-v1',
    scale: 0.01,
    offset: 0,
    grid: {
      nx: 205,
      ny: 169,
      lonMin: 119,
      latMin: 30,
      lonMax: 136,
      latMax: 44,
      dx: 0.083333,
      dy: 0.083333,
    },
    u: Array.from({ length: 205 * 169 }, (_, index) => index),
    v: Array.from({ length: 205 * 169 }, () => 0),
  }
  const sampler = createWindFieldSampler(field)

  assert.equal(sampler.sample(136, 44).u, (205 * 169 - 1) * 0.01)
})

test('createDownsampledWindField keeps bounds and samples a coarser grid', () => {
  const source = {
    encoding: 'int16-scaled-json-v1',
    scale: 1,
    offset: 0,
    grid: {
      nx: 5,
      ny: 5,
      lonMin: 126,
      latMin: 36,
      lonMax: 130,
      latMax: 40,
      dx: 1,
      dy: 1,
    },
    u: Array.from({ length: 25 }, (_, index) => index),
    v: Array.from({ length: 25 }, () => 0),
  }

  const downsampled = createDownsampledWindField(source, 2)

  assert.equal(downsampled.encoding, undefined)
  assert.deepEqual(downsampled.grid, {
    nx: 3,
    ny: 3,
    lonMin: 126,
    latMin: 36,
    lonMax: 130,
    latMax: 40,
    dx: 2,
    dy: 2,
  })
  assert.deepEqual(downsampled.u, [0, 2, 4, 10, 12, 14, 20, 22, 24])
  assert.deepEqual(downsampled.v, [0, 0, 0, 0, 0, 0, 0, 0, 0])
})

test('wind speed ramp keeps fixed thresholds with kt display labels', () => {
  assert.deepEqual(WIND_SPEED_COLOR_RAMP.map((entry) => entry.label), [
    '0-5 kt', '5-10 kt', '10-15 kt', '15-20 kt', '20-25 kt', '25-30 kt',
    '30-40 kt', '40-60 kt', '60-80 kt', '80-100 kt', '100-130 kt', '130+ kt',
  ])
  assert.equal(pickWindSpeedColor(1).label, '0-5 kt')
  assert.equal(pickWindSpeedColor(70).label, '130+ kt')
  // 저층 바람이 몰린 0~30 kt는 5 kt마다 색이 바뀐다.
  assert.equal(new Set(WIND_SPEED_COLOR_RAMP.slice(0, 6).map((entry) => entry.color)).size, 6)
})

test('interpolateWindSpeedColor only blends near speed bin boundaries', () => {
  const kt = (value) => value * 0.514444
  assert.equal(interpolateWindSpeedColor(0), WIND_SPEED_COLOR_RAMP[0].color)
  assert.equal(interpolateWindSpeedColor(kt(12.5)), WIND_SPEED_COLOR_RAMP[2].color)
  assert.equal(interpolateWindSpeedColor(70), WIND_SPEED_COLOR_RAMP.at(-1).color)
  const boundary = interpolateWindSpeedColor(kt(5))
  assert.notEqual(boundary, WIND_SPEED_COLOR_RAMP[0].color)
  assert.notEqual(boundary, WIND_SPEED_COLOR_RAMP[1].color)
})

test('formatKimWindMetaLabel renders a compact model height and valid time label', () => {
  assert.equal(formatKimWindMetaLabel(FIELD), 'KIM 8km · 10m · 05/18 12:00 KST')
})


test('formatKimWindMetaLabel renders selected pressure level', () => {
  const field = {
    ...FIELD,
    level: { id: '925hPa', label: '925', kind: 'pressure', value: 925, unit: 'hPa' },
  }

  assert.equal(formatKimWindMetaLabel(field), 'KIM 8km \u00b7 925hPa \u00b7 05/18 12:00 KST')
})

test('the int16 missing marker decodes as missing wind, not -327.68 m/s', async () => {
  const { decodeWindComponent } = await import('./windField.js')
  const field = { encoding: 'int16-scaled-json-v1', scale: 0.01, offset: 0 }
  assert.equal(decodeWindComponent(-32768, field), null)
  assert.equal(decodeWindComponent(-32767, field), -327.67)
})
