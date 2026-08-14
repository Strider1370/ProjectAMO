import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFileList, listMyMapFiles, saveMyMapFile, loadMyMapFile, deleteMyMapFile } from './myMapStore.js'

// node에는 localStorage도 indexedDB도 없다. 이 환경에서 조용히 실패하는지가
// 곧 사생활 보호 모드 브라우저에서 앱이 안 죽는지와 같은 질문이다.

test('normalizeFileList: 쓸 수 있는 항목만 남긴다', () => {
  const out = normalizeFileList([
    { id: 'a', name: '맥케이.kmz', size: 1867169, addedAt: 1755000000000 },
    { id: '', name: '이름만', size: 10, addedAt: 1 },      // id 없음
    { id: 'b', name: '', size: 10, addedAt: 1 },            // 이름 없음
    null,
    'x',
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'a')
  assert.equal(out[0].name, '맥케이.kmz')
})

test('normalizeFileList: 배열이 아니면 빈 목록', () => {
  assert.deepEqual(normalizeFileList(null), [])
  assert.deepEqual(normalizeFileList({}), [])
  assert.deepEqual(normalizeFileList('nope'), [])
})

test('normalizeFileList: 숫자가 아닌 크기·시각은 0으로 고친다', () => {
  const out = normalizeFileList([{ id: 'a', name: 'x.kml', size: 'big', addedAt: null }])
  assert.equal(out[0].size, 0)
  assert.equal(out[0].addedAt, 0)
})

test('보관소가 없으면 목록은 빈 배열', () => {
  assert.deepEqual(listMyMapFiles(), [])
})

test('보관소가 없으면 저장은 실패를 돌려주되 던지지 않는다', async () => {
  const r = await saveMyMapFile({ name: 'x.kmz', size: 10, arrayBuffer: async () => new ArrayBuffer(10) })
  assert.equal(r.ok, false)
  assert.ok(r.error)
})

test('보관소가 없으면 읽기·지우기도 조용히 실패한다', async () => {
  const read = await loadMyMapFile('a')
  assert.equal(read.ok, false)
  assert.equal(read.buffer, null)
  assert.equal((await deleteMyMapFile('a')).ok, false)
})
