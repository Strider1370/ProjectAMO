import { test } from 'node:test'
import assert from 'node:assert/strict'

import { migratePersonalSettings } from './alert-settings.js'

test('머무는 시간 10 이하는 강조 시간 60초가 된다', () => {
  const out = migratePersonalSettings({ dispatchers: { popup: { auto_dismiss_seconds: 10 } } })
  assert.equal(out.dispatchers.popup.highlight_seconds, 60)
  assert.equal(out.dispatchers.popup.auto_dismiss_seconds, undefined)
})

test('머무는 시간이 10보다 크면 그 값을 강조 시간으로 옮긴다', () => {
  const out = migratePersonalSettings({ dispatchers: { popup: { auto_dismiss_seconds: 45 } } })
  assert.equal(out.dispatchers.popup.highlight_seconds, 45)
})

test('최대 표시 5는 6이 되고 다른 값은 그대로 둔다', () => {
  assert.equal(migratePersonalSettings({ dispatchers: { popup: { max_visible: 5 } } }).dispatchers.popup.max_visible, 6)
  assert.equal(migratePersonalSettings({ dispatchers: { popup: { max_visible: 3 } } }).dispatchers.popup.max_visible, 3)
})

test('삭제 대상 키가 남지 않는다', () => {
  const out = migratePersonalSettings({
    dispatchers: { popup: { position: 'top-right' }, marquee: { enabled: false, speed: 'fast' } },
    triggers: { warning_issued: { enabled: false }, high_wind: { enabled: false } },
  })
  assert.equal(out.dispatchers.popup.position, undefined)
  assert.equal(out.dispatchers.marquee, undefined)
  assert.equal(out.triggers.warning_issued, undefined)
  assert.equal(out.triggers.high_wind.enabled, false, '남는 트리거 설정은 보존한다')
})

test('빈 입력과 null에서 터지지 않는다', () => {
  assert.deepEqual(migratePersonalSettings(null), {})
  assert.deepEqual(migratePersonalSettings({}), {})
})

test('정리할 것이 없으면 입력을 그대로 돌려준다', () => {
  const input = { global: { alerts_enabled: false } }
  assert.deepEqual(migratePersonalSettings(input), { global: { alerts_enabled: false } })
})
