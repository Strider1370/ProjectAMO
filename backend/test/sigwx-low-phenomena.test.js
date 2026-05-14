import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSigwxLowPhenomena } from '../src/sigwx-low/sigwx-low-phenomena.js'

test('groups surface wind boundary and wind diamond into one phenomenon', () => {
  const result = buildSigwxLowPhenomena({
    tmfc: '2026051411',
    source: { map_range_mode: 'normal' },
    items: [
      {
        id: 'wind-area',
        item_type: 4,
        contour_name: 'sfc_wind',
        item_name: 'l_wind',
        is_close: true,
        lat_lngs: [[33, 126], [34, 126], [34, 127]],
      },
      {
        id: 'wind-speed',
        item_type: 8,
        contour_name: 'sfc_wind',
        item_name: 'wind_strong',
        shape_type: 'diamond',
        label: '30',
        lat_lngs: [[33.5, 126.5]],
      },
    ],
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].semanticRole, 'strong-surface-wind-area')
  assert.equal(result[0].items.length, 2)
  assert.equal(result[0].children[0].renderRole, 'wind-diamond-label')
})

test('groups surface wind items regardless of source order', () => {
  const result = buildSigwxLowPhenomena({
    items: [
      {
        id: 'wind-speed',
        item_type: 8,
        contour_name: 'sfc_wind',
        item_name: 'wind_strong',
        shape_type: 'diamond',
        label: '30',
        lat_lngs: [[33.5, 126.5]],
      },
      {
        id: 'wind-area',
        item_type: 4,
        contour_name: 'sfc_wind',
        item_name: 'l_wind',
        is_close: true,
        lat_lngs: [[33, 126], [34, 126], [34, 127]],
      },
    ],
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].sourceItem.id, 'wind-area')
  assert.equal(result[0].children[0].sourceItem.id, 'wind-speed')
})

test('preserves source items and cloud multiline labels', () => {
  const result = buildSigwxLowPhenomena({
    items: [{
      id: 'cloud',
      item_type: 4,
      contour_name: 'cld',
      item_name: 'cloud',
      line_type: '5',
      is_close: true,
      label: 'ISOL&#10;EMBD&#10;CB&#10;XXX&#10;010',
      lat_lngs: [[33, 126], [34, 126], [34, 127]],
    }],
  })

  assert.equal(result[0].sourceItem.id, 'cloud')
  assert.deepEqual(result[0].render.labelLines, ['ISOL', 'EMBD', 'CB', 'XXX', '010'])
})
