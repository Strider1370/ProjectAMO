import test from 'node:test'
import assert from 'node:assert/strict'

import { RADAR_RAINRATE_LEGEND } from './weatherOverlayLayers.js'
import { HCI_LEGEND, buildRasterLegendModel } from './rasterLegendModel.js'

test('reuses every verified KMA HSR band and preserves verified HCI labels and colors', () => {
  assert.deepEqual(
    RADAR_RAINRATE_LEGEND.map(({ label }) => label).reverse(),
    ['0.0', '0.1', '0.5', '1.0', '2', '3', '4', '5', '6', '7', '8', '9', '10', '15', '20', '25', '30', '40', '50', '60', '70', '90', '110', '150'],
  )
  assert.deepEqual(HCI_LEGEND, [
    { label: '우박', color: 'rgb(255, 51, 0)' },
    { label: '비', color: 'rgb(51, 102, 255)' },
    { label: '눈', color: 'rgb(255, 102, 255)' },
    { label: '빙정', color: 'rgb(245, 255, 102)' },
    { label: '비강수없음', color: 'rgb(210, 210, 210)' },
  ])
})

test('shows only horizontal legends with an enabled layer and a selected frame', () => {
  assert.deepEqual(buildRasterLegendModel({
    visibility: { radarHsr: true, radarHci: true },
    hsrFrame: { path: '/hsr.webp' },
    hciFrame: null,
    wissdomFrame: { path: '/wissdom.webp' },
  }), {
    hsrVisible: true,
    hciVisible: false,
    wissdomVisible: true,
  })
})
