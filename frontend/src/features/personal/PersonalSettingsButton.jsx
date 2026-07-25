import { UserCog } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '../auth/AuthContext.jsx'
import PersonalSettingsPanel from './PersonalSettingsPanel.jsx'

// #13 개인설정 입구 — 사이드바 알림 벨 바로 아래. 로그인 사용자만 렌더.
export default function PersonalSettingsButton({ isExpanded = false }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  if (!user) return null

  return (
    <>
      <button
        type="button"
        className={`sidebar-icon-button ${isExpanded ? 'is-expanded' : ''}`}
        aria-label="개인설정"
        title="개인설정"
        onClick={() => setOpen(true)}
      >
        <div className="sidebar-icon-wrapper">
          <UserCog size={20} strokeWidth={2} />
        </div>
        {isExpanded && <span className="sidebar-label">개인설정</span>}
      </button>
      <PersonalSettingsPanel open={open} onOpenChange={setOpen} />
    </>
  )
}
