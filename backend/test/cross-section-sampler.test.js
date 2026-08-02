import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sampleGridAt, buildCrossSection } from '../src/briefing/cross-section-sampler.js'

const grid2x2 = { nx: 2, ny: 2, lonMin: 0, lonMax: 1, latMin: 0, latMax: 1 }

test('sampleGridAt nearest-neighbour indexing', () => {
  const values = [10, 20, 30, 40] // y*nx + x ; (x0y0,x1y0,x0y1,x1y1)
  assert.equal(sampleGridAt(grid2x2, values, 0.0, 0.0), 10)
  assert.equal(sampleGridAt(grid2x2, values, 1.0, 1.0), 40)
  assert.equal(sampleGridAt(grid2x2, values, 5, 5), null) // out of grid
})

test('buildCrossSection assembles levels with altFt from hgt and per-variable coverage', () => {
  const axis = { samples: [{ lon: 0, lat: 0, distanceNm: 0 }, { lon: 1, lat: 1, distanceNm: 10 }] }
  const loadLevel = (levelId) => {
    if (levelId === '500hPa') return {
      pressure: 500,
      values: [
        { distanceNm: 0, T: 253, hgt: 5500, u: 10, v: 0, spread: 5, icing: 1, cld: .72 },
        { distanceNm: 10, T: 256, hgt: 5500, u: 10, v: 0, spread: 6, icing: 2, cld: Number.NaN },
      ],
    }
    return null
  }
  const cs = buildCrossSection({
    axis,
    run: { tmfc: '2026060600', hf: 6, validTime: '2026-06-06T06:00:00Z' },
    levelIds: ['500hPa', '300hPa'],
    loadLevel,
  })
  assert.equal(cs.levels.length, 1)
  const l = cs.levels[0]
  assert.equal(l.pressure, 500)
  assert.ok(Math.abs(l.altFt - 5500 * 3.28084) < 1)
  assert.equal(l.values.length, 2)
  assert.equal(l.values[0].distanceNm, 0)
  assert.equal(typeof l.values[0].t, 'number')
  assert.equal(cs.coverage.byVariable.T.available, true)
  assert.equal(cs.coverage.byVariable.T.topPressure, 500)
  assert.equal(l.values[0].cld, .72)
  assert.equal(l.values[1].cld, null)
  assert.deepEqual(cs.coverage.byVariable.cld, { available: true, topPressure: 500, threshold: .6, unit: '1' })
})

test('buildCrossSection reports unavailable CLD without finite samples', () => {
  const cs = buildCrossSection({ axis: { samples: [] }, run: {}, levelIds: ['500hPa'], loadLevel: () => ({ pressure: 500, values: [{ distanceNm: 0, cld: Number.NaN }] }) })
  assert.deepEqual(cs.coverage.byVariable.cld, { available: false, topPressure: null, threshold: .6, unit: '1' })
})
