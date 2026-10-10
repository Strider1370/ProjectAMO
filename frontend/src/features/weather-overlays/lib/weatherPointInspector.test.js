import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAciPointRow, buildWeatherPointRows, chooseWeatherPointPlacement, createWeatherPointSamplers } from './weatherPointInspector.js'

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
  assert.equal(rows[3].value, 'SEVERE')
  assert.equal(rows[4].altitude, '3000 ft')
  assert.equal(rows[4].value, 'SEVERE · 0.800')
  assert.equal(rows[4].issueLabel, '07/24 12:00 KST')
  assert.equal(rows.slice(0, 4).every((row) => row.issueLabel === '07/24 15:00 KST'), true)
})

test('weather point placement flips left only when the right edge would clip', () => {
  assert.equal(chooseWeatherPointPlacement(300, 1259), 'right')
  assert.equal(chooseWeatherPointPlacement(1100, 1259), 'left')
  assert.equal(chooseWeatherPointPlacement(80, 1259), 'right')
})

test('GKTG NIL and missing points produce no inspector rows; LGT starts at the float32 boundary', () => {
  for (const value of [0, Math.fround(.149999), null, Math.fround(.15), Math.fround(.22), Math.fround(.34)]) {
    const gktgFields = { ktgGrid: { product: 'GKTG', grid: fields.ktgGrid.grid, level: { value: 500, unit: 'hPa' }, gktg: Array(4).fill(value) } }
    const rows = buildWeatherPointRows({ lon: 127, lat: 37, visibility: { turbulence: true }, fields: gktgFields, samplers: createWeatherPointSamplers(gktgFields) })
    if (value === null || value < .15) assert.deepEqual(rows, [])
    else {
      assert.equal(rows.length, 1)
      assert.match(rows[0].value, /^(LGT|MOD|SEV) · /)
      assert.equal(rows[0].altitude, '500 hPa')
    }
  }
})

test('a GKTG NIL point keeps the inspector rows of other active weather layers', () => {
  const gktgFields = { ...fields, ktgGrid: { product: 'GKTG', grid: fields.ktgGrid.grid, gktg: [0, 0, 0, 0] } }
  const rows = buildWeatherPointRows({ lon: 127, lat: 37, visibility: { wind: true, turbulence: true }, fields: gktgFields, samplers: createWeatherPointSamplers(gktgFields) })
  assert.deepEqual(rows.map(row => row.key), ['wind'])
})

test('a below-ground cell reads "지면 아래" for that layer only', () => {
  // 서버가 지면 아래 칸 값을 결측(-32768)으로 비우고 bitset으로 표시한다. (127, 37)은 index 3 → 첫 바이트 bit 3.
  const temperatureField = { ...fields.temperatureField, T: [27315, 26315, 26315, -32768], belowGround: 'CA==', belowGroundEncoding: 'bitset-base64-v1' }
  const withMask = { ...fields, temperatureField }
  const rows = buildWeatherPointRows({ lon: 127, lat: 37, visibility: { wind: true, temp: true }, fields: withMask, samplers: createWeatherPointSamplers(withMask) })
  assert.deepEqual(rows.map((row) => [row.key, row.value]).slice(1), [['temp', '지면 아래']])
  assert.match(rows[0].value, /^풍향/)
  const elsewhere = buildWeatherPointRows({ lon: 126, lat: 36, visibility: { temp: true }, fields: withMask, samplers: createWeatherPointSamplers(withMask) })
  assert.equal(elsewhere[0].value, '0.0 °C')
})


test('ACI point rows include score and input values with their own time, without a layer altitude', () => {
  const row = buildAciPointRow({ score: 0.67, cape: 2774, rainRate: 1.04, olr: 162.9 }, { issueLabel: '10/09 09:00 KST', validLabel: '10/09 21:00 KST' })
  assert.equal(row.label, '대류영역')
  assert.equal(row.value, '점수 0.670')
  assert.equal(row.validLabel, '10/09 21:00 KST')
  assert.equal(row.altitude, undefined)
  assert.match(row.detail, /CAPE 2774 J\/kg · 강수 1.04 mm\/h · OLR 162.9 W\/m²/)
  assert.equal(buildAciPointRow({ score: 0, cape: 0, rainRate: 0, olr: 250 }).value, '점수 0.000')
  assert.equal(buildAciPointRow({ score: null }).value, '자료 없음')
})
