import { useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { resetPreviewSession } from './api.js'
import './PreviewMode.css'

export default function PreviewMode({ compact = false }) {
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')

  async function reset() {
    setResetting(true); setError('')
    try {
      await resetPreviewSession()
      window.location.reload()
    } catch (reason) {
      setError(reason.message || '체험 데이터를 초기화하지 못했습니다.')
      setResetting(false)
    }
  }

  return <aside className={`preview-mode${compact ? ' is-compact' : ''}`} aria-label="기관 라운지 미리보기">
    <span><strong>미리보기 체험</strong>{!compact && ' · 변경 내용은 이 브라우저의 체험 공간에만 저장되며 2시간 뒤 만료됩니다.'}</span>
    {error && <span className="preview-mode-error" role="alert">{error}</span>}
    <button type="button" onClick={reset} disabled={resetting}><RotateCcw size={15} />{resetting ? '초기화 중…' : '초기화'}</button>
    <a href="/"><X size={15} /> 종료</a>
  </aside>
}
