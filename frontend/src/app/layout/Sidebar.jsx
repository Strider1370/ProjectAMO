import {
  Cloud, FileText, Layers, Settings,
  Menu, Monitor, HelpCircle, Bell, Search, FileWarning
} from 'lucide-react'
import { CURRENT_VERSION } from '../../features/about/changelog.js'
import { useAuth, ROLE_LABEL_KO } from '../../features/auth/AuthContext.jsx'
import NotificationCenter from '../../features/notifications/NotificationCenter.jsx'
import PersonalSettingsButton from '../../features/personal/PersonalSettingsButton.jsx'
import DeveloperConsoleButton from '../../features/developer/DeveloperConsoleButton.jsx'
import './Sidebar.css'

const topItems = [
  { label: '항공정보',         icon: Layers, active: true },
  { label: '기상정보',         icon: Cloud },
  { label: 'NOTAM',            icon: FileWarning },
  { label: '상황판',           icon: Monitor, href: '/monitoring' },
  { label: '비행 전 브리핑',   icon: FileText },
]

const bottomItems = [
  { label: '업데이트', icon: Bell },
  { label: '설정',   icon: Settings },
  { label: '도움말', icon: HelpCircle }, // 클릭 시 온보딩 투어 재실행
]

function SidebarButton({ item, isExpanded, onClick }) {
  const Icon = item.icon

  return (
    <button
      className={`sidebar-icon-button${item.active ? ' is-active' : ''} ${isExpanded ? 'is-expanded' : ''}`}
      type="button"
      aria-label={item.label}
      onClick={onClick}
      disabled={item.disabled}
    >
      <div className="sidebar-icon-wrapper">
        <Icon size={20} strokeWidth={2} />
        {(item.dot || (item.badge && !isExpanded)) && <span className="sidebar-badge-dot" />}
      </div>
      {isExpanded && <span className="sidebar-label">{item.label}</span>}
      {isExpanded && item.badge && <span className="sidebar-badge-count">{item.badge}</span>}
    </button>
  )
}

const PANEL_MAP = {
  항공정보:        'aviation',
  기상정보:        'met',
  NOTAM:           'notam',
  '비행 전 브리핑': 'route-check',
  업데이트:        'updates',
  설정:            'settings',
}

function Sidebar({ activePanel, onPanelToggle, isExpanded, onExpandToggle, hasUpdate, layerCounts, onSearchOpen, onProfileClick, onHelp }) {
  const { user } = useAuth()
  // 관리자 콘솔은 사이드바 노출 없이 /admin 직접 진입(서버 requireRole로 차단). UI에 진입점 안 둠.
  // 켜진 레이어 수 배지(모바일과 동일 정보). ponytail: 축소 시 점만, 확장 시 숫자 — 36px 레일에 숫자 욱여넣지 않음.
  const counts = layerCounts || { aviation: 0, met: 0 }
  const badgeFor = (label) =>
    label === '항공정보' ? counts.aviation || undefined
    : label === '기상정보' ? counts.met || undefined
    : undefined
  return (
    <aside className={`sidebar ${isExpanded ? 'is-expanded' : ''}`}>
      {/* 최상단: 햄버거 & 로고 */}
      <div className="sidebar-section">
        <div className="sidebar-brand-mark" aria-hidden="true">
          <img className="sidebar-brand-mark-image" src="/favicon.svg" alt="" />
        </div>
        <div className="sidebar-header">
          <button 
            className="sidebar-icon-button menu-toggle" 
            onClick={() => onExpandToggle(!isExpanded)}
          >
            <Menu size={24} strokeWidth={2.1} />
          </button>
          {isExpanded && <span className="sidebar-logo-text">ProjectAMO</span>}
        </div>

        {/* 검색창은 본 기능(공항·항로 검색) 도입 시 부활 — 제안서 진행 중. */}

        <div className="sidebar-menu-list">
          <SidebarButton
            isExpanded={isExpanded}
            item={{ label: '검색', icon: Search }}
            onClick={onSearchOpen}
          />
          {topItems.map((item) => {
            const panelId = PANEL_MAP[item.label]
            const handleClick = item.href
              ? () => window.location.assign(item.href)
              : panelId ? () => onPanelToggle(panelId) : undefined
            return (
              <SidebarButton
                key={item.label}
                isExpanded={isExpanded}
                item={{ ...item, active: panelId ? activePanel === panelId : false, badge: badgeFor(item.label) }}
                onClick={handleClick}
              />
            )
          })}
        </div>
      </div>

      <div className="sidebar-spacer" />

      {/* 하단 섹션 */}
      <div className="sidebar-section">
        {/* #13 알림센터 — 로그인 사용자만(컴포넌트 자체 게이트). 벨 + 안읽음 배지 + Popover 피드. */}
        <NotificationCenter isExpanded={isExpanded} />
        {/* #13 개인설정 — 로그인 사용자만(컴포넌트 자체 게이트). 미니마·비행알림 2탭 패널. */}
        <PersonalSettingsButton isExpanded={isExpanded} />
        {/* 개발자 콘솔 — 테스트 인스턴스(dev:test)에서만 렌더(컴포넌트 자체 게이트). 운영 빌드엔 코드 없음. */}
        <DeveloperConsoleButton isExpanded={isExpanded} />
        {bottomItems.map((item) => {
          const panelId = PANEL_MAP[item.label]
          const handleClick = panelId ? () => onPanelToggle(panelId)
            : item.label === '도움말' ? onHelp
            : undefined
          return (
            <SidebarButton
              key={item.label}
              item={{
                ...item,
                active: panelId ? activePanel === panelId : false,
                dot: item.label === '업데이트' ? hasUpdate : item.dot,
              }}
              isExpanded={isExpanded}
              onClick={handleClick}
            />
          )
        })}

        {/* 버전 */}
        <div className="sidebar-version">{isExpanded ? `버전 v${CURRENT_VERSION}` : `v${CURRENT_VERSION}`}</div>

        {/* 구분선 */}
        <div className="sidebar-divider" />
        
        {/* 프로필 영역 = 계정 진입점. 로그인 전 '로그인', 후 이름·역할. */}
        <button
          type="button"
          className={`sidebar-profile ${isExpanded ? 'is-expanded' : ''}`}
          onClick={onProfileClick}
          aria-label={user ? '계정' : '로그인'}
        >
          <div className="profile-avatar">
            <img className="profile-avatar-image" src="/gisang-i/clear_3_avatar.png" alt="" />
          </div>
          {isExpanded && (
            <div className="profile-info">
              <span className="profile-name">{user ? (user.display_name || user.username) : '로그인'}</span>
              <span className="profile-email">{user ? (ROLE_LABEL_KO[user.role] || user.role) : '게스트'}</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
