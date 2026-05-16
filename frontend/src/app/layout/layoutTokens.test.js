import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('./layoutTokens.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

test('layout tokens define shell and panel sizing contracts', () => {
  for (const token of [
    '--breakpoint-mobile-max',
    '--sidebar-collapsed',
    '--sidebar-expanded',
    '--app-bottom-bar',
    '--panel-overlay-sm',
    '--panel-overlay-md',
    '--panel-drawer-lg',
    '--breakpoint-tablet',
    '--breakpoint-compact',
    '--breakpoint-desktop',
    '--breakpoint-wide',
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`), `${token} should be defined`)
  }

  assert.match(css, /--panel-overlay-sm:\s*clamp\(/)
  assert.match(css, /--panel-overlay-md:\s*clamp\(/)
  assert.match(css, /--panel-drawer-lg:\s*clamp\(/)

  for (const declaration of [
    '--breakpoint-mobile-max: 719px;',
    '--breakpoint-tablet: 720px;',
    '--breakpoint-compact: 980px;',
    '--breakpoint-desktop: 1200px;',
    '--breakpoint-wide: 1600px;',
    '--app-bottom-bar: 24px;',
    '--sidebar-collapsed: 56px;',
    '--sidebar-expanded: clamp(260px, 16vw, 280px);',
    '--panel-overlay-sm: clamp(260px, 20vw, 320px);',
    '--panel-overlay-md: clamp(320px, 26vw, 420px);',
    '--panel-drawer-lg: clamp(560px, 42vw, 800px);',
  ]) {
    assert.match(css, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('app css imports layout tokens first', () => {
  const firstLine = appCss.split(/\r?\n/, 1)[0]
  assert.equal(firstLine, "@import './layout/layoutTokens.css';")
})

test('layout tokens stay globally scoped under :root', () => {
  assert.match(css, /^\s*:root\s*\{/)
})
