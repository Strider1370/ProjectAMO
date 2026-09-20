import test from 'node:test'
import assert from 'node:assert/strict'
import { ancestorGroupIds, buildMapPanelTree, filterMapPanelTree, flattenMapPanelRows, selectedItemReveal } from './mapPanelRows.js'

const document = {
  groups: [
    { id: 'root', name: 'RKTA TAEAN', parentId: null, order: 0 },
    { id: 'procedure', name: '출항절차', parentId: 'root', order: 0 },
    { id: 'airspace', name: '공역', parentId: null, order: 1 },
  ],
  items: [
    { id: 'sel', groupId: 'procedure', name: 'SEL', order: 0 },
    { id: 'coast', groupId: 'procedure', name: '좌측 해안선', order: 1 },
    { id: 'zone', groupId: 'airspace', name: 'CHEONGJU', order: 0 },
    { id: 'loose', groupId: null, name: '그룹 없음 지점', order: 0 },
  ],
}

test('원본 폴더 계층과 Placemark 단위 항목을 유지한다', () => {
  const tree = buildMapPanelTree(document)
  assert.equal(tree[0].group.name, 'RKTA TAEAN')
  assert.equal(tree[0].children[0].group.name, '출항절차')
  assert.deepEqual(tree[0].children[0].items.map((item) => item.id), ['sel', 'coast'])
  assert.equal(tree[0].itemCount, 2)
  assert.equal(tree.at(-1).type, 'ungrouped')
})

test('검색은 일치 항목과 조상 폴더 경로를 함께 보여 준다', () => {
  const filtered = filterMapPanelTree(buildMapPanelTree(document), 'sel')
  const rows = flattenMapPanelRows(filtered, { query: 'sel' })
  assert.deepEqual(rows.map((row) => row.type === 'item' ? row.item.id : row.id), ['root', 'procedure', 'sel'])
})

test('접힌 그룹의 항목은 렌더하지 않고 펼친 뒤에도 일정 수씩 보인다', () => {
  const many = {
    groups: [{ id: 'g', name: '큰 폴더', parentId: null, order: 0 }],
    items: Array.from({ length: 3 }, (_, index) => ({ id: `i${index}`, name: `항목 ${index}`, groupId: 'g', order: index })),
  }
  const tree = buildMapPanelTree(many)
  assert.deepEqual(flattenMapPanelRows(tree).map((row) => row.type), ['group'])
  assert.deepEqual(flattenMapPanelRows(tree, { expanded: new Set(['g']), itemLimit: 2 }).map((row) => row.type), ['group', 'item', 'item', 'more'])
})

test('지도에서 고른 접힌 항목은 조상과 필요한 목록 조각을 함께 연다', () => {
  const many = {
    groups: [{ id: 'root', name: '상위', parentId: null, order: 0 }, { id: 'leaf', name: '하위', parentId: 'root', order: 0 }],
    items: Array.from({ length: 121 }, (_, index) => ({ id: `i${index}`, name: `항목 ${index}`, groupId: 'leaf', order: index })),
  }
  const revealed = selectedItemReveal(many, 'i120', 120)
  assert.deepEqual([...revealed.expanded], ['leaf', 'root'])
  assert.equal(revealed.parentId, 'leaf')
  assert.equal(revealed.revealed, 240)
})

test('순환 폴더 관계는 목록과 조상 계산을 멈추지 않는다', () => {
  const cyclic = {
    groups: [{ id: 'a', name: 'A', parentId: 'b', order: 0 }, { id: 'b', name: 'B', parentId: 'a', order: 1 }],
    items: [{ id: 'item', name: '항목', groupId: 'a', order: 0 }],
  }
  assert.deepEqual(ancestorGroupIds(cyclic, 'a'), ['a', 'b'])
  assert.equal(buildMapPanelTree(cyclic).length, 2)
})
