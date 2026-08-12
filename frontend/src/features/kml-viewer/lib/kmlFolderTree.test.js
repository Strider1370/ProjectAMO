import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLayerList, isLayerVisible } from './kmlFolderTree.js'

const feature = (name) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: [127, 37] } })

test('폴더 계층과 이름을 그대로 옮긴다', () => {
  const tree = {
    type: 'root',
    children: [
      { type: 'folder', meta: { name: 'RKTA' }, children: [
        feature('공항'),
        { type: 'folder', meta: { name: '출항절차' }, children: [feature('WP1'), feature('WP2')] },
      ] },
    ],
  }
  const list = buildLayerList(tree)
  assert.deepEqual(list.map((l) => l.name), ['RKTA', '출항절차'])
  assert.deepEqual(list.map((l) => l.depth), [0, 1])
  assert.deepEqual(list.map((l) => l.features.length), [1, 2])
  assert.equal(list[1].parentId, list[0].id)
  assert.deepEqual(list[1].path, ['RKTA', '출항절차'])
})

test('최상위에 바로 있는 도형은 (폴더 없음)으로 묶는다', () => {
  const list = buildLayerList({ type: 'root', children: [feature('혼자'), feature('둘')] })
  assert.equal(list.length, 1)
  assert.equal(list[0].name, '(폴더 없음)')
  assert.equal(list[0].depth, 0)
  assert.equal(list[0].parentId, null)
  assert.equal(list[0].features.length, 2)
})

test('이름 없는 폴더는 번호를 붙여 구분한다', () => {
  const tree = { type: 'root', children: [
    { type: 'folder', children: [feature('a')] },
    { type: 'folder', children: [feature('b')] },
  ] }
  assert.deepEqual(buildLayerList(tree).map((l) => l.name), ['(이름 없는 폴더 1)', '(이름 없는 폴더 2)'])
})

test('도형이 하나도 없는 폴더도 목록에 남긴다', () => {
  const tree = { type: 'root', children: [
    { type: 'folder', meta: { name: '빈 폴더' }, children: [] },
    { type: 'folder', meta: { name: '안쪽만' }, children: [
      { type: 'folder', meta: { name: '자식' }, children: [feature('a')] },
    ] },
  ] }
  const list = buildLayerList(tree)
  assert.deepEqual(list.map((l) => l.name), ['빈 폴더', '안쪽만', '자식'])
  assert.equal(list[0].features.length, 0)
})

test('(폴더 없음)은 파일에 나온 자리에 끼워 넣는다', () => {
  const tree = { type: 'root', children: [
    { type: 'folder', meta: { name: '먼저' }, children: [feature('a')] },
    feature('떠돌이'),
    { type: 'folder', meta: { name: '나중' }, children: [feature('b')] },
  ] }
  assert.deepEqual(buildLayerList(tree).map((l) => l.name), ['먼저', '(폴더 없음)', '나중'])
})

test('id는 항목마다 다르다', () => {
  const tree = { type: 'root', children: [
    { type: 'folder', meta: { name: '같은이름' }, children: [feature('a')] },
    { type: 'folder', meta: { name: '같은이름' }, children: [feature('b')] },
  ] }
  const list = buildLayerList(tree)
  assert.notEqual(list[0].id, list[1].id)
})

test('상위를 끄면 하위도 꺼진다', () => {
  const list = [
    { id: 'f0', parentId: null }, { id: 'f1', parentId: 'f0' }, { id: 'f2', parentId: 'f1' },
  ]
  assert.equal(isLayerVisible(list, 'f2', new Set(['f0'])), false)
  assert.equal(isLayerVisible(list, 'f2', new Set(['f1'])), false)
  assert.equal(isLayerVisible(list, 'f2', new Set()), true)
  assert.equal(isLayerVisible(list, 'f0', new Set(['f1'])), true)
})
