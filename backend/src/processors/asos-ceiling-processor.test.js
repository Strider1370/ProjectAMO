import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAsosCeiling, ASOS_STATIONS } from './asos-ceiling-processor.js'

test('CH_MIN -9는 결측이므로 제외한다', () => {
  // 46필드, 28번째가 CH_MIN
  const row = (stn, ch) => Array.from({length: 46}, (_, i) =>
    i === 1 ? stn : i === 27 ? ch : '0').join(' ')
  const text = `#START7777\n${row('108', '-9')}\n${row('112', '10')}\n#7777END`
  const out = parseAsosCeiling(text)
  assert.equal(out.length, 1)
  assert.equal(out[0].stn, 112)
  assert.equal(Math.round(out[0].ceiling_ft), 3281)   // 10 × 100 m × 3.281
})

test('지점명이 깨지지 않는다', () => {
  const seoul = ASOS_STATIONS.find((s) => s.stn === 108)
  assert.equal(seoul.name, '서울')
  assert.equal(Buffer.from(seoul.name, 'utf8').length, 6)   // 한글 2자 = UTF-8 6바이트
})
