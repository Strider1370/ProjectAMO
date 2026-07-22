// 시연 모드 — 로컬 테스트 인스턴스(DISABLE_COLLECTION)뿐 아니라 실제 배포 서버에서도
// 관리자가 런타임에 켤 수 있어야 해서 프로세스 메모리 플래그로 관리한다(재시작하면 꺼짐 —
// 시연 도중 서버를 재시작하지 않는다는 전제). 켜지면 index.js의 runWithLock이 자동수집을 건너뛴다.
//
// 기본값은 항상 꺼짐 — DISABLE_COLLECTION(로컬 테스트 모드)과는 별개 개념이다. DISABLE_COLLECTION은
// index.js의 main()이 cron.schedule 자체를 등록 안 해서 이미 그것만으로 자동수집이 꺼져 있으므로,
// 여기서 자동으로 켤 필요가 없다 — 관리자가 명시적으로 켜기 전까진 시연 모드는 꺼진 상태여야 한다.
//
// demoNow: 스냅샷은 과거 시점 데이터라, 새 비행계획을 진짜 현재 시각으로 만들면 TAF 유효기간·ETA
// 매칭이 안 맞는다. 스냅샷을 복원할 때 그 스냅샷의 기준시각으로 "지금"을 같이 얼려서 맞춰준다.
let demoMode = false
let demoNow = null // ISO string | null. null이면 실제 현재 시각을 그대로 씀.

export function isDemoMode() {
  return demoMode
}

export function setDemoMode(on) {
  demoMode = !!on
  if (!demoMode) demoNow = null // 시연 모드 끄면 시각 오버라이드도 같이 해제
  return demoMode
}

export function setDemoNow(iso) {
  demoNow = iso ? new Date(iso).toISOString() : null
  return demoNow
}

export function getDemoNow() {
  return demoNow
}

// 브리핑·알림 등 "지금이 언제냐"를 묻는 모든 곳이 이 함수를 통해야 시연 모드 시각 오버라이드가 먹는다.
export function getEffectiveNow() {
  return demoNow ? new Date(demoNow) : new Date()
}
