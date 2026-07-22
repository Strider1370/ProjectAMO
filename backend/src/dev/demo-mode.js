// 시연 모드 — 로컬 테스트 인스턴스(DISABLE_COLLECTION)뿐 아니라 실제 배포 서버에서도
// 관리자가 런타임에 켤 수 있어야 해서 켜짐/꺼짐 + 시각 오버라이드를 파일에 저장한다(재시작해도 유지).
// 배포 때마다 PM2가 재시작되는데, 이전엔 메모리에만 있어서 재시작하면 조용히 꺼지고 자동수집이
// 재개돼버려 시연 도중 배포하면 데이터가 실황으로 덮이는 사고가 실제로 있었다 — 그래서 파일로 영속화.
import fs from 'node:fs'
import path from 'node:path'
import config from '../config.js'

const STATE_FILE = path.join(config.storage.base_path, '.demo-mode-state.json')

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    return { demoMode: !!raw.demoMode, demoNow: raw.demoNow ?? null }
  } catch {
    return { demoMode: false, demoNow: null }
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify({ demoMode, demoNow }))
  } catch { /* 저장 실패해도 메모리 상태로는 계속 동작 — 다음 재시작 때만 영향 */ }
}

// demoNow: 스냅샷은 과거 시점 데이터라, 새 비행계획을 진짜 현재 시각으로 만들면 TAF 유효기간·ETA
// 매칭이 안 맞는다. 스냅샷을 복원할 때 그 스냅샷의 기준시각으로 "지금"을 같이 얼려서 맞춰준다.
let { demoMode, demoNow } = loadState()

export function isDemoMode() {
  return demoMode
}

export function setDemoMode(on) {
  demoMode = !!on
  if (!demoMode) demoNow = null // 시연 모드 끄면 시각 오버라이드도 같이 해제
  saveState()
  return demoMode
}

export function setDemoNow(iso) {
  demoNow = iso ? new Date(iso).toISOString() : null
  saveState()
  return demoNow
}

export function getDemoNow() {
  return demoNow
}

// 브리핑·알림 등 "지금이 언제냐"를 묻는 모든 곳이 이 함수를 통해야 시연 모드 시각 오버라이드가 먹는다.
export function getEffectiveNow() {
  return demoNow ? new Date(demoNow) : new Date()
}

// 시연 모드 조작(토글/저장/복원/되돌리기) 이벤트 로그 — "버튼 눌렀는데 실제로 뭐가 어떻게 됐는지" 콘솔에서
// 바로 확인하기 위함(SSH로 pm2 로그 뒤질 필요 없이). 로그 자체는 재시작하면 비워짐(디버깅용, 영속 불필요).
const MAX_LOG = 50
const log = []

export function recordDemoEvent(action, detail) {
  log.unshift({ at: new Date().toISOString(), action, detail })
  if (log.length > MAX_LOG) log.length = MAX_LOG
}

export function getDemoEvents() {
  return log
}
