import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySigwxLowItem } from '../src/sigwx-low/sigwx-low-classifier.js'

test('classifies known SIGWX_LOW render roles', () => {
  assert.equal(classifySigwxLowItem({
    item_type: 4,
    contour_name: 'freezing_level',
    item_name: '',
    line_type: '3',
    is_close: false,
  }).renderRole, 'dashed-freezing-line')

  assert.equal(classifySigwxLowItem({
    item_type: 8,
    contour_name: 'sfc_wind',
    item_name: 'wind_strong',
    shape_type: 'diamond',
    label: '30',
  }).renderRole, 'wind-diamond-label')

  assert.equal(classifySigwxLowItem({
    item_type: 4,
    contour_name: 'cld',
    item_name: 'cloud',
    line_type: '5',
    is_close: true,
    label: 'ISOL&#10;EMBD&#10;CB&#10;XXX&#10;010',
  }).renderRole, 'cloud-scallop-boundary')
})

test('does not treat internal icon names as visible labels', () => {
  const result = classifySigwxLowItem({
    item_type: 7,
    contour_name: 'sfc_vis',
    item_name: 'widespread_fog',
    icon_name: 'widespread_fog.png',
    label: '',
    text_label: 'widespread_fog',
  })
  assert.equal(result.renderRole, 'icon-marker')
  assert.equal(result.visibleLabel, '')
})

test('does not treat merged internal visibility tokens as visible labels', () => {
  const result = classifySigwxLowItem({
    item_type: 7,
    contour_name: 'sfc_vis',
    item_name: 'rain',
    icon_name: 'rain.png',
    label: 'rain / widespread_fog / widespread_mist',
    text_label: 'rain / widespread_fog / widespread_mist',
  })
  assert.equal(result.renderRole, 'icon-marker')
  assert.equal(result.visibleLabel, '')
})

test('maps internal freezing labels to chart-facing callouts', () => {
  const result = classifySigwxLowItem({
    item_type: 10,
    contour_name: 'freezing_level',
    item_name: 'freez',
    text_label: 'freez',
  })
  assert.equal(result.visibleLabel, '0C:100')
  assert.deepEqual(result.labelLines, ['0C:100'])
})

test('keeps Korean place labels visible for mountain obscuration icons', () => {
  const result = classifySigwxLowItem({
    item_type: 7,
    contour_name: 'mountain_obscu',
    item_name: 'mountain_obscuration',
    icon_name: 'mountain_obscuration.png',
    label: '태백산맥',
    text_label: '태백산맥',
  })
  assert.equal(result.renderRole, 'icon-marker')
  assert.equal(result.visibleLabel, '태백산맥')
})
