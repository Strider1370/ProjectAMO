import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { copilotRequest } from './copilotApi.js'
import { notifyLabsChanged } from './labsEvents.js'
import './CopilotLabs.css'

function AccountLabs() {
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    copilotRequest('/settings', undefined, controller.signal).then(setSettings)
      .catch(() => { if (!controller.signal.aborted) setError('설정을 불러오지 못했어요. 창을 다시 열어주세요.') })
    return () => controller.abort()
  }, [])
  async function update(body) {
    setBusy(true); setError(''); setMessage('')
    try {
      const value = await copilotRequest('/settings', body)
      setSettings(value); notifyLabsChanged()
      setMessage(value.enabled ? '기상이를 켰어요.' : '기상이를 껐어요.')
    } catch { setError('저장하지 못했어요. 로그인 상태와 서버 연결을 확인한 뒤 다시 시도해주세요.') }
    finally { setBusy(false) }
  }
  return <div className="copilot-labs" aria-busy={busy}>
    <h3>기상이 · 실험실</h3>
    <p>공항 METAR·TAF와 비행 경로의 기상을 물어볼 수 있는 AI 챗봇이에요. 시험 중인 기능이니 답변은 원문 자료와 함께 확인해 주세요.</p>
    <p>하루 10번까지 질문할 수 있고, 횟수는 한국 시간 자정에 초기화돼요. 질문과 관련 공항·경로 자료는 답변을 만들기 위해 OpenAI로 전달돼요.</p>
    {!settings && !error && <p role="status">설정 불러오는 중…</p>}
    {settings && <>
      {!settings.configured && <p role="alert">지금은 기상이를 사용할 수 없어요.</p>}
      {settings.quota && <p>{settings.quota.unlimited ? '관리자 계정은 질문 횟수 제한이 없어요.' : `오늘 남은 질문 ${settings.quota.remaining}/${settings.quota.limit}`}</p>}
      <label className="copilot-labs-toggle">
        <input type="checkbox" role="switch" checked={settings.enabled} disabled={busy || (!settings.enabled && !settings.configured)}
          onChange={(event) => void update({ enabled: event.target.checked })} />기상이 켜기
      </label>
      <p>켜면 화면 오른쪽 아래에 기상이 버튼이 나타나요.</p>
    </>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}

export default function CopilotLabs() {
  const { user } = useAuth()
  return user ? <AccountLabs key={user.id} /> : <div className="copilot-labs"><h3>기상이 · 실험실</h3><p>로그인하면 기상이를 켜고 하루 10번까지 질문할 수 있어요.</p></div>
}
