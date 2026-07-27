import { useEffect, useRef } from 'react'

// 모바일 브라우저 "뒤로가기"가 패널만 닫는 대신 앱 자체를 벗어나 버리는 문제 방지.
// 패널이 열릴 때 history entry를 하나 쌓아 두고, 뒤로가기(popstate)가 오면 그 entry를 소비하며
// onClose만 부른다. X 버튼 등 다른 방식으로 먼저 닫히면 쌓아 둔 entry를 되돌려(history.back())
// 히스토리를 다시 맞춘다 — 안 그러면 다음 뒤로가기가 빈 entry 하나를 더 필요로 하게 된다.
//
// 두 가지를 반드시 모듈 전역(컴포넌트 인스턴스별이 아니라)에서 관리해야 한다:
//  1. popstate 리스너 — 패널마다 따로 달면, 패널 두 개가 동시에 열려 있을 때(예: 첫 방문
//     업데이트 모달 자동 오픈 + 딥링크 공항 패널) 뒤로가기 한 번에 리스너 두 개가 다 반응해
//     버린다. 리스너는 하나만 두고, 실제로 맨 위(가장 나중에 연) 패널만 닫는다.
//  2. "내가 쌓은 entry가 아직 맨 위인가" — X 버튼으로 먼저 연 패널부터 닫으면(스택 중간),
//     여기서 그냥 history.back()을 부르면 그 위에 여전히 열려 있는 다른 패널의 entry를
//     대신 삼켜 버려 엉뚱한 패널이 닫힌다. 맨 위일 때만 back()을 부르고, 아니면 real
//     history는 건드리지 않는다(그 entry는 위쪽이 다 닫힐 때 자연히 넘어간다).
//
// back()을 cleanup에서 곧바로 부르면 React 18 StrictMode의 개발 전용 이중 실행
// (mount→cleanup→mount가 같은 틱에 일어남)과도 충돌한다: cleanup의 back()이 비동기로
// 실제 내비게이션을 큐에 넣어 두면, 그 popstate가 나중에 "진짜" 재마운트 시점에 도착해
// 패널이 열리자마자 닫혀 버린다. activeRef로 "지금 이 패널을 쓰는 mount가 있는지" 세고,
// back()은 마이크로태스크로 미뤄 그 사이 새 mount가 없었을 때만(=진짜 닫힘일 때만) 부른다.

const stack = []
let nextId = 0
let listenerAttached = false
let exitHandler = null
let selfTriggeredBacks = 0

function ensureListener() {
  if (listenerAttached) return
  listenerAttached = true
  window.addEventListener('popstate', () => {
    // X 버튼 등으로 닫을 때 우리 스스로 부른 history.back()의 결과 — 이미 스택에서
    // 지운 entry를 되돌리는 뒷정리일 뿐, 사용자가 지금 막 뒤로가기를 누른 게 아니다.
    // 여기서 걸러내지 않으면 스택이 비어있을 때 exitHandler(PWA 종료 로직)가 이걸
    // "루트에서 뒤로가기"로 오인해서 엉뚱하게 무장돼 버린다.
    if (selfTriggeredBacks > 0) {
      selfTriggeredBacks -= 1
      return
    }
    if (stack.length > 0) {
      const top = stack.pop()
      top?.onClose?.()
      return
    }
    // 열린 패널이 하나도 없을 때의 뒤로가기 — PWA "두 번 눌러 종료"(ExitOnDoubleBack)가
    // 등록해 둔 핸들러가 있으면 넘긴다. 같은 popstate 이벤트를 리스너 두 개가 따로 받으면
    // 등록 순서에 따라 "패널을 막 닫은 이벤트"를 종료 로직이 동시에 오인할 수 있어, 반드시
    // 이 하나의 리스너를 거쳐야 한다.
    exitHandler?.()
  })
}

// ExitOnDoubleBack 전용 — 앱에 인스턴스가 하나뿐이라 마지막 등록이 그냥 이긴다.
export function setExitHandler(fn) {
  exitHandler = fn
  ensureListener()
}

export function useCloseOnBackButton(open, onClose) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const idRef = useRef(null)
  const activeRef = useRef(0)

  useEffect(() => {
    if (!open) return undefined
    ensureListener()
    activeRef.current += 1
    if (idRef.current == null) {
      idRef.current = ++nextId
      window.history.pushState({ amoPanel: idRef.current }, '')
      stack.push({ id: idRef.current, onClose: () => onCloseRef.current?.() })
    }

    return () => {
      activeRef.current -= 1
      queueMicrotask(() => {
        if (activeRef.current > 0 || idRef.current == null) return
        const id = idRef.current
        idRef.current = null
        const posInStack = stack.findIndex((entry) => entry.id === id)
        if (posInStack === -1) return // 이미 popstate로 소비됨
        const isTop = posInStack === stack.length - 1
        stack.splice(posInStack, 1)
        if (isTop) {
          selfTriggeredBacks += 1
          window.history.back()
        }
      })
    }
  }, [open])
}
