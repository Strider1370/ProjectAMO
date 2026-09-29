import test from 'node:test'
import assert from 'node:assert/strict'

import { AVIATION_WFS_LAYERS, FIR_COLOR_ON_GRAY, firColorForBasemap } from './aviationWfsLayers.js'

// 어두운 위성 배경에서는 회청색 FIR 선이 묻히므로 밝은 색으로 바꾼다.
test('FIR turns light on the satellite basemap and keeps its own color elsewhere', () => {
  const base = AVIATION_WFS_LAYERS.find((l) => l.id === 'fir').color
  assert.equal(firColorForBasemap('satellite'), FIR_COLOR_ON_GRAY)
  for (const id of ['standard', 'outline', 'outline-green', 'outline-slate']) assert.equal(firColorForBasemap(id), base)
})
