import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('2026051411 sample contains known rendering combinations', () => {
  const sample = JSON.parse(fs.readFileSync(path.join(projectRoot, 'reference/sigwx_low_samples/2026051411/parsed.json'), 'utf8'))
  const keys = new Set(sample.items.map((item) => [
    item.item_type,
    item.contour_name || '',
    item.item_name || '',
    item.icon_name || '',
    item.shape_type || '',
    item.line_type || '',
    item.is_close ? 'closed' : 'open',
  ].join(' | ')))

  assert.ok(keys.has('4 | freezing_level |  |  |  | 3 | open'))
  assert.ok(keys.has('4 | sfc_wind | l_wind |  |  | 1 | closed'))
  assert.ok(keys.has('8 | sfc_wind | wind_strong |  | diamond | 1 | open'))
  assert.ok(keys.has('4 | cld | cloud |  |  | 5 | closed'))
  assert.ok(keys.has('7 | mountain_obscu | mountain_obscuration | mountain_obscuration.png |  | 1 | open'))
})
