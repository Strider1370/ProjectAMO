import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleRows, hasChildren, toggleExpanded } from './folderView.js'

// buildLayerList가 주는 모양만 흉내낸다. 도형은 이 모듈의 관심사가 아니다.
const L = (id, name, depth, parentId) => ({ id, name, depth, parentId, features: [] })
const TREE = [
  L('f0', 'RKTA TAEAN', 0, null),
  L('f1', 'RKTA 출항절차', 1, 'f0'),
  L('f2', 'CROSS COUNTRY', 1, 'f0'),
  L('f3', 'RKTA-RKJU JEONJU', 2, 'f2'),
  L('f4', 'RESTRICTED/MOA AREA', 0, null),
  L('f5', 'Seoul TMA', 0, null),
]

test('처음에는 최상위만 보인다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(), query: '' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f4', 'f5'])
})

test('펼치면 그 자식만 보이고 손자는 안 보인다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(['f0']), query: '' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f1', 'f2', 'f4', 'f5'])
})

test('손자는 부모까지 펼쳐야 보인다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(['f0', 'f2']), query: '' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'])
})

test('찾기: 맞는 폴더와 그 조상이 함께 보인다', () => {
  // 접힘 상태와 무관하게 조상이 따라온다 — 안 그러면 결과가 화면에 안 뜬다.
  const rows = visibleRows(TREE, { expanded: new Set(), query: 'JEONJU' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f2', 'f3'])
})

test('찾기는 대소문자를 가리지 않는다', () => {
  assert.deepEqual(visibleRows(TREE, { expanded: new Set(), query: 'seoul' }).map((r) => r.id), ['f5'])
})

test('찾기는 원래 순서를 지킨다', () => {
  // 'RKTA'는 f0·f1·f3 세 곳에 들어 있고, f3의 조상 f2가 따라온다.
  // 그래도 순서는 원래 목록 순서 그대로여야 한다 — 맞은 것을 앞으로 끌어내지 않는다.
  const rows = visibleRows(TREE, { expanded: new Set(), query: 'RKTA' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f1', 'f2', 'f3'])
})

test('맞는 것이 없으면 빈 목록', () => {
  assert.deepEqual(visibleRows(TREE, { expanded: new Set(), query: '없는이름' }), [])
})

test('검색어를 지우면 접힘 상태로 돌아간다', () => {
  const rows = visibleRows(TREE, { expanded: new Set(), query: '   ' })
  assert.deepEqual(rows.map((r) => r.id), ['f0', 'f4', 'f5'])
})

test('hasChildren: 하위 폴더가 있는지', () => {
  assert.equal(hasChildren(TREE, 'f0'), true)
  assert.equal(hasChildren(TREE, 'f1'), false)
  assert.equal(hasChildren(TREE, 'f5'), false)
})

test('toggleExpanded: 원본을 바꾸지 않고 새 Set을 준다', () => {
  const before = new Set(['f0'])
  const after = toggleExpanded(before, 'f2')
  assert.deepEqual([...before], ['f0'])
  assert.equal(after.has('f2'), true)
  assert.equal(toggleExpanded(after, 'f0').has('f0'), false)
})
