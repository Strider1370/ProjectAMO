import { useEffect, useState } from 'react'

// 화면 폭이 minWidth 이상인지. 지도형 브리핑은 1024 이상에서만 쓴다.
export default function useMinWidth(minWidth) {
  const query = `(min-width: ${minWidth}px)`
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = (event) => setMatches(event.matches)
    setMatches(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}
