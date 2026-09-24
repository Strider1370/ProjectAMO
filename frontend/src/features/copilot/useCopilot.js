import { useEffect, useRef, useState } from 'react'
import { copilotRequest } from './copilotApi.js'
import { LABS_CHANGED } from './labsEvents.js'

export function useCopilot(userId) {
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [retryable, setRetryable] = useState(false)
  const [conversationContext, setConversationContext] = useState(null)
  const pendingContext = useRef(null)
  const conversation = useRef(null), pending = useRef(null), epoch = useRef(0)
  const mounted = useRef(true)
  const aborter = useRef(null)
  const statusValue = useRef(null), statusRequest = useRef(0)
  function clearSession() {
    epoch.current++
    aborter.current?.abort()
    aborter.current = null
    conversation.current = null
    pending.current = null
    pendingContext.current = null; setConversationContext(null)
    setMessages([]); setDraft(''); setBusy(false); setError(null); setRetryable(false)
  }
  const refreshStatus = () => {
    const request = ++statusRequest.current
    return copilotRequest('/status').then((value) => {
      if (!mounted.current || request !== statusRequest.current) return
      if (!value.enabled || (statusValue.current && value.revision !== statusValue.current.revision)) clearSession()
      statusValue.current = value; setStatus(value)
    }).catch(() => {
      if (mounted.current && request === statusRequest.current) {
        clearSession(); statusValue.current = null; setStatus({ enabled: false, ready: false, reason: 'UNAVAILABLE' })
      }
    })
  }
  useEffect(() => {
    mounted.current = true
    clearSession(); setStatus(null); statusValue.current = null; refreshStatus()
    const changed = () => { clearSession(); setStatus(null); refreshStatus() }
    const focus = () => { void refreshStatus() }
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(LABS_CHANGED) : null
    if (channel) channel.onmessage = changed
    window.addEventListener(LABS_CHANGED, changed)
    window.addEventListener('focus', focus)
    return () => {
      mounted.current = false; statusRequest.current++; aborter.current?.abort()
      window.removeEventListener(LABS_CHANGED, changed); window.removeEventListener('focus', focus); channel?.close()
    }
  }, [userId])

  useEffect(() => {
    if (!status?.quota?.resetsAt) return
    const delay = Date.parse(status.quota.resetsAt) - Date.now() + 250
    if (!Number.isFinite(delay)) return
    const timer = setTimeout(() => { void refreshStatus() }, Math.max(1000, Math.min(delay, 86_400_000)))
    return () => clearTimeout(timer)
  }, [status?.quota?.resetsAt, userId])

  async function send(context, displayTimezone, retry = false, submittedMessage = draft, selection = null) {
    if (aborter.current || !userId || !status?.ready || (!retry && !submittedMessage.trim())) return
    if (!retry && status?.quota?.remaining === 0) { setError('DAILY_QUESTION_LIMIT'); return }
    const generation = epoch.current
    const controller = new AbortController()
    aborter.current = controller
    setBusy(true); setError(null); setRetryable(false)
    try {
      if (!retry && selection?.startNewConversation) conversation.current = null
      if (!conversation.current) {
        const created = await copilotRequest('/conversations', {}, controller.signal)
        if (generation !== epoch.current) return
        conversation.current = created
      }
      if (generation !== epoch.current) return
      if (!retry) {
        const input = { conversationId: conversation.current.conversationId, revision: conversation.current.revision,
          requestId: crypto.randomUUID(), message: submittedMessage.trim(), context: structuredClone(context), displayTimezone }
        pending.current = input
        pendingContext.current = { context: structuredClone(context), snapshot: selection?.snapshot ?? null, label: selection?.label ?? null }
        setMessages((items) => [...items, { id: input.requestId, role: 'user', text: input.message,
          contextLabel: selection?.label, contextBoundary: selection?.startNewConversation === true }].slice(-80))
        setDraft((value) => value === submittedMessage ? '' : value)
      }
      const request = pending.current
      if (!request) return
      const response = await copilotRequest('/chat', request, controller.signal)
      if (generation !== epoch.current) return
      if (response.quota) setStatus((value) => ({ ...value, quota: response.quota }))
      conversation.current.revision = response.revision
      setConversationContext(pendingContext.current)
      setMessages((items) => [...items.filter((item) => item.id !== `${request.requestId}:answer`),
        { id: `${request.requestId}:answer`, role: 'assistant', ...response }].slice(-80))
      pending.current = null
      pendingContext.current = null
    } catch (cause) {
      if (generation !== epoch.current || !mounted.current) return
      setError(cause.code ?? 'CONNECTION_FAILED')
      if (cause.quota) setStatus((value) => ({ ...value, quota: cause.quota }))
      setRetryable(Boolean(pending.current) && cause.code !== 'QUESTION_ALREADY_STARTED' && (!cause.status || cause.status >= 500 || cause.status === 409))
    } finally {
      if (generation === epoch.current) { aborter.current = null; if (mounted.current) { setBusy(false); void refreshStatus() } }
    }
  }
  async function cancel() {
    if (!pending.current) return
    const { conversationId, requestId } = pending.current
    try { await copilotRequest('/cancel', { conversationId, requestId }) }
    catch { setError('CANCEL_FAILED') }
  }
  function reset() {
    if (busy) return
    epoch.current++
    conversation.current = null; pending.current = null
    pendingContext.current = null; setConversationContext(null)
    setMessages([]); setError(null); setRetryable(false)
  }
  return { status, refreshStatus, messages, draft, setDraft, busy, error, retryable, conversationContext, send, cancel, reset }
}
