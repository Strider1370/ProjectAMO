import test from 'node:test'
import assert from 'node:assert/strict'
import { CEILING_CHART_MAX_FT, formatAxisTick, plotChartValue } from './modelComparisonChart.js'

test('sub-millimetre precipitation axis keeps the precision needed to compare models', () => {
  assert.equal(formatAxisTick(0.25, 'mm', 0.25), '0.25 mm')
  assert.equal(formatAxisTick(0.125, 'mm', 0.25), '0.13 mm')
  assert.equal(formatAxisTick(0, 'mm', 0.25), '0.00 mm')
})

test('ceiling chart caps only its plotted position while preserving the real value elsewhere', () => {
  assert.equal(CEILING_CHART_MAX_FT, 10_000)
  assert.equal(plotChartValue(3_655, 'ft'), 3_655)
  assert.equal(plotChartValue(33_849, 'ft'), CEILING_CHART_MAX_FT)
})
