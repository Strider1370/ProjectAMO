import { useEffect, useState } from 'react'

// 시연 모드 상태 + "지금" 기준시각 — 로그인 여부와 무관하게 공개 엔드포인트를 폴링한다.
// 시연 모드가 아니면 nowMs는 실제 현재시각과 사실상 같다(서버가 매번 새로 계산해 내려줌).
// 여러 화면(지도·공항 패널·TAF·브리핑)이 함께 쓰므로 요청은 하나로 묶는다. 관리자 화면이 시연을 바꾸면
// projectamo:data-view-changed 이벤트로 바로 다시 읽는다.
let shared = { on: false, nowMs: Date.now() }
const listeners = new Set()
let timer = null

function poll() {
  return fetch('/api/demo-mode')
    .then((r) => r.json())
    .then((d) => {
      shared = { on: !!d.on, nowMs: new Date(d.now).getTime() }
      for (const listener of listeners) listener(shared)
    })
    .catch(() => {})
}

export default function useDemoMode(pollMs = 30000) {
  const [state, setState] = useState(shared)

  useEffect(() => {
    listeners.add(setState)
    setState(shared)
    if (listeners.size === 1) {
      poll()
      timer = setInterval(poll, pollMs)
      window.addEventListener('projectamo:data-view-changed', poll)
    }
    return () => {
      listeners.delete(setState)
      if (listeners.size === 0) {
        clearInterval(timer)
        timer = null
        window.removeEventListener('projectamo:data-view-changed', poll)
      }
    }
  }, [pollMs])

  return state
}

// 시연 중이면 시연 기준시각, 아니면 undefined(각 화면이 실제 현재 시각을 쓴다).
export function useDemoNowMs() {
  const { on, nowMs } = useDemoMode()
  return on ? nowMs : undefined
}
