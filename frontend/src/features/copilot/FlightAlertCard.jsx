import { useEffect, useRef, useState } from 'react'
import { copilotRequest } from './copilotApi.js'
import { formatCopilotTime } from './floatingWindow.js'

const OUTCOMES = { registered: '알람 감시를 등록했어요.', already_registered: '같은 예정 비행이 이미 등록되어 있어 중복 등록하지 않았어요.',
  deleted: '선택한 예정 비행의 알람 감시를 해제했어요.', disabled: '알림 이력은 보존하고 감시만 해제했어요.', not_active: '이미 감시 중이 아닌 항목이에요.' }
const REASONS = { CONFIRMATION_EXPIRED: '확인 유효기간이 지났어요.', CONFIRMATION_NOT_FOUND: '확인 요청이 만료되었거나 존재하지 않아요.',
  CONFIRMATION_CANCELLED: '이미 취소한 변경안이에요.', TARGET_CHANGED: '확인 대기 중 대상 비행이나 저장 원본이 바뀌었어요.',
  ETD_MUST_BE_FUTURE: '출발시각이 지났어요.', SAVED_ROUTE_NOT_FOUND: '저장 원본이 삭제되었어요.', ALERT_NOT_FOUND: '감시 대상이 없거나 이미 해제됐어요.',
  ACCOUNT_INACTIVE: '현재 계정으로 실행할 수 없어요.', FLIGHT_ALREADY_REGISTERED: '같은 출발시각의 다른 조건으로 이미 등록돼 있어요.' }

export default function FlightAlertCard({ result, timezone, onQuestion }) {
  const { flights, proposal, preparationState, confirmationToken, expiresAt, missingFields } = result.data ?? {}
  const [state, setState] = useState(null), [clock, setClock] = useState(Date.now)
  const pending = useRef(null), alive = useRef(true), feedback = useRef(null)
  useEffect(() => {
    alive.current = true
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => { alive.current = false; clearInterval(timer); pending.current?.abort() }
  }, [])
  useEffect(() => { if (state?.stage === 'done' || state?.stage === 'error') feedback.current?.focus() }, [state?.stage])
  const expired = !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= clock
  async function execute(decision) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setState({ stage: 'pending', decision })
    try {
      const receipt = await copilotRequest('/confirm', { confirmationToken, decision }, controller.signal)
      if (!['executed', 'cancelled'].includes(receipt.status)) throw new Error('INVALID_CONFIRMATION_RESPONSE')
      if (alive.current) setState({ stage: 'done', receipt })
    } catch (error) {
      if (alive.current) setState({ stage: 'error', decision, error: error.code ?? error.message ?? 'CONNECTION_FAILED',
        retryable: !error.status || error.status >= 500 || error.status === 429 })
    } finally { if (pending.current === controller) pending.current = null }
  }
  const busy = state?.stage === 'pending', done = state?.stage === 'done'
  return <section className="copilot-fact" aria-label={Array.isArray(flights) ? '내 예정 비행 알람' : '알람 변경 확인'}>
    {Array.isArray(flights) && <>
      <strong>내 예정 비행 알람 · {result.data.total}개 중 {flights.length}개</strong>
      {flights.map((flight) => <section key={flight.alertId}>
        <p>{flight.name} · 감시 #{flight.alertId} · 원본 #{flight.routeId ?? '미확인'}</p>
        <p>출발 {formatCopilotTime(flight.etd, timezone, { year: true })}</p>
        <button type="button" onClick={() => onQuestion(`예정 비행 알람 ID ${flight.alertId}의 해제 변경안을 준비해 줘`)}>감시 #{flight.alertId} 해제 질문 작성</button>
      </section>)}
      {flights.length === 0 && <p>등록된 알람 감시가 없습니다.</p>}
      {result.data.nextOffset != null && <p>다음 후보를 요청해 나머지 예정 비행을 확인하세요.</p>}
      <p>질문 작성은 해제가 아닙니다. 전송 후 확인 카드를 확인하세요.</p>
    </>}
    {proposal && <>
      <strong>{proposal.action === 'register' ? '알람 등록 변경안' : '알람 해제 변경안'} · {proposal.name}</strong>
      <p>저장 원본 #{proposal.routeId ?? '미확인'}{proposal.alertId != null && ` · 감시 #${proposal.alertId}`}</p>
      <p>출발 {formatCopilotTime(proposal.etd, timezone, { year: true })}</p>
      <p>도착 {proposal.eta ? formatCopilotTime(proposal.eta, timezone, { year: true }) : '미지정 · 도착시각 평가 제한'}</p>
      {proposal.action === 'register' && <p>감시 시작: 출발 {proposal.alertStartMinutes / 60}시간 전. 기기 알림 권한·푸시 수신을 보장하는 설정은 아닙니다.</p>}
      <p>저장 원본은 변경·삭제하지 않습니다. 확인 전에는 알람을 변경하지 않습니다.</p>
      {!done && <p>확인 만료 {formatCopilotTime(expiresAt, timezone, { year: true })}{expired ? ' · 만료됨' : ''}</p>}
      {preparationState === 'awaiting_user_confirmation' && confirmationToken && !state && !expired &&
        <div className="copilot-context-options">
          <button type="button" onClick={() => void execute('confirm')}>{proposal.action === 'register' ? '확인하고 알람 등록' : '확인하고 알람 해제'}</button>
          <button type="button" onClick={() => void execute('cancel')}>알람 변경안 취소</button>
        </div>}
    </>}
    {busy && <p role="status">처리 결과를 확인하고 있어요… 다시 클릭하지 않아도 됩니다.</p>}
    {done && <div ref={feedback} tabIndex={-1} role="status">
      {state.receipt.status === 'cancelled' ? <p>변경안을 취소했어요. 알람은 바꾸지 않았습니다.</p>
        : <><p>{OUTCOMES[state.receipt.outcome] ?? '알람 요청을 처리했어요.'}</p>
          <p>처리 대상 감시 #{state.receipt.alertId} · {formatCopilotTime(state.receipt.completedAt, timezone, { year: true })}</p>
          {state.receipt.replayed && <p>이미 처리된 요청의 결과입니다. 다시 실행하지 않았으며 현재 감시 상태는 목록에서 재확인하세요.</p>}</>}
    </div>}
    {state?.stage === 'error' && <div ref={feedback} tabIndex={-1} role="alert">
      <p>{REASONS[state.error] ?? `처리 결과를 확인하지 못했어요. (${state.error})`}</p>
      {state.retryable && <><p>이미 실행됐을 수도 있습니다. 새 요청을 만들지 않고 같은 요청으로 결과를 확인합니다.</p>
        <button type="button" onClick={() => void execute(state.decision)}>같은 요청 결과 확인·재시도</button></>}
    </div>}
    {(done || expired || (state?.stage === 'error' && !state.retryable)) && proposal &&
      <button type="button" onClick={() => onQuestion('내 예정 비행 알람 목록을 다시 확인해 줘')}>알람 목록 질문 작성</button>}
    {missingFields?.length > 0 && <p>확인할 조건: {missingFields.map((field) => ({ route_id: '저장 원본 ID', alert_id: '감시 ID', etd: '날짜가 있는 출발시각' })[field] ?? field).join(' · ')}</p>}
    {result.status === 'error' && <p role="alert">변경안을 준비하지 못했어요. ({result.error?.code}) 알람을 실행하지 않았습니다.</p>}
  </section>
}
