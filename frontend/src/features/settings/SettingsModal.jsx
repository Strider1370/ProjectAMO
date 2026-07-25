import { useState } from 'react'
import { X } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { FONT_OPTIONS, applyFont, getFontPref } from '../../shared/theme/fontPrefs.js'
import { TabList, Tab } from '../../shared/ui/fluent.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { PersonalSettingsContent } from '../personal/PersonalSettingsPanel.jsx'
import './SettingsModal.css'

// 공항별 미니마는 AIP/설비 기반 고정값 → 코드 상수(DEFAULT_AIRPORT_MINIMA_RULES)로 관리, 사용자 편집 UI 폐기.
export default function SettingsModal({ onClose }) {
  const { setTz } = useTimeZone()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('display')
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem('time_zone') || 'KST')
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'ko')
  const [fontPref, setFontPref] = useState(() => getFontPref())

  function saveToStorage() {
    localStorage.setItem('time_zone', timeZone)
    localStorage.setItem('language', language)
    setTz(timeZone)
  }
  function handleApply() { saveToStorage() }
  function handleSave() { saveToStorage(); onClose() }
  function handleReset() { setTimeZone('KST'); setLanguage('ko') }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>설정</h2>
          <button className="settings-close-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="settings-layout">
          <TabList
            className="settings-tabs"
            vertical
            selectedValue={activeTab}
            onTabSelect={(_, data) => setActiveTab(data.value)}
          >
            <Tab value="display">표시 설정</Tab>
            <Tab value="personal" disabled={!user}>개인설정</Tab>
          </TabList>

          <div className="settings-body">
            {activeTab === 'display' && (
              <fieldset className="settings-section">
                <legend>표시 설정</legend>
                <label className="settings-row">
                  <span>시간대</span>
                  <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                    <option value="UTC">UTC</option>
                    <option value="KST">KST (UTC+9)</option>
                  </select>
                </label>
                <label className="settings-row">
                  <span>언어</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="settings-row">
                  <span>글꼴 (테스트)</span>
                  <select
                    value={fontPref}
                    onChange={(e) => { setFontPref(e.target.value); applyFont(e.target.value) }}
                  >
                    {FONT_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </fieldset>
            )}
            {activeTab === 'personal' && user && <PersonalSettingsContent />}
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-btn-reset" onClick={handleReset}>초기화</button>
          <button className="settings-btn-apply" onClick={handleApply}>적용</button>
          <button className="settings-btn-save" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
