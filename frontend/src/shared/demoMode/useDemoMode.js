import { useEffect, useState } from 'react'

// 시연 모드 상태 + "지금" 기준시각 — 로그인 여부와 무관하게 공개 엔드포인트를 폴링한다.
// 시연 모드가 아니면 nowMs는 실제 현재시각과 사실상 같다(서버가 매번 새로 계산해 내려줌).
export default function useDemoMode(pollMs = 30000) {
  const [state, setState] = useState({ on: false, nowMs: Date.now() })

  useEffect(() => {
    let cancelled = false
    const poll = () => fetch('/api/demo-mode')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setState({ on: !!d.on, nowMs: new Date(d.now).getTime() }) })
      .catch(() => {})
    poll()
    const t = setInterval(poll, pollMs)
    return () => { cancelled = true; clearInterval(t) }
  }, [pollMs])

  return state
}
