import test from 'node:test'
import assert from 'node:assert/strict'
import { editableAltitude, parseBulkCoordinateRows } from './mapEditorUi.js'

test('일괄 DD 입력은 엄격히 숫자를 확인하고 위도·경도 순서를 바꿀 수 있다', () => {
  assert.deepEqual(parseBulkCoordinateRows('서울\t37.5665\t126.9780').at(0).coordinate, [126.978, 37.5665])
  assert.match(parseBulkCoordinateRows('37oops,126.9').at(0).error, /십진수/)
  assert.deepEqual(parseBulkCoordinateRows('126.9780,37.5665', { coordinateOrder: 'lng-lat' }).at(0).coordinate, [126.978, 37.5665])
})

test('빈 좌표와 같거나 역전된 고도는 완료 값으로 만들지 않는다', () => {
  assert.match(parseBulkCoordinateRows('이름\t\t126.9').at(0).error, /비어/)
  assert.throws(() => editableAltitude('5000', '5000'), /낮아야/)
  assert.deepEqual(editableAltitude('0', '1000'), { floorFt: 0, ceilingFt: 1000 })
})
