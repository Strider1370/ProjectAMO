import test from 'node:test'
import assert from 'node:assert/strict'
import { CROSS_SECTION_TOGGLE_GROUPS } from './crossSectionLayerState.js'

test('profile toggles are grouped by relation, lower to upper levels, with advisories last', () => {
  assert.deepEqual(CROSS_SECTION_TOGGLE_GROUPS.map(group => group.map(item => item.label)), [['구름·착빙', '등온선'], ['바람', '권계면·제트', '난류'], ['SIGMET/AIRMET']])
  const cloudIcing = CROSS_SECTION_TOGGLE_GROUPS[0][0]
  assert.deepEqual(cloudIcing.children.map(([key]) => key), ['moisture', 'cloud', 'icing'])
  assert.deepEqual(CROSS_SECTION_TOGGLE_GROUPS[0][1].options, [['temperatureDetail', '−10°C 추가']])
})
