import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import MobileSheet from '../../shared/ui/MobileSheet.jsx'
import { useCopilot } from './useCopilot.js'
import { floatingWindow, formatCopilotTime } from './floatingWindow.js'
import { createContextRegistration } from './contextRegistration.js'
import { captureChatContext, needsContextChoice, sameChatContext, startsContextConversation } from './contextChoice.js'
import AltitudeComparisonCard from './AltitudeComparisonCard.jsx'
import RouteSettingsCard from './RouteSettingsCard.jsx'
import RoutePlanCard from './RoutePlanCard.jsx'
import SavedRoutesCard from './SavedRoutesCard.jsx'
import FlightAlertCard from './FlightAlertCard.jsx'
import UiActionCard from './UiActionCard.jsx'
import RawReportCard from './RawReportCard.jsx'
import { answerParagraphs } from './answerText.js'
import { validBriefingRef } from '../route-briefing/lib/copilotResult.js'
import './CopilotPanel.css'

const AVATAR = '/gisang-i/clear_3_avatar.png'
const TOOL_LABELS = { get_airport_weather: '공항 관측·예보', get_weather_advisories: 'SIGMET·AIRMET',
  get_route_briefing: '경로 브리핑', get_briefing_detail: '브리핑 근거', compare_route_altitudes: '고도 비교', get_my_saved_route: '저장 경로 재브리핑' }
function FactCard({ card, timezone, onOpenResult, onRequery, resultAction }) {
  const { result } = card
  const opening = resultAction?.opening
  const error = resultAction?.ref === result.reference?.briefingRef ? resultAction?.error : null
  return <details className="copilot-fact">
    <summary>{TOOL_LABELS[card.tool] ?? '조회 자료'} · {result.status === 'ok' ? '조회됨' : '일부 미확인'}</summary>
    <p>기준 {formatCopilotTime(result.reference?.effectiveNow, timezone)}</p>
    {result.reference?.modelTimeCoverage?.selectedKimRun && <p>KIM 유효 {formatCopilotTime(result.reference.modelTimeCoverage.selectedKimRun.validTime, timezone)}</p>}
    {result.reference?.modelTimeCoverage?.status === 'outside_available_frames' && <p>요청 시각이 보관된 KIM 예보 범위를 벗어납니다.</p>}
    {card.tool === 'compare_route_altitudes' && <AltitudeComparisonCard result={result} />}
    {result.reference?.contextRevision && <p>경로 버전: {result.reference.contextRevision}</p>}
    {(result.sources ?? []).slice(0, 8).map((source, index) => <p key={index}>
      {source.kind ?? source.source ?? '자료'} · {source.status ?? '상태 미상'} · {formatCopilotTime(source.fetchedAt, timezone)}
    </p>)}
    {result.issues?.length > 0 && <p>미확인·누락 항목 {result.issues.length}개. 경보 없음이나 안전을 뜻하지 않습니다.</p>}
    {(result.issues ?? []).slice(0, 6).map((issue, index) => <p className="copilot-source-code" key={index}>{issue.code}</p>)}
    {onOpenResult && validBriefingRef(result.reference?.briefingRef) && result.reference.resultHash &&
      <button type="button" disabled={opening} onClick={() => void onOpenResult(result.reference)}>{opening ? '보관 결과 여는 중…' : '같은 결과 전체 보기'}</button>}
    {error && <div role="alert"><p>보관 결과를 열지 못했어요. ({error}) 최신 자료로 자동 대체하지 않았습니다.</p>
      {['REFERENCE_EXPIRED', 'REFERENCE_NOT_FOUND'].includes(error) && <button type="button" onClick={onRequery}>현재 경로로 다시 질문 작성</button>}</div>}
  </details>
}

