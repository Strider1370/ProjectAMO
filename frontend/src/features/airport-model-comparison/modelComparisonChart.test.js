import test from 'node:test'
import assert from 'node:assert/strict'
import { CEILING_CHART_MAX_FT, formatAxisTick, plotChartValue, chartDomain, chartPath } from './modelComparisonChart.js'

test('sub-millimetre precipitation axis keeps the precision needed to compare models', () => {
  assert.equal(formatAxisTick(0.25, 'mm', 0.25), '0.25 mm')
  assert.equal(formatAxisTick(0.125, 'mm', 0.25), '0.13 mm')
  assert.equal(formatAxisTick(0, 'mm', 0.25), '0.00 mm')
  assert.equal(formatAxisTick(0.5, 'mm', 2), '0.5 mm')
  assert.equal(formatAxisTick(-0.5, '°C', 1), '-0.5 °C')
})

test('ceiling chart caps only its plotted position while preserving the real value elsewhere', () => {
  assert.equal(CEILING_CHART_MAX_FT, 25_000)
  assert.equal(plotChartValue(3_655, 'ft'), 3_655)
  assert.equal(plotChartValue(33_849, 'ft'), CEILING_CHART_MAX_FT)
  assert.equal(plotChartValue(33_849, 'ft', 10_000), 10_000)
  assert.deepEqual(chartDomain([2400, 4524], 'ft'), { min: 0, max: 5000, step: 1000 })
  assert.deepEqual(chartDomain([2400, 8200], 'ft'), { min: 0, max: 10000, step: 2000 })
  assert.deepEqual(chartDomain([2400, 12400], 'ft'), { min: 0, max: 25000, step: 5000 })
  assert.deepEqual(chartDomain([2400, 33849], 'ft'), { min: 0, max: 25000, step: 5000 })
})

test('wind includes zero and the largest gust; temperature keeps negative values; RH uses a fixed scale', () => {
  assert.deepEqual(chartDomain([3, 77], 'kt'), { min: 0, max: 80, step: 20 })
  assert.deepEqual(chartDomain([0, 0.3], 'mm'), { min: 0, max: 0.3, step: 0.1 })
  const temperature = chartDomain([-8, 4], '°C')
  assert.ok(temperature.min <= -8 && temperature.max >= 4)
  assert.deepEqual(chartDomain([65, 75], '%'), { min: 0, max: 100, step: 20 })
})

test('step paths hold each height until the next sample without bridging NSC or missing input', () => {
  assert.equal(chartPath([{x:0,value:2000},{x:1,value:1000},{x:2,value:null},{x:3,value:3000}], v=>v, true), 'M0,2000 H1 V1000 M3,3000')
})
