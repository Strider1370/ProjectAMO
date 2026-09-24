import { useState } from 'react'
import { X } from 'lucide-react'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { readDisplayPreferences, saveDisplayPreferences } from '../../shared/settings/displayPreferences.js'
import { TabList, Tab } from '../../shared/ui/fluent.js'
import { useCloseOnBackButton } from '../../shared/ui/useCloseOnBackButton.js'
import './SettingsModal.css'
import CopilotLabs from '../copilot/CopilotLabs.jsx'

// 공항별 미니마는 AIP/설비 기반 고정값 → 코드 상수(DEFAULT_AIRPORT_MINIMA_RULES)로 관리, 사용자 편집 UI 폐기.
export default function SettingsModal({ onClose }) {
  useCloseOnBackButton(true, onClose)
  const { setTz } = useTimeZone()
  const [activeTab, setActiveTab] = useState('display')
  const [preferences] = useState(readDisplayPreferences)
  const [timeZone, setTimeZone] = useState(preferences.timeZone)
  const [language, setLanguage] = useState(preferences.language)
  const [saveError, setSaveError] = useState('')
  const [retryCloses, setRetryCloses] = useState(false)

  function saveToStorage({ closeWhenSaved = false } = {}) {
    const result = saveDisplayPreferences({ timeZone, language })
    // storage write가 일부 또는 전부 실패해도 이 세션의 표시 시간대는 적용한다.
    setTz(result.timeZone)
    setTimeZone(result.timeZone)
    setLanguage(result.language)
    if (!result.ok) {
      setSaveError('설정을 이 기기에 저장하지 못했습니다. 현재 세션에는 적용되어 있으며 다시 시도할 수 있습니다.')
      setRetryCloses(closeWhenSaved)
      return false
    }
    setSaveError('')
    setRetryCloses(false)
    if (closeWhenSaved) onClose()
    return true
  }
  function handleApply() { saveToStorage() }
  function handleSave() { saveToStorage({ closeWhenSaved: true }) }
  function handleRetry() { saveToStorage({ closeWhenSaved: retryCloses }) }
  function handleReset() { setTimeZone('KST'); setLanguage('ko'); setSaveError('') }

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
            <Tab value="labs">실험실</Tab>
          </TabList>

          <div className="settings-body">
            {activeTab === 'labs' && <CopilotLabs />}
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
              </fieldset>
            )}
          </div>
        </div>

        {saveError && (
          <div className="settings-save-error" role="alert">
            <span>{saveError}</span>
            <button type="button" onClick={handleRetry}>다시 시도</button>
          </div>
        )}

        {activeTab === 'display' && <div className="settings-footer">
          <button className="settings-btn-reset" onClick={handleReset}>초기화</button>
          <button className="settings-btn-apply" onClick={handleApply}>적용</button>
          <button className="settings-btn-save" onClick={handleSave}>저장</button>
        </div>}
      </div>
    </div>
  )
}
