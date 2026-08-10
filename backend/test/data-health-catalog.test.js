import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, SOURCES, CHARACTERS, bySource } from '../src/admin/data-health-catalog.js'

test('카탈로그는 34종이고 키가 중복되지 않는다', () => {
  assert.equal(CATALOG.length, 34)
  assert.equal(new Set(CATALOG.map((r) => r.key)).size, 34)
})

test('모든 행이 알려진 출처·성격에 속한다', () => {
  for (const row of CATALOG) {
    assert.ok(SOURCES[row.source], `${row.key}: 알 수 없는 출처 ${row.source}`)
    assert.ok(CHARACTERS[row.character], `${row.key}: 알 수 없는 성격 ${row.character}`)
  }
})

test('기준은 정상 주기 < 지연 < 멈춤 순서다', () => {
  for (const row of CATALOG) {
    assert.ok(row.normalMs < row.lateMs, `${row.key}`)
    assert.ok(row.lateMs < row.stoppedMs, `${row.key}`)
  }
})

test('이벤트성 자료 7종이 표시돼 있다', () => {
  const ev = CATALOG.filter((r) => r.eventDriven).map((r) => r.key).sort()
  assert.deepEqual(ev, ['airmet', 'kma_special_warning', 'lightning', 'sigmet', 'sigmet_overseas', 'typhoon', 'warning'].sort())
})

test('bySource는 출처 순서대로 묶어 돌려준다', () => {
  const groups = bySource()
  assert.equal(groups[0].id, 'kma_aviation')
  assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), 34)
})
