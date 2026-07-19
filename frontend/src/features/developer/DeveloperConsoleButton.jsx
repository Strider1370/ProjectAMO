import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Wrench } from 'lucide-react'

import { useAuth } from '../auth/AuthContext.jsx'
import { getHealth } from './developerApi.js'

// 개발자 콘솔 모달 — 운영 빌드에도 번들됨(admin 노출 경로 때문). lazy라 admin이 실제로 열기 전엔 안 받아짐.
const DeveloperConsole = lazy(() => import('./DeveloperConsole.jsx'))

// 개발자 콘솔 진입 — 사이드바 전용 아이콘.
// 노출 조건: (테스트 인스턴스 dev 빌드, 로그인 불필요) 또는 (운영 포함 어디서든 admin으로 로그인).
// 테스트 인스턴스는 1인 개발용이라 test 계정으로 자동 로그인해 로그인 절차를 없앤다(주입·경로·역할이 세션을 요구하므로).
export default function DeveloperConsoleButton({ isExpanded = false }) {
  const { user, loading, login } = useAuth()
  const [testMode, setTestMode] = useState(false)
  const [open, setOpen] = useState(false)
  const autoLoginTried = useRef(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    getHealth().then((d) => setTestMode(!!d.testMode)).catch(() => {})
  }, [])

  // 테스트 모드 + 미로그인이면 test 계정 자동 로그인(1회). dev 빌드 전용 — 운영엔 이 코드 없음.
  useEffect(() => {
    if (!import.meta.env.DEV || !testMode || loading || user || autoLoginTried.current) return
    autoLoginTried.current = true
    login('test', '1234').catch(() => {})
  }, [testMode, loading, user, login])

  const visible = (import.meta.env.DEV && testMode) || user?.role === 'admin'
  if (!visible) return null

  return (
    <>
      <button
        type="button"
        className={`sidebar-icon-button ${isExpanded ? 'is-expanded' : ''}`}
        aria-label="개발자 콘솔"
        onClick={() => setOpen(true)}
      >
        <div className="sidebar-icon-wrapper">
          <Wrench size={20} strokeWidth={2} />
        </div>
        {isExpanded && <span className="sidebar-label">개발자 콘솔</span>}
      </button>
      <Suspense fallback={null}>
        <DeveloperConsole open={open} onOpenChange={setOpen} />
      </Suspense>
    </>
  )
}
