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
      setMessage(value.enabled ? '기상이를 켰어요.' : '기상이를 껐어요. 진행 중인 요청도 중단합니다.')
    } catch { setError('저장하지 못했어요. 로그인 상태와 서버 연결을 확인한 뒤 다시 시도해주세요.') }
    finally { setBusy(false) }
  }
  return <div className="copilot-labs" aria-busy={busy}>
    <h3>기상이 · 실험실</h3>
    <p>로그인 사용자에게 하루 5회 제공되는 LLM 챗봇입니다. 개인 API 키 입력 없이 사용하며, API 비용은 운영자가 부담합니다. 기본은 꺼짐입니다.</p>
    <p>질문과 필요한 공항·경로 자료가 OpenAI에 전달됩니다. 한국 시간 자정에 사용 횟수가 초기화됩니다.</p>
    {!settings && !error && <p role="status">설정 불러오는 중…</p>}
    {settings && <>
      <p>연결: OpenAI · {settings.model || '모델 미설정'}{settings.reasoningEffort ? ` · 추론 ${settings.reasoningEffort}` : ''}</p>
      {!settings.configured && <p role="alert">서버의 LLM 연결 설정이 필요합니다. 운영자에게 문의해주세요.</p>}
      {settings.quota && <p>오늘 남은 질문 {settings.quota.remaining}/{settings.quota.limit}</p>}
      <label className="copilot-labs-toggle">
        <input type="checkbox" role="switch" checked={settings.enabled} disabled={busy || (!settings.enabled && !settings.configured)}
          onChange={(event) => void update({ enabled: event.target.checked })} />기상이 켜기
      </label>
      <p>켜면 우측 하단에 기상이 버튼이 나타납니다. 끄면 대화는 초기화되지만 사용 횟수는 유지됩니다.</p>
      <p>메시지 하나당 1회이며 후속 질문도 포함됩니다. AI 호출 시작 후에는 오류·중지 여부와 관계없이 차감됩니다. 켜기만 해서는 차감되지 않습니다.</p>
    </>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}

export default function CopilotLabs() {
  const { user } = useAuth()
  return user ? <AccountLabs key={user.id} /> : <div className="copilot-labs"><h3>기상이 · 실험실</h3><p>로그인 후 기상이를 켜면 하루 5회 질문할 수 있어요. 개인 API 키는 필요하지 않습니다. 기본은 꺼짐입니다.</p></div>
}
