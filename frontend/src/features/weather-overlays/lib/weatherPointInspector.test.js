import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWeatherPointRows, chooseWeatherPointPlacement, createWeatherPointSamplers } from './weatherPointInspector.js'

const fields = {
  windField: {
    level: { value: 850, unit: 'hPa' },
    grid: { nx: 2, ny: 2, lonMin: 126, latMin: 36, lonMax: 127, latMax: 37 },
    u: [0, 1000, 2000, 3000], v: [0, 0, 1000, 1000], encoding: 'int16-scaled-json-v1', scale: 0.01,
    geopotentialHeight: [1450, 1460, 1470, 1480],
    geopotentialHeightEncoding: { encoding: 'int16-scaled-json-v1', scale: 1, offset: 0, missing: -32768 },
  },
  temperatureField: {
    level: { value: 850, unit: 'hPa' },
    grid: { nx: 2, ny: 2, lonMin: 126, latMin: 36, lonMax: 127, latMax: 37 },
    T: [27315, 26315, 26315, 27315], encoding: 'int16-scaled-json-v1', scale: 0.01,
  },
  cloudField: {
    level: { value: 850, unit: 'hPa' },
    grid: { nx: 2, ny: 2, lonMin: 126, latMin: 36, lonMax: 127, latMax: 37 },
    spread: [1, 2, 3, 4],
  },
  icingField: {
    level: { value: 850, unit: 'hPa' },
    grid: { nx: 2, ny: 2, lonMin: 126, latMin: 36, lonMax: 127, latMax: 37 },
    icingScore: [0, 2000, 3000, 8000],
    icingGrade: [0, 1, 2, 3],
    fieldEncoding: {
      icingScore: { encoding: 'int16-scaled-json-v1', scale: 0.0001 },
      icingGrade: { encoding: 'ordinal-json-v1', scale: 1 },
    },
  },
  ktgGrid: {
    altFt: 3000,
    grid: { nx: 2, ny: 2, lonMin: 126, latMin: 36, lonMax: 127, latMax: 37 },
    ktg: [0.2, 0.32, 0.52, 0.8],
  },
}

test('weather point rows combine active KIM values with time, altitude, and color', () => {
  const rows = buildWeatherPointRows({
    lon: 127,
    lat: 37,
    visibility: { wind: true, temp: true, cloud: true, icing: true, turbulence: true },
    fields,
    samplers: createWeatherPointSamplers(fields),
    issueLabel: '07/24 15:00 KST',
    validLabel: '07/25 15:00 KST',
    turbulenceIssueLabel: '07/24 12:00 KST',
    turbulenceValidLabel: '07/24 18:00 KST',
  })

  assert.deepEqual(rows.map((row) => row.key), ['wind', 'temp', 'cloud', 'icing', 'turbulence'])
  assert.equal(rows[0].altitude, '850 hPa')
  assert.match(rows[0].value, /^풍향 \d{3}° · .* kt$/)
  assert.equal(rows[0].geopotentialHeight, '예측 1,480 m MSL')
  assert.equal(rows[0].detail, undefined)
  assert.equal(rows[1].value, '0.0 °C')
  assert.equal(rows[1].detail, undefined)
  assert.equal(rows[2].detail, '이슬점 편차 (T−Td)')
  assert.equal(rows[3].value, 'Severe potential')
  assert.equal(rows[4].altitude, '3000 ft')
  assert.equal(rows[4].value, 'SEV · 0.800')
  assert.equal(rows[4].issueLabel, '07/24 12:00 KST')
  assert.equal(rows.slice(0, 4).every((row) => row.issueLabel === '07/24 15:00 KST'), true)
})

test('weather point placement flips left only when the right edge would clip', () => {
  assert.equal(chooseWeatherPointPlacement(300, 1259), 'right')
  assert.equal(chooseWeatherPointPlacement(1100, 1259), 'left')
  assert.equal(chooseWeatherPointPlacement(80, 1259), 'right')
})
