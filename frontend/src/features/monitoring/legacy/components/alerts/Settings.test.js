import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./Settings.jsx', import.meta.url)), 'utf8')
const monitoringPageSource = readFileSync(fileURLToPath(new URL('../../../MonitoringPage.jsx', import.meta.url)), 'utf8')

test('defines a reduced ground-mode settings tab set', () => {
  assert.match(source, /const SETTINGS_TABS\s*=\s*\[/)
  assert.match(source, /const visibleTabs\s*=\s*isGroundMode\s*\?\s*SETTINGS_TABS\.filter\(/)
  assert.match(source, /id:\s*["']general["']/)
  assert.match(source, /id:\s*["']slideshow["']/)
  assert.match(source, /id:\s*["']alert["']/)
  assert.match(source, /id:\s*["']traffic["']/)
  assert.match(source, /id:\s*["']advisory["']/)
})

test('renders the slideshow controls in task order with advanced options disclosed', () => {
  assert.match(source, /화면 전환 사용[\s\S]*?표시할 장면/)
  assert.match(source, /기본 설정[\s\S]*?전환 대상[\s\S]*?표시할 장면/)
  assert.match(source, /<details[\s\S]*?전환 효과[\s\S]*?전환 애니메이션 속도/)
  assert.match(source, /시작 시각[\s\S]*?종료 시각[\s\S]*?이미지 선택/)
  assert.match(source, /미리보기[\s\S]*?중지[\s\S]*?다음 페이지/)
  assert.match(source, /onSlideshowNextPage/)
  assert.match(monitoringPageSource, /onSlideshowNextPage=\{slideshow\.nextPage\}/)
})
