// 온보딩 투어 순수 상태 로직 (React·DOM 비의존 → node --test로 직접 검증).
// 훅(useTour.js)이 이 함수들을 DOM 존재 확인·localStorage·live signals와 엮는다.

// steps[from]부터 dir(+1/-1) 방향으로 target이 존재하는 첫 인덱스.
// 없으면 정방향은 steps.length(=종료), 역방향은 -1.
export function firstVisibleFrom(steps, isPresent, from, dir = 1) {
  for (let i = from; i >= 0 && i < steps.length; i += dir) {
    if (isPresent(steps[i])) return i
  }
  return dir > 0 ? steps.length : -1
}

// 최초 접속 자동 발동 조건: 미완료 + 데스크톱 + 앱 최초 방문(lastSeen 없음).
// isFirstVisit 게이트로 "진짜 처음 들어온 사람"만 투어를 받고, 기존 사용자는 업데이트 내역을 유지한다
// (기존 사용자는 도움말 버튼으로 투어를 재실행). hasUpdate는 여기서 안 본다 — 첫 방문자는 항상 true라 조율은 App이 willAutoStart로.
export function shouldAutoStart() {
  return false
}
