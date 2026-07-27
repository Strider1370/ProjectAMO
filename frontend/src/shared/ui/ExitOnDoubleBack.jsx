import { useEffect, useRef, useState } from 'react'
import { setExitHandler } from './useCloseOnBackButton.js'
import './ExitOnDoubleBack.css'

const EXIT_ARM_WINDOW_MS = 2000

// PWA(홈 화면 설치 · standalone)에서 뒤로가기 두 번 연속 = 종료. 브라우저는 스크립트로 탭/앱을
// 진짜 닫는 API를 안 주므로(window.close는 스크립트가 연 창에만 허용), 히스토리 바닥을
// 들어갔다 나왔다 하는 걸로 흉내낸다: 첫 뒤로가기는 history를 다시 채워 넣어 취소하고 안내만
// 띄우고, 그 창 안에 한 번 더 오면 이번엔 다시 채우지 않고 그대로 흘려보내 — 앱이 정말 바닥까지
// 비면 OS가 알아서 화면을 닫는다.
// standalone일 때만 켠다 — 일반 브라우저 탭에서 이 짓을 하면 정상적인 뒤로가기 탐색을 막아버림.
// 열린 패널이 있으면 useCloseOnBackButton 쪽이 항상 먼저 처리하고(같은 리스너를 공유),
// 여기는 열린 패널이 하나도 없을 때만 불린다.
export default function ExitOnDoubleBack() {
  const [armed, setArmed] = useState(false)
  const armedRef = useRef(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!window.matchMedia?.('(display-mode: standalone)').matches) return undefined

    window.history.pushState({ amoExitFloor: true }, '')

    setExitHandler(() => {
      if (armedRef.current) {
        armedRef.current = false
        setArmed(false)
        return // 다시 채우지 않음 — 다음 뒤로가기가 실제 종료로 이어짐
      }
      window.history.pushState({ amoExitFloor: true }, '')
      armedRef.current = true
      setArmed(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        armedRef.current = false
        setArmed(false)
      }, EXIT_ARM_WINDOW_MS)
    })

    return () => {
      setExitHandler(null)
      clearTimeout(timerRef.current)
    }
  }, [])

  if (!armed) return null
  return (
    <div className="exit-double-back-toast" role="status" aria-live="polite">
      한 번 더 누르면 종료됩니다
    </div>
  )
}
