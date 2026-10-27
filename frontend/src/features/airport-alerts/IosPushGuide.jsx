import { Share, SquarePlus } from 'lucide-react'

// 아이폰 사파리 탭에서는 푸시를 받을 수 없다 — 홈 화면에 추가하는 방법을 단계로 보여 준다.
export default function IosPushGuide() {
  return <div className="aa-ios-guide" role="note" aria-label="아이폰에서 푸시 받는 방법">
    <strong>아이폰은 홈 화면에 추가해야 푸시를 받을 수 있습니다</strong>
    <ol>
      <li>화면 아래 <Share size={15} aria-label="공유" /> 공유 버튼을 누릅니다</li>
      <li><SquarePlus size={15} aria-hidden="true" /> "홈 화면에 추가"를 누릅니다</li>
      <li>홈 화면의 ProjectAMO 아이콘으로 열고 로그인합니다</li>
      <li>알림 → 감시 대상 → 받는 방법에서 휴대폰 푸시를 켭니다</li>
    </ol>
  </div>
}
