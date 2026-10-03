import { KIM_NWP_LEVELS, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { writeKimGktgField, publishKimGktgRun } from '../src/processors/kim-nwp-store.js'

export function seedGktg(root, { tmfc = '2099010100', hours = [0], revision = 'a'.repeat(20), value = Math.fround(.22), grid = { nx: 2, ny: 2, lonMin: 124, lonMax: 130, latMin: 33, latMax: 40 } } = {}) {
  const entries = []
  for (const hf of hours) for (const [k, level] of KIM_NWP_LEVELS.filter(l => l.kind === 'pressure').entries()) {
    const inputRevision = 'b'.repeat(20)
    const field = { type: 'kim_nwp_gktg', product: 'GKTG', model: 'KIMG/NE57', time: { tmfc, hf, validTime: addForecastHours(tmfc, hf) }, grid, level,
      revision, inputRevision, encoding: 'float32-json-v1', gktg: Array(grid.nx * grid.ny).fill(value), geopotentialHeight: Array(grid.nx * grid.ny).fill(k * 500), geopotentialHeightEncoding: { encoding: 'float32-json-v1', unit: 'm' } }
    const file = writeKimGktgField(root, field)
    entries.push({ hf, levelId: level.id, validTime: field.time.validTime, variables: ['gktg'], hashes: { gktg: revision }, revision, inputRevision, grid, path: file })
  }
  return publishKimGktgRun(root, { tmfc, revision, expectedHours: hours, entries, algorithm: 'kim-gktg-python-v5' })
}
