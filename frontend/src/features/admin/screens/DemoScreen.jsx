import DemoModePanel from '../DemoModePanel.jsx'

// 운영 시연은 테스트 조작과 다른 관리자 기능이다. 테스트 capability가 없어도 여기서
// 스냅샷 기반 시연 시작·종료를 계속 판단하고 실행할 수 있다.
export default function DemoScreen() {
  return <DemoModePanel />
}
