import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseSfcAscii, sfcPixelToLatLon, SFC_W, SFC_H } from './sfc-grid-parser.js'

const fixture = JSON.parse(
  fs.readFileSync(new URL('../../test/fixtures/sfc-grid-samples.json', import.meta.url), 'utf8'),
)

test('격자 좌표가 원본 .nc 값과 100m 이내로 일치', () => {
  for (const s of fixture.samples) {
    // 픽스처 row는 남쪽 우선, sfcPixelToLatLon은 북쪽 우선을 받는다.
    const { lat, lon } = sfcPixelToLatLon(s.col, SFC_H - 1 - s.row)
    const dLat = (lat - s.lat) * 111.0
    const dLon = (lon - s.lon) * 111.0 * Math.cos((s.lat * Math.PI) / 180)
    const dist = Math.hypot(dLat, dLon)
    assert.ok(dist < 0.1, `row=${s.row} col=${s.col} 오차 ${dist.toFixed(3)}km`)
  }
})

test('결측 -999는 -1로, 유효값은 km에서 m로 변환된다', () => {
  const body = new Array(SFC_W * SFC_H).fill('-999.0')
  body[0] = '5.0'
  const text = `  2049,  2049,=\n${body.join(',')}`
  const grid = parseSfcAscii(text)
  // 파서가 행을 뒤집으므로 남쪽 첫 칸은 마지막 행으로 간다.
  assert.equal(grid[(SFC_H - 1) * SFC_W], 5000)
  assert.equal(grid[1], -1)
})
