import test from 'node:test'
import assert from 'node:assert/strict'
import { ICONS, DEFAULT_ICON, iconById, filterIcons } from './iconCatalog.js'

test('아이콘이 충분히 많다', () => {
  // onX가 90종, 구글어스 기본 고르개가 236종 이상. 그 사이면 쓸 만하다.
  assert.ok(ICONS.length >= 80, `${ICONS.length}종뿐`)
})

test('id가 겹치지 않는다', () => {
  assert.equal(new Set(ICONS.map((i) => i.id)).size, ICONS.length)
})

// 파일이 적는 주소는 http라 https 페이지에서 막힌다. 목록은 처음부터 https여야 한다.
test('주소가 전부 https다', () => {
  for (const i of ICONS) assert.match(i.url, /^https:\/\/maps\.google\.com\/mapfiles\/kml\//)
})

test('기본 아이콘은 노랑 압정 — 맥케이 파일이 가장 많이 쓴 것', () => {
  assert.equal(DEFAULT_ICON, 'pushpin/ylw-pushpin')
})

test('없는 id를 물으면 기본값으로 떨어진다', () => {
  assert.equal(iconById('없는것').id, DEFAULT_ICON)
  assert.equal(iconById(undefined).id, DEFAULT_ICON)
})

test('찾기가 비면 전부 나온다', () => {
  assert.equal(filterIcons('').length, ICONS.length)
  assert.equal(filterIcons(null).length, ICONS.length)
})

test('한글 이름으로 찾아진다', () => {
  const found = filterIcons('공항')
  assert.ok(found.length >= 1)
  assert.ok(found.some((i) => i.id === 'shapes/airports'))
})

test('영문 id로도 찾아진다', () => {
  assert.ok(filterIcons('airports').some((i) => i.id === 'shapes/airports'))
})

test('대소문자를 가리지 않는다', () => {
  assert.equal(filterIcons('AIRPORTS').length, filterIcons('airports').length)
})

test('압정 8색이 다 있다', () => {
  assert.equal(ICONS.filter((i) => i.group === '압정').length, 8)
})

test('알파벳 판 26개가 다 있다', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    assert.ok(ICONS.some((i) => i.id === `paddle/${ch}`), `${ch} 판이 없음`)
  }
})
