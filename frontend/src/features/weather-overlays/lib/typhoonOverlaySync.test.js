import assert from 'node:assert/strict'
import test from 'node:test'
import { typhoonPopupHtml } from './typhoonOverlaySync.js'

test('태풍 hover 팝업은 선택한 앱 시간대를 한국어 시각으로 보여준다', () => {
  const html = typhoonPopupHtml({
    validAt: '2026-08-07T00:00:00.000Z', maxWindMs: 40, location: '제주 남쪽', pressureHpa: 970,
  }, 13, '돌핀', 'KST')

  assert.match(html, /13호 태풍 돌핀/)
  assert.match(html, /강도 3/)
  assert.match(html, /유효시각.*2026년 8월 7일 09시/)
  assert.match(html, /최대풍속.*40 m\/s/)
  assert.doesNotMatch(html, /위치|중심기압|진행|강풍반경|폭풍반경|확률반경/)
})

test('태풍 hover 팝업은 UTC 선택에서도 브라우저 시간이 아닌 앱 시간을 쓴다', () => {
  const html = typhoonPopupHtml({ validAt: '2026-12-09T00:00:00.000Z', maxWindMs: 40 }, 13, '돌핀', 'UTC')
  assert.match(html, /2026년 12월 9일 00시/)
  assert.doesNotMatch(html, /UTC|KST/)
})
