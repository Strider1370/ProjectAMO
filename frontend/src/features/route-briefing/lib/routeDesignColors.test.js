import assert from 'node:assert/strict'
import test from 'node:test'
import { routeDesignColor, BASE_ROUTE_COLOR, ALT_ROUTE_COLORS } from './routeDesignColors.js'

const base = { id: 'base', kind: 'base' }
const altA = { id: 'route-design-1', kind: 'alternative' }
const altB = { id: 'route-design-2', kind: 'alternative' }
const altC = { id: 'route-design-3', kind: 'alternative' }
const all = [base, altA, altB, altC]

test('base design is always the base color regardless of position', () => {
  assert.equal(routeDesignColor(base, all), BASE_ROUTE_COLOR)
  assert.equal(routeDesignColor({ id: 'base', kind: 'base' }, []), BASE_ROUTE_COLOR)
})

test('alternatives get distinct colors by creation order among alternatives', () => {
  assert.equal(routeDesignColor(altA, all), ALT_ROUTE_COLORS[0])
  assert.equal(routeDesignColor(altB, all), ALT_ROUTE_COLORS[1])
  assert.equal(routeDesignColor(altC, all), ALT_ROUTE_COLORS[2])
})

test('a design not present in the list falls back to the last palette color', () => {
  assert.equal(routeDesignColor({ id: 'route-design-9', kind: 'alternative' }, all), ALT_ROUTE_COLORS[ALT_ROUTE_COLORS.length - 1])
})

test('a null/undefined design falls back to base color', () => {
  assert.equal(routeDesignColor(null, all), BASE_ROUTE_COLOR)
  assert.equal(routeDesignColor(undefined, all), BASE_ROUTE_COLOR)
})
