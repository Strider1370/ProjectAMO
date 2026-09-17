// 임시 글꼴 테스트 토글. 후보 폰트를 "고를 때만" lazy 로드(dynamic-subset)하고
// --app-font / body에 적용 + localStorage 저장. 테스트 기간 팀 투표용 — 결정 후 제거 예정.
// GOV와 Wanted는 자체 호스팅. 기존에 저장한 다른 후보 선택은 그대로 유지한다.
import { readStoredValue, writeStoredValue } from '../settings/storage.js'

const KEY = 'font_pref'
// 임시: Wanted Sans를 기본으로 통일해 비교 중(투표 후 확정). 설정에서 글꼴 일괄 변경 가능.
const DEFAULT_ID = 'wanted'

export const FONT_OPTIONS = [
  // Pretendard GOV: main.jsx에서 자체 호스팅(이미 로드) → css 불필요
  { id: 'gov', label: 'Pretendard GOV (정부표준)', stack: "'Pretendard GOV', system-ui, sans-serif" },
  { id: 'noto', label: 'Noto Sans KR', stack: "'Noto Sans KR', system-ui, sans-serif", css: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap' },
  { id: 'gothic', label: 'Gothic A1', stack: "'Gothic A1', system-ui, sans-serif", css: 'https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;500;700&display=swap' },
  { id: 'wanted', label: 'Wanted Sans', stack: "'Wanted Sans Variable', system-ui, sans-serif", load: () => import('../../assets/fonts/wanted-sans/1.0.3/WantedSansVariable.css') },
  { id: 'plex', label: 'IBM Plex Sans KR', stack: "'IBM Plex Sans KR', system-ui, sans-serif", css: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap' },
]

const fontLoads = new Map()

function ensureFontLoaded(opt) {
  if (opt?.load) {
    if (!fontLoads.has(opt.id)) {
      fontLoads.set(opt.id, opt.load().catch(error => {
        fontLoads.delete(opt.id)
        console.warn(`Font stylesheet could not be loaded: ${opt.id}`, error)
      }))
    }
    return
  }
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
  const { value } = readStoredValue(KEY)
  return FONT_OPTIONS.some(opt => opt.id === value) ? value : DEFAULT_ID
}

export function applyFont(id, { persist = true } = {}) {
  const opt = FONT_OPTIONS.find((o) => o.id === id) || FONT_OPTIONS.find((o) => o.id === DEFAULT_ID)
  ensureFontLoaded(opt)
  document.documentElement.style.setProperty('--app-font', opt.stack)
  document.body.style.fontFamily = opt.stack
  if (persist) writeStoredValue(KEY, opt.id)
  return opt.id
}

export function loadStoredFont() {
  // 부트 중 unknown 값이나 저장소 실패를 고쳐 쓰지 않는다. 기본 글꼴만 세션에 적용한다.
  return applyFont(getFontPref(), { persist: false })
}
