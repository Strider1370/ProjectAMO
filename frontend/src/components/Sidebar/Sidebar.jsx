import { useState } from 'react'
import { 
  Cloud, Clock, FileText, Layers, Settings, TriangleAlert, 
  Menu, Search, User, HelpCircle, MessageCircle
} from 'lucide-react'
import './Sidebar.css'

const topItems = [
  { label: 'Aviation',     icon: Layers, active: true },
  { label: 'MET',          icon: Cloud },
  { label: 'Alerts',       icon: TriangleAlert },
  { label: 'pre-briefing', icon: FileText },
]

const bottomItems = [
  { label: 'Settings', icon: Settings },
  { label: 'Help',     icon: HelpCircle },
]

function SidebarButton({ item, isExpanded, onClick }) {
  const Icon = item.icon

  return (
    <button
      className={`sidebar-icon-button${item.active ? ' is-active' : ''} ${isExpanded ? 'is-expanded' : ''}`}
      type="button"
      aria-label={item.label}
      onClick={onClick}
    >
      <div className="sidebar-icon-wrapper">
        <Icon size={20} strokeWidth={2} />
        {item.badge && !isExpanded && <span className="sidebar-badge-dot" />}
      </div>
      {isExpanded && <span className="sidebar-label">{item.label}</span>}
      {isExpanded && item.badge && <span className="sidebar-badge-count">{item.badge}</span>}
    </button>
  )
}

const PANEL_MAP = {
  Aviation:      'aviation',
  MET:           'met',
  'pre-briefing': 'route-check',
}

function Sidebar({ activePanel, onPanelToggle, isExpanded, onExpandToggle }) {
  return (
    <aside className={`sidebar ${isExpanded ? 'is-expanded' : ''}`}>
      {/* 최상단: 햄버거 & 로고 */}
      <div className="sidebar-section">
        <div className="sidebar-header">
          <button 
            className="sidebar-icon-button menu-toggle" 
            onClick={() => onExpandToggle(!isExpanded)}
          >
            <Menu size={20} />
          </button>
          {isExpanded && <span className="sidebar-logo-text">ProjectAMO</span>}
        </div>

        {/* 검색 바 (확장 시에만) */}
        {isExpanded && (
          <div className="sidebar-search-container">
            <div className="sidebar-search-box">
              <Search size={18} className="search-icon" />
              <input type="text" placeholder="Search" className="search-input" />
            </div>
          </div>
        )}

        <div className="sidebar-menu-list">
          {topItems.map((item) => {
            const panelId = PANEL_MAP[item.label]
            return (
              <SidebarButton
                key={item.label}
                isExpanded={isExpanded}
                item={{ ...item, active: panelId ? activePanel === panelId : false }}
                onClick={panelId ? () => onPanelToggle(panelId) : undefined}
              />
            )
          })}
        </div>
      </div>

      <div className="sidebar-spacer" />

      {/* 하단 섹션 */}
      <div className="sidebar-section">
        {bottomItems.map((item) => (
          <SidebarButton key={item.label} item={item} isExpanded={isExpanded} />
        ))}
        
        {/* 구분선 */}
        <div className="sidebar-divider" />
        
        {/* 프로필 영역 */}
        <div className={`sidebar-profile ${isExpanded ? 'is-expanded' : ''}`}>
          <div className="profile-avatar">
            <User size={20} />
          </div>
          {isExpanded && (
            <div className="profile-info">
              <span className="profile-email">amo.kma.go.kr</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
