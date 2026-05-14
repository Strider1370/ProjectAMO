import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSigwxSpecialLineFeatures } from '../src/sigwx-low/sigwx-low-special-lines.js'

const source = {
  map_range_mode: 'normal',
  fpv_safe_bound_width: 740,
  fpv_safe_bound_height: 730,
}

test('builds cold front line and triangle symbol features from FPV points', () => {
  const result = buildSigwxSpecialLineFeatures({
    source,
    items: [{
      id: 'front-1',
      item_type: 4,
      contour_name: 'font_line',
      item_name: 'fl_cold',
      line_type: '302',
      fpv_points: [{ x: 100, y: 100 }, { x: 300, y: 100 }],
      color_line: '#0000ff',
    }],
  })

  assert.equal(result.lines.features.length, 1)
  assert.equal(result.symbols.features.length > 0, true)
  assert.equal(result.symbols.features[0].properties.symbolType, 'cold-front-triangle')
  assert.equal(Number.isFinite(result.symbols.features[0].properties.rotation), true)
})

test('builds CB cloud scallop symbol features outside the cloud polygon', () => {
  const result = buildSigwxSpecialLineFeatures({
    source,
    items: [{
      id: 'cloud-1',
      item_type: 4,
      contour_name: 'cld',
      item_name: 'cloud',
      line_type: '5',
      is_close: true,
      label: 'ISOL&#10;EMBD&#10;CB&#10;XXX&#10;010',
      fpv_points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 },
      ],
      color_line: '#a52a2a',
    }],
  })

  assert.equal(result.lines.features.length, 1)
  assert.equal(result.symbols.features.length >= 14, true)
  assert.equal(result.symbols.features[0].properties.symbolType, 'cloud-scallop')
  assert.equal(result.symbols.features[0].properties.symbolSize, 11)
  assert.equal(result.lines.features[0].properties.lineWidth, 1.1)
  assert.deepEqual(result.labels.features[0].properties.labelLines, ['ISOL', 'EMBD', 'CB', 'XXX', '010'])
})

test('stationary front symbols alternate warm and cold signs', () => {
  const result = buildSigwxSpecialLineFeatures({
    source,
    items: [{
      id: 'front-stationary',
      item_type: 4,
      contour_name: 'font_line',
      item_name: 'fl_stat',
      line_type: '305',
      fpv_points: [{ x: 100, y: 100 }, { x: 500, y: 100 }],
    }],
  })

  assert.equal(result.symbols.features.length >= 2, true)
  assert.equal(result.symbols.features[0].properties.symbolType, 'cold-front-triangle')
  assert.equal(result.symbols.features[1].properties.symbolType, 'warm-front-semicircle')
  assert.equal(result.symbols.features[0].properties.colorLine, '#2563eb')
  assert.equal(result.symbols.features[1].properties.colorLine, '#dc2626')
})
