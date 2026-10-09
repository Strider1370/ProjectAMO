import test from 'node:test'
import assert from 'node:assert/strict'
import { experimentFrameAt } from './turbulenceExperimentModel.js'
import { validateExperimentField } from './useTurbulenceExperiment.js'
import { getNextMetVisibility } from './metLayerVisibility.js'

const times = [{ hf: 6, validTime: '2026-09-10T12:00:00.000Z' }, { hf: 9, validTime: '2026-09-10T15:00:00.000Z' }]
test('historical test frames do not clamp the current date to old weather', () => {
  assert.equal(experimentFrameAt(times, Date.parse('2026-10-03T12:00:00Z')), null)
  assert.equal(experimentFrameAt(times, Date.parse('2026-09-10T12:45:00Z')).hf, 6)
  assert.equal(experimentFrameAt(times, Date.parse('2026-09-10T14:00:00Z')).hf, 9)
})
test('boundary rejects mismatched run, hour, level, units, colour scale or payload', () => {
  const index = { revision: 'a'.repeat(20), tmfc: '2026091006', algorithm: 'test', times,
    grid: { nx: 2, ny: 2, lonMin: 124, lonMax: 125, latMin: 30, latMax: 31 },
    diagnostics: [{ id: 'gktg', unit: 'm⅔ s⁻¹', colorMax: .5 }] }
  const selection = { hf: 6, level: '500hPa', diagnostic: 'gktg' }
  const field = { type: 'kim_turbulence_experiment_field', experimental: true,
    revision: index.revision, tmfc: index.tmfc, algorithm: index.algorithm, hf: 6, validTime: times[0].validTime,
    grid: index.grid, level: { id: '500hPa' }, diagnostic: index.diagnostics[0], values: [0, .1, null, .3] }
  assert.equal(validateExperimentField(field, index, selection), field)
  for (const patch of [{ hf: 9 }, { tmfc: '2026092306' }, { level: { id: '300hPa' } },
    { diagnostic: { ...field.diagnostic, colorMax: 1 } }, { values: [0, .1, -.1, .3] }, { values: [0] }]) {
    assert.throws(() => validateExperimentField({ ...field, ...patch }, index, selection))
  }
})
test('GKTG uses the existing turbulence button and shares pressure controls', () => {
  // 바람과 같은 KIM 고도를 쓰므로 바람과는 함께 켜지고, 구름·착빙을 켜면 꺼진다.
  const on = getNextMetVisibility({ wind: true, turbulence: false, radarHsr: false }, 'turbulence')
  assert.equal(on.turbulence, true)
  assert.equal(on.wind, true)
  assert.equal(getNextMetVisibility(on, 'icing').turbulence, false)
})
