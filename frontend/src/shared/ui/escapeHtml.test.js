import test from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml } from './escapeHtml.js'

test('escapeHtml은 자유 텍스트의 HTML 특수문자를 이스케이프한다', () => {
  // fix round 1: station.name이 innerHTML로 그대로 들어가면 안 된다 — 신뢰 경계.
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;')
  assert.equal(escapeHtml('AT&T "구역"'), 'AT&amp;T &quot;구역&quot;')
})

test('escapeHtml은 홑따옴표도 이스케이프한다', () => {
  assert.equal(escapeHtml("O'Hare"), 'O&#39;Hare')
})

test('escapeHtml은 null/undefined를 빈 문자열로 다룬다', () => {
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})
