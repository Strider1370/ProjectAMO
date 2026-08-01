// 임시 글꼴 테스트 토글. 후보 폰트를 "고를 때만" lazy 로드(dynamic-subset)하고
// --app-font / body에 적용 + localStorage 저장. 테스트 기간 팀 투표용 — 결정 후 제거 예정.
// 기본(GOV)은 main.jsx에서 자체 호스팅됨. 주의: 자체 폰트 하드코딩 컴포넌트는 글꼴 통일 전까지 안 바뀜.
const KEY = 'font_pref'
// 임시: Wanted Sans를 기본으로 통일해 비교 중(투표 후 확정). 설정에서 글꼴 일괄 변경 가능.
const DEFAULT_ID = 'wanted'

export const FONT_OPTIONS = [
  // Pretendard GOV: main.jsx에서 자체 호스팅(이미 로드) → css 불필요
  { id: 'gov', label: 'Pretendard GOV (정부표준)', stack: "'Pretendard GOV', system-ui, sans-serif" },
  { id: 'noto', label: 'Noto Sans KR', stack: "'Noto Sans KR', system-ui, sans-serif", css: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap' },
  { id: 'gothic', label: 'Gothic A1', stack: "'Gothic A1', system-ui, sans-serif", css: 'https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;500;700&display=swap' },
  { id: 'wanted', label: 'Wanted Sans', stack: "'Wanted Sans Variable', system-ui, sans-serif", css: 'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@latest/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css' },
  { id: 'plex', label: 'IBM Plex Sans KR', stack: "'IBM Plex Sans KR', system-ui, sans-serif", css: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap' },
]

function ensureFontLoaded(opt) {
  if (!opt?.css) return
  const linkId = `fontpref-${opt.id}`
  if (document.getElementById(linkId)) return
  const link = document.createElement('link')
  link.id = linkId
  link.rel = 'stylesheet'
  link.href = opt.css
  document.head.appendChild(link)
}

export function getFontPref() {
  return localStorage.getItem(KEY) || DEFAULT_ID
}

export function applyFont(id) {
  const opt = FONT_OPTIONS.find((o) => o.id === id) || FONT_OPTIONS[0]
  ensureFontLoaded(opt)
  document.documentElement.style.setProperty('--app-font', opt.stack)
  document.body.style.fontFamily = opt.stack
  localStorage.setItem(KEY, opt.id)
}

export function loadStoredFont() {
  applyFont(getFontPref())
}
