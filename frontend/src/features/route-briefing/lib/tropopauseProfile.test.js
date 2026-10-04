import test from 'node:test'
import assert from 'node:assert/strict'
import { altitudeAtPressure, buildTropopauseProfileLayers } from './tropopauseProfile.js'

const altFor = level => level.altFt
const levels = [500, 400, 300, 250, 200, 150].map((pressure, k) => ({
  pressure, altFt: [18300, 23600, 30100, 34000, 38700, 44600][k],
  values: [0, 50, 100].map(distanceNm => ({ distanceNm, u: pressure === 250 ? 60 : 20, v: 0, t: -20 - k * 10 })),
}))
const xFor = d => d * 2, yFor = ft => 1000 - ft / 100

test('pressure maps to chart altitude in log pressure', () => {
  assert.equal(altitudeAtPressure(levels, altFor, 250), 34000)
  assert.ok(Math.abs(altitudeAtPressure(levels, altFor, 225) - 36380) < 400)
  assert.equal(altitudeAtPressure(levels, altFor, 100), null)
})

test('tropopause line stays inside the chart and a higher tropopause is marked above it', () => {
  const tropopause = { available: true, samples: [
    { distanceNm: 0, tropopauseHpa: 250, tropopauseFt: 34000 },
    { distanceNm: 50, tropopauseHpa: 240, tropopauseFt: 34600 },
    { distanceNm: 100, tropopauseHpa: 120, tropopauseFt: 49000 },
  ] }
  const layers = buildTropopauseProfileLayers({ crossSection: { levels, tropopause }, xFor, yFor, altFor, yMax: 40000 })
  assert.equal(layers.tropopause.chains.length, 1)
  assert.equal(layers.tropopause.chains[0].length, 2)
  // 성층권 면은 경계선에서 차트 상단(yMax)까지 닫힌다.
  assert.deepEqual(layers.tropopause.areas[0].slice(-2).map(p => p.y), [yFor(40000), yFor(40000)])
  assert.match(layers.tropopause.labels[0].text, /^TROP 3[45]0$/)
  assert.equal(layers.tropopause.aboveLabel.text, 'TROP 490 ▲')
})

test('isotachs every 20 kt from 80 kt up to the section maximum, with labels and one core per jet', () => {
  const layers = buildTropopauseProfileLayers({ crossSection: { levels, tropopause: null }, xFor, yFor, altFor, yMax: 40000 })
  assert.deepEqual(layers.isotachs.map(i => [i.kt, i.major]), [[80, true], [100, false]]) // max ≈ 117 kt
  assert.ok(layers.isotachs[0].chains.length >= 1)
  assert.ok(layers.isotachLabels.some(l => l.text === '80'))
  assert.deepEqual(layers.jetCores.map(c => c.text), ['115 kt FL340'])
  assert.equal(layers.jetCores[0].y, yFor(34000))
  assert.deepEqual(buildTropopauseProfileLayers({ crossSection: { levels, tropopause: null }, xFor, yFor, altFor, yMax: 30000 }).jetCores, [])
})

test('two separate jets each get a core', () => {
  const twin = levels.map(l => ({ ...l, values: [0, 50, 100, 150, 200].map((distanceNm, i) => ({ distanceNm, u: l.pressure === 250 && i !== 2 ? (i < 2 ? 60 : 50) : 20, v: 0, t: -40 })) }))
  const twinX = d => d * 2
  const layers = buildTropopauseProfileLayers({ crossSection: { levels: twin, tropopause: null }, xFor: twinX, yFor, altFor, yMax: 40000 })
  assert.equal(layers.jetCores.length, 0) // 2-cell regions are noise
  const wide = levels.map(l => ({ ...l, values: Array.from({ length: 9 }, (_, i) => ({ distanceNm: i * 25, u: (l.pressure === 250 || l.pressure === 200) && i !== 4 ? (i < 4 ? 60 : 50) : 20, v: 0, t: -40 })) }))
  const two = buildTropopauseProfileLayers({ crossSection: { levels: wide, tropopause: null }, xFor: twinX, yFor, altFor, yMax: 40000 })
  assert.deepEqual(two.jetCores.map(c => c.kt), [115, 95])
})

test('100/70 hPa winds from the tropopause section close the 80 kt line above 150 hPa', () => {
  const top = l => ({ ...l, values: l.values.map(v => ({ ...v, u: 50, v: 0 })) }) // ~97 kt
  const strong = levels.map(l => (l.pressure <= 200 ? top(l) : l))
  const upperLevels = [100, 70].map((pressure, k) => ({ pressure, altFt: [53000, 60000][k], values: strong[0].values.map(v => ({ ...v, u: 20, v: 0 })) }))
  const open = buildTropopauseProfileLayers({ crossSection: { levels: strong, tropopause: null }, xFor, yFor, altFor, yMax: 65000 })
  const closed = buildTropopauseProfileLayers({ crossSection: { levels: strong, tropopause: { available: false, upperLevels } }, xFor, yFor, altFor, yMax: 65000 })
  const topY = chains => Math.min(...chains.flatMap(c => c.map(p => p.y)))
  assert.equal(open.isotachs[0].chains.some(c => c.some(p => p.y < yFor(44600))), false)
  assert.ok(topY(closed.isotachs[0].chains) < yFor(44600)) // line now closes above the 150 hPa level
})

test('a tropopause above 150 hPa is drawn inside a tall chart when 100/70 hPa levels are present', () => {
  const upperLevels = [100, 70].map((pressure, k) => ({ pressure, altFt: [53000, 60000][k], values: levels[0].values.map(v => ({ ...v, u: 10, v: 0 })) }))
  const tropopause = { available: true, upperLevels, samples: [0, 50, 100].map(distanceNm => ({ distanceNm, tropopauseHpa: 110, tropopauseFt: 51000 })) }
  const layers = buildTropopauseProfileLayers({ crossSection: { levels, tropopause }, xFor, yFor, altFor, yMax: 65000 })
  assert.equal(layers.tropopause.chains.length, 1)
  assert.equal(layers.tropopause.aboveLabel, null)
  const without = buildTropopauseProfileLayers({ crossSection: { levels, tropopause: { ...tropopause, upperLevels: [] } }, xFor, yFor, altFor, yMax: 65000 })
  assert.equal(without.tropopause.chains.length, 0)
})

test('a jump of more than 5,000 ft splits the tropopause into two separate pieces', () => {
  const upperLevels = [100, 70].map((pressure, k) => ({ pressure, altFt: [53000, 60000][k], values: levels[0].values.map(v => ({ ...v, u: 10, v: 0 })) }))
  const samples = [0, 40, 80, 120, 160].map((distanceNm, i) => i < 2 ? { distanceNm, tropopauseHpa: 230, tropopauseFt: 36000 } : { distanceNm, tropopauseHpa: 110, tropopauseFt: 51000 })
  const layers = buildTropopauseProfileLayers({ crossSection: { levels, tropopause: { available: true, upperLevels, samples } }, xFor, yFor, altFor, yMax: 65000 })
  assert.equal(layers.tropopause.chains.length, 2)
  assert.equal(layers.tropopause.areas.length, 2)
  assert.deepEqual(layers.tropopause.labels.map(l => l.text), ['TROP 360', 'TROP 510'])
})
