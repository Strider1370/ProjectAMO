import { useEffect, useState } from 'react'

// 마우스처럼 "올려두기"가 되는 입력장치인지. 화면 폭이 아니라 입력 방식으로 판정한다 —
// 태블릿은 폭이 넓어도 터치라, 폭 기준(useIsMobile, 719px)으로는 걸러지지 않는다.
// 손가락으로 누르면 브라우저가 가짜 mousemove를 한 번 흘리기 때문에, 호버 UI를 그대로 두면
// 화면이 바뀌기 직전에 툴팁이 깜빡였다 사라진다.
const QUERY = '(hover: hover) and (pointer: fine)'

export default function useHasHover() {
  const [hasHover, setHasHover] = useState(
    () => typeof window === 'undefined' || window.matchMedia(QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const handler = (event) => setHasHover(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return hasHover
}
