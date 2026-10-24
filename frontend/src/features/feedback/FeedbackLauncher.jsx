import { MessageSquare } from 'lucide-react'

import './feedback.css'

// 지도 오른쪽 위의 의견 보내기 입구(데스크톱). 휴대폰은 더보기 메뉴에서 연다.
export default function FeedbackLauncher({ onOpen }) {
  return (
    <button type="button" className="feedback-launcher" onClick={onOpen}>
      <MessageSquare size={16} strokeWidth={2} aria-hidden="true" />
      의견 보내기
    </button>
  )
}