export default function CopilotPanel({ user, airport, timezone = 'Asia/Seoul', isMobile,
  mobileBlocked, onOpenRequest, onLogin, getRouteContext, onOpenResult, onPreviewRouteSettings, onApplyRouteSettings,
  onPreviewSavedRoute, onApplySavedRoute, onUiAction }) {
  const chat = useCopilot(user?.id)
  const [open, setOpen] = useState(false), [expanded, setExpanded] = useState(false)
  const [position, setPosition] = useState(null), [attachContext, setAttachContext] = useState(true)
  const [mobileDetent, setMobileDetent] = useState('full')
  const [preparing, setPreparing] = useState(false), [contextError, setContextError] = useState(null)
  const [contextChoice, setContextChoice] = useState(null)
  const choiceHeading = useRef(null)
  const [resultAction, setResultAction] = useState(null)
  const [settingsAction, setSettingsAction] = useState(null)
  const [uiActions, setUiActions] = useState({})
  const uiActionPending = useRef(false)
  const settingsPending = useRef(false)
  const resultOwner = useRef(user?.id)
  resultOwner.current = user?.id
  const registerContext = useMemo(() => createContextRegistration(), [user?.id])
  const preparation = useRef(null)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const launcher = useRef(null), input = useRef(null), thread = useRef(null), drag = useRef(null)
  const scroll = useRef({ top: 0, follow: true })
  const size = floatingWindow(viewport, expanded, position)
  function close() { setOpen(false); launcher.current?.focus() }
  async function applyUiAction(cardId, action) {
    if (uiActionPending.current || !onUiAction) return
    uiActionPending.current = true
    const owner = resultOwner.current
    setUiActions((previous) => ({ ...previous, [cardId]: { stage: 'pending' } }))
    try {
      const receipt = await onUiAction(action)
      if (owner !== resultOwner.current) return
      if (receipt?.status !== 'applied') throw new Error('UI_ACTION_NOT_CONFIRMED')
      setUiActions((previous) => ({ ...previous, [cardId]: { stage: 'done', receipt } }))
      close()
    } catch (error) {
      if (owner === resultOwner.current) setUiActions((previous) => ({ ...previous,
        [cardId]: { stage: 'error', error: error.code ?? error.message ?? 'UI_ACTION_FAILED' } }))
    } finally { uiActionPending.current = false }
  }
  useEffect(() => { setUiActions({}) }, [user?.id])
  async function applyRouteSettings(cardId, action, preview, owner) {
    if (owner !== resultOwner.current) return
    const result = await onApplyRouteSettings(action, preview.revision)
    if (owner !== resultOwner.current) return
    if (result?.status !== 'prefilled') throw new Error('ROUTE_SETTINGS_NOT_APPLIED')
    setSettingsAction({ cardId, stage: 'done' }); close()
  }
  async function prepareRouteSettings(cardId, action, confirmed = null) {
    if (settingsPending.current) return
    const owner = resultOwner.current
    settingsPending.current = true
    setSettingsAction({ cardId, stage: 'pending' })
    try {
      const preview = confirmed ?? await onPreviewRouteSettings(action)
      if (owner !== resultOwner.current) return
      if (!confirmed && preview.requiresConfirmation) setSettingsAction({ cardId, stage: 'confirm', action, preview })
      else await applyRouteSettings(cardId, action, preview, owner)
    } catch (failure) {
      if (owner === resultOwner.current) setSettingsAction({ cardId, stage: 'error', error: failure.code ?? failure.message ?? 'ROUTE_SETTINGS_UNAVAILABLE' })
    } finally { settingsPending.current = false }
  }
  async function openStoredResult(reference) {
    const owner = resultOwner.current
    setResultAction({ ref: reference.briefingRef, opening: true, error: null })
    try {
      await onOpenResult(reference)
      if (owner === resultOwner.current) { setResultAction(null); close() }
    } catch (failure) {
      if (owner === resultOwner.current) setResultAction({ ref: reference.briefingRef, opening: false,
        error: failure.code ?? failure.message ?? 'RESULT_UNAVAILABLE' })
    }
  }
  function show() {
    chat.refreshStatus()
    onOpenRequest(() => { setOpen(true); requestAnimationFrame(() => (choiceHeading.current ?? input.current)?.focus()) })
  }
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight })
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => { window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update) }
  }, [])
  useEffect(() => { if (isMobile && mobileBlocked) setOpen(false) }, [isMobile, mobileBlocked])
  useEffect(() => { if (!chat.status?.enabled) setOpen(false) }, [chat.status?.enabled])
  useEffect(() => {
    preparation.current?.abort(); preparation.current = null
    setPreparing(false); setContextChoice(null); setContextError(null); setResultAction(null); setSettingsAction(null)
    return () => { preparation.current?.abort() }
  }, [user?.id])
  useEffect(() => {
    if (thread.current && scroll.current.follow) thread.current.scrollTop = thread.current.scrollHeight
  }, [chat.messages, chat.busy, open, contextChoice])
  useEffect(() => { if (contextChoice && open) choiceHeading.current?.focus() }, [contextChoice, open])
  async function submitContext(candidate, submittedMessage, displayTimezone, signal) {
    const selected = structuredClone(candidate)
    if (selected.context) {
      const registered = await registerContext(selected.snapshot, signal)
      if (signal.aborted) return
      selected.context.contextRef = registered.contextRef
      selected.context.revision = registered.revision
    }
    if (signal.aborted) return
    await chat.send(selected.context, displayTimezone, false, submittedMessage, {
      ...selected, startNewConversation: startsContextConversation(chat.conversationContext, selected),
    })
  }
  async function send(retry = false) {
    if (chat.busy || preparation.current || contextChoice) return
    if (!retry && chat.status?.quota?.remaining === 0) return
    scroll.current.follow = true
    if (retry) return chat.send(null, timezone, true)
    const submittedMessage = chat.draft
    if (!submittedMessage.trim()) return
    // Freeze the selected screen at send, never while a provider request runs.
    const controller = new AbortController()
    preparation.current = controller
    setPreparing(true); setContextError(null)
    try {
      const candidate = await captureChatContext(attachContext ? getRouteContext?.() : null, airport, attachContext)
      if (controller.signal.aborted) return
      if (attachContext && needsContextChoice(chat.conversationContext, candidate)) {
        setContextChoice({ current: candidate, previous: chat.conversationContext, submittedMessage, timezone })
        return
      }
      await submitContext(candidate, submittedMessage, timezone, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) setContextError(error.code ?? 'CONTEXT_REGISTRATION_FAILED')
    } finally { if (preparation.current === controller) { preparation.current = null; setPreparing(false) } }
  }
  async function chooseContext(which) {
    if (!contextChoice || chat.busy || preparation.current) return
    const frozen = contextChoice
    const controller = new AbortController()
    preparation.current = controller
    setPreparing(true); setContextError(null)
    try {
      let candidate = frozen[which]
      if (which === 'current') {
        const latest = await captureChatContext(getRouteContext?.(), airport)
        if (controller.signal.aborted) return
        if (!sameChatContext(latest, frozen.current)) {
          setContextChoice({ ...frozen, current: latest, changedAgain: true })
          return
        }
      } else if (which === 'none') candidate = await captureChatContext(null, null, false)
      if (controller.signal.aborted) return
      if (which === 'none') setAttachContext(false)
      setContextChoice(null)
      await submitContext(candidate, frozen.submittedMessage, frozen.timezone, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) setContextError(error.code ?? 'CONTEXT_REGISTRATION_FAILED')
    } finally { if (preparation.current === controller) { preparation.current = null; setPreparing(false) } }
  }
  const composer = contextChoice ? null : <form className="copilot-composer" onSubmit={(event) => { event.preventDefault(); void send() }}>
    {chat.status?.quota && <p role="status">오늘 남은 질문 {chat.status.quota.remaining}/{chat.status.quota.limit} · 한국 시간 자정 초기화</p>}
    {!user ? <button type="button" onClick={onLogin}>로그인하고 질문하기</button>
      : !chat.status?.ready ? <p role="status">{chat.status?.reason === 'PROVIDER_NOT_CONFIGURED' ? '서버의 LLM 연결 설정이 필요해요.' : '현재 대화 서비스를 사용할 수 없어요.'}</p>
        : <>
          <label className="copilot-input-label" htmlFor="copilot-message">기상이에게 질문</label>
          <textarea ref={input} id="copilot-message" value={chat.draft} maxLength={4000} rows={2}
            readOnly={Boolean(contextChoice) || chat.status?.quota?.remaining === 0}
            placeholder="공항 날씨나 경로 자료를 물어보세요"
            onChange={(event) => chat.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !isMobile) { event.preventDefault(); if (!chat.busy) void send() }
            }} />
          <div className="copilot-send-row"><span>AI 답변 · 자료 시각과 누락을 확인하세요</span>
            {chat.busy || preparing ? <button type="button" onClick={() => chat.busy ? void chat.cancel() : preparation.current?.abort()}>중지</button>
              : <button type="submit" disabled={!chat.draft.trim() || Boolean(contextChoice) || chat.status?.quota?.remaining === 0}>전송</button>}</div>
          {chat.status?.quota?.remaining === 0 && <p>오늘 질문 5회를 모두 사용했어요. 한국 시간 자정 이후 다시 이용해주세요.</p>}
        </>}
  </form>
  const body = <>
    <div className="copilot-context"><label><input type="checkbox" checked={attachContext} disabled={preparing || Boolean(contextChoice)} onChange={(event) => setAttachContext(event.target.checked)} />현재 화면 연결</label>
      <span>{attachContext ? airport ?? '선택 공항 없음' : '화면 맥락 제외'} · {timezone === 'UTC' ? 'UTC' : 'KST'}</span>
      {chat.conversationContext?.label && <span>최근 질문 기준: {chat.conversationContext.label}</span>}</div>
    <div className="copilot-thread" role="log" aria-label="기상이 대화 내역" aria-live="polite"
      ref={(node) => { thread.current = node; if (node) node.scrollTop = scroll.current.top }}
      onScroll={(event) => { const node = event.currentTarget; scroll.current = { top: node.scrollTop, follow: node.scrollHeight - node.scrollTop - node.clientHeight < 50 } }}>
      {!chat.messages.length && <div className="copilot-welcome"><img src={AVATAR} alt="" /><h2>무엇을 확인해 볼까요?</h2>
        <p>공항 관측·예보와 SIGMET·AIRMET을 확인하고, 자료의 뜻과 부족한 부분을 설명해 드려요.</p>
        <p className="copilot-disclosure">전송한 질문과 필요한 기상·경로 자료는 OpenAI API로 전달됩니다. 내 저장 경로를 요청하면 해당 후보의 이름·비행 조건도 포함됩니다.</p></div>}
      <div hidden={Boolean(contextChoice)}>{chat.messages.map((message) => <article className={`copilot-message ${message.role}`} key={message.id}>
        {message.role === 'assistant' && <img src={AVATAR} alt="기상이" />}
        <div className="copilot-message-body">
          {message.contextLabel && <p className="copilot-message-context">{message.contextBoundary ? '새 대화 기준' : '질문 기준'}: {message.contextLabel}</p>}
          {/* Spaced paragraphs; the newline text between them keeps the bubble text equal to the answer's words. */}
          <div className={`copilot-bubble${message.role === 'assistant' ? ' copilot-bubble-lines' : ''}`}>{message.role === 'assistant'
            ? answerParagraphs(message.text)
              .map((line, i) => <Fragment key={i}>{i ? '\n' : ''}<p>{line}</p></Fragment>)
            : message.text}</div>
          {(message.cards ?? []).map((card, index) => card.tool === 'request_ui_action'
            ? <UiActionCard key={`${user?.id}:${index}`} result={card.result} state={uiActions[`${message.id}:${index}`]}
              onApply={onUiAction ? (action) => void applyUiAction(`${message.id}:${index}`, action) : null} />
            : card.tool === 'prepare_route_settings'
            ? <RouteSettingsCard key={`${user?.id}:${index}`} result={card.result} timezone={message.displayTimezone ?? timezone}
              state={settingsAction?.cardId === `${message.id}:${index}` ? settingsAction : null}
              onPrepare={onPreviewRouteSettings && onApplyRouteSettings ? () => void prepareRouteSettings(`${message.id}:${index}`, card.result.data.action) : null}
              onConfirm={() => void prepareRouteSettings(`${message.id}:${index}`, settingsAction.action, settingsAction.preview)}
              onCancel={() => setSettingsAction(null)} />
            : card.tool === 'plan_route'
              ? <RoutePlanCard key={`${user?.id}:${index}`} result={card.result} timezone={message.displayTimezone ?? timezone} />
            : ['list_my_flight_alerts', 'prepare_flight_alert'].includes(card.tool)
              ? <FlightAlertCard key={`${user?.id}:${index}`} result={card.result} timezone={message.displayTimezone ?? timezone}
                onQuestion={(text) => { chat.setDraft(text); input.current?.focus() }} />
            : ['search_my_routes', 'get_my_saved_route'].includes(card.tool)
              ? <div key={`${user?.id}:${index}`}><SavedRoutesCard result={card.result} timezone={message.displayTimezone ?? timezone}
                onSelect={(text) => { chat.setDraft(text); input.current?.focus() }} onPrepare={onPreviewSavedRoute}
                onApply={onApplySavedRoute} onImported={close} />
                {validBriefingRef(card.result.reference?.briefingRef) && <FactCard card={card} timezone={message.displayTimezone ?? timezone}
                  resultAction={resultAction} onOpenResult={onOpenResult ? openStoredResult : null}
                  onRequery={() => { chat.setDraft(`저장 경로 ID ${card.result.data?.savedRoute?.id}를 현재 자료로 다시 브리핑해 줘`); input.current?.focus() }} />}</div>
            : <Fragment key={`${user?.id}:${index}`}>
              {card.tool === 'get_airport_weather' && <RawReportCard result={card.result} />}
              <FactCard card={card} timezone={message.displayTimezone ?? timezone}
                resultAction={resultAction} onOpenResult={onOpenResult ? openStoredResult : null}
                onRequery={() => { setAttachContext(true); chat.setDraft('현재 적용된 경로를 최신 자료로 다시 브리핑해 줘'); input.current?.focus() }} /></Fragment>)}
          {message.status && message.status !== 'completed' && <span className="copilot-result-state">{message.status === 'cancelled' ? '중지됨' : '응답 미완료'}</span>}
        </div>
      </article>)}</div>
      {chat.busy && <p role="status">기상 자료를 확인하고 있어요… 창을 접어도 계속됩니다.</p>}
      {contextChoice && <section className="copilot-context-choice" aria-labelledby="copilot-context-choice-title">
        <h3 id="copilot-context-choice-title" ref={choiceHeading} tabIndex={-1}>어느 맥락으로 질문할까요?</h3>
        <p>{contextChoice.changedAgain ? '화면이 다시 변경됐어요. 새 기준을 확인해 주세요.' : '이전 대화와 현재 화면의 공항·경로 조건이 달라요.'}</p>
        <p>질문: {contextChoice.submittedMessage}</p>
        <p>이전: {contextChoice.previous.label}</p>
        {contextChoice.previous.snapshot && <p>출발 {formatCopilotTime(contextChoice.previous.snapshot.request.etd, contextChoice.timezone)}</p>}
        <p>현재: {contextChoice.current.label}</p>
        {contextChoice.current.snapshot && <p>출발 {formatCopilotTime(contextChoice.current.snapshot.request.etd, contextChoice.timezone)}</p>}
        <p>현재 기준이나 연결 없이 시작하면 이전 대화 내용은 모델에 전달하지 않아요. 화면의 대화·근거 카드는 유지됩니다.</p>
        <div className="copilot-context-options">
          <button type="button" disabled={preparing} onClick={() => void chooseContext('current')}>현재 기준으로 새 대화</button>
          <button type="button" disabled={preparing} onClick={() => void chooseContext('previous')}>이전 기준으로 이어가기</button>
          <button type="button" disabled={preparing} onClick={() => void chooseContext('none')}>연결 없이 새 대화</button>
          <button type="button" disabled={preparing} onClick={() => { setContextChoice(null); requestAnimationFrame(() => input.current?.focus()) }}>취소하고 질문 수정</button>
        </div>
      </section>}
      {contextError && <p role="alert">적용 경로를 연결하지 못했어요. ({contextError}) 경로 입력을 확인하거나 ‘현재 화면 연결’을 해제해 주세요.</p>}
      {chat.error && <div role="alert"><p>{chat.error === 'DAILY_QUESTION_LIMIT'
        ? '오늘 질문 5회를 모두 사용했어요. 한국 시간 자정에 초기화됩니다.'
        : chat.error === 'QUESTION_ALREADY_STARTED' ? '이미 시작한 요청입니다. 중복 API 호출을 막았어요. 필요하면 새 질문으로 보내주세요.'
          : `요청을 완료하지 못했어요. (${chat.error})`}</p>
        {chat.retryable && <button type="button" disabled={chat.busy} onClick={() => void send(true)}>같은 요청 다시 확인</button>}
        <button type="button" disabled={chat.busy || preparing} onClick={() => { setContextChoice(null); setSettingsAction(null); setUiActions({}); chat.reset() }}>새 대화</button></div>}
    </div>
  </>
  if (!chat.status?.enabled) return null
  return <>
    <button ref={launcher} type="button" className="copilot-launcher" aria-label={open ? '기상이 대화 접기' : '기상이에게 질문하기'}
      aria-expanded={open} aria-controls="copilot-window" onClick={() => open ? close() : show()}>
      <img src={AVATAR} alt="" />{chat.busy && <span className="copilot-busy-dot" aria-label="응답 중" />}
    </button>
    {isMobile ? <div className="copilot-mobile-host" hidden={!open} id="copilot-window">
      <MobileSheet open={open} title="기상이" eyebrow="항공 기상 어시스턴트" onClose={close}
        detent={mobileDetent} onDetentChange={setMobileDetent}
        headerExtra={<button type="button" onClick={close} aria-label="기상이 창 접기">접기</button>}
        titleExtra={<img className="copilot-mobile-avatar" src={AVATAR} alt="" />} footer={composer}>{body}</MobileSheet>
    </div> : <section id="copilot-window" hidden={!open} className="copilot-window" role="dialog" aria-label="기상이 대화"
      style={{ left: size.x, top: size.y, width: size.width, height: size.height }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <header className="copilot-header">
        <div className="copilot-drag" role="button" tabIndex={0} aria-label="대화창 이동: 방향키 사용"
          onKeyDown={(event) => { const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
            if (delta) { event.preventDefault(); setPosition({ x: size.x + delta[0], y: size.y + delta[1] }) } }}
          onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX - size.x, y: event.clientY - size.y } }}
          onPointerMove={(event) => { if (drag.current?.id === event.pointerId) setPosition({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y }) }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          <img src={AVATAR} alt="" /><div><strong>기상이</strong><small>항공 기상 어시스턴트</small></div></div>
        <button type="button" title="기본 위치" aria-label="대화창 기본 위치로" onClick={() => setPosition(null)}>↺</button>
        <button type="button" title="크기 변경" aria-label={expanded ? '대화창 기본 크기로' : '대화창 크게 보기'} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>⤢</button>
        <button type="button" aria-label="기상이 창 접기" onClick={close}>−</button>
      </header>
      {body}{composer}
    </section>}
  </>
}
