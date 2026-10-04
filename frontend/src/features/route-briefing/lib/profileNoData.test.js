import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProfileNoDataAreas } from './profileNoData.js'

const values = ok => [0, 10, 20, 30].map((d, i) => ({ distanceNm: d, u: ok(i) ? 10 : null, v: ok(i) ? 0 : null }))
const levels = [{ pressure: 500, altFt: 18000, values: values(i => i >= 2) }, { pressure: 150, altFt: 46000, values: values(i => i >= 2) }]
const args = { levels, xFor: d => d * 10, yFor: ft => 1000 - ft / 100, altFor: l => l.altFt, plotLeft: 0, plotRight: 300 }

test('marks the area above the top level and outside the collection area', () => {
  const areas = buildProfileNoDataAreas({ ...args, yMax: 60000 })
  assert.equal(areas[0].label, '자료 없음 (150 hPa 위)')
  assert.equal(areas[0].h, (1000 - 460) - (1000 - 600))
  const side = areas.find(a => a.key.startsWith('side'))
  assert.deepEqual([side.x, side.w], [0, 150])
  assert.equal(areas[0].labelX, 158) // 150 hPa 위 글자는 왼쪽 영역 밖 구간을 피한다
})

test('no top band when the chart stays below the top level', () => {
  assert.ok(!buildProfileNoDataAreas({ ...args, yMax: 40000 }).some(a => a.key === 'top'))
})

test('a column with cloud data but no wind is not outside the collection area', () => {
  const cloudOnly = [{ pressure: 700, altFt: 10000, values: [0, 10, 20].map(d => ({ distanceNm: d, u: null, v: null, cld: 0.7 })) }]
  const areas = buildProfileNoDataAreas({ levels: cloudOnly, xFor: d => d * 10, yFor: ft => 1000 - ft / 100, altFor: l => l.altFt, yMax: 15000, plotLeft: 0, plotRight: 200 })
  assert.equal(areas.some(a => a.key.startsWith('side')), false)
})
