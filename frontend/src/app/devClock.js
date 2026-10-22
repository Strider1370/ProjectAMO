// 개발 서버 전용 "지금" 바꾸기. 받아 둔 운영 자료(예: .artifacts/prod-data-20261020)는 과거 시각이라 실제 시계로는
// 그 시각의 KIM 장을 고르지 않아 레이어·시간 막대·브리핑 기본값을 확인할 수 없다. 주소에 ?devNow=<ISO 시각>을 붙이면
// 이 탭의 Date가 그 시각에서 출발해 실제처럼 흐른다(탭을 닫으면 풀림, ?devNow=off로 해제). 운영 빌드에서는 동작하지 않는다.
// main.jsx의 첫 import여야 한다 — 다른 모듈이 읽히며 Date.now()를 부르기 전에 바꿔야 한다.
const KEY = 'projectamo.devNow'

function readTarget() {
  const param = new URLSearchParams(window.location.search).get('devNow')
  try {
    if (param === 'off') { sessionStorage.removeItem(KEY); return null }
    if (param) sessionStorage.setItem(KEY, param)
    return sessionStorage.getItem(KEY)
  } catch { return param }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const target = Date.parse(readTarget() ?? '')
  if (Number.isFinite(target)) {
    const RealDate = Date
    const offset = target - RealDate.now()
    class DevDate extends RealDate {
      constructor(...args) { if (args.length) super(...args); else super(RealDate.now() + offset) }
      static now() { return RealDate.now() + offset }
    }
    globalThis.Date = DevDate
    // 화면 위 가운데 표시 — 바뀐 줄 모르고 보면 혼란스럽다.
    window.addEventListener('DOMContentLoaded', () => {
      const badge = document.createElement('div')
      badge.textContent = `개발용 시각 · ${new RealDate(target).toISOString().slice(0, 16)}Z부터 흐름 (?devNow=off로 해제)`
      Object.assign(badge.style, { position: 'fixed', left: '50%', top: '0', transform: 'translateX(-50%)', zIndex: 9999, padding: '1px 8px', borderRadius: '0 0 4px 4px', background: '#7c2d12', color: '#fff', font: '600 11px system-ui, sans-serif', pointerEvents: 'none' })
      document.body.appendChild(badge)
    })
  }
}
