import { useEffect, useRef, useState } from 'react'
import { formatCopilotTime } from './floatingWindow.js'

function Summary({ route, timezone }) {
  return <><strong>{route.name || '이름 없는 경로'} · #{route.id}</strong>
    <p>{route.departureAirport || '출발 미지정'} → {route.arrivalAirport || '도착 미지정'} · {route.flightRule || '규칙 미지정'}</p>
    <p>저장 {formatCopilotTime(route.savedAt, timezone, { year: true })}</p>
    {route.etd && <p>저장된 출발 {formatCopilotTime(route.etd, timezone, { year: true })}</p>}
  </>
}

export default function SavedRoutesCard({ result, timezone, onSelect, onPrepare, onApply, onImported }) {
  const [state, setState] = useState(null)
  const pending = useRef(false), alive = useRef(true)
  const confirmation = useRef(null), prepareButton = useRef(null), errorMessage = useRef(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (state?.stage === 'confirm') confirmation.current?.focus()
    if (state?.stage === 'error') errorMessage.current?.focus()
  }, [state?.stage])
  const data = result.data ?? {}
  const route = data.savedRoute
  async function execute(confirm = false) {
    if (pending.current) return
    pending.current = true
    const prepared = state?.prepared
    setState({ stage: 'pending' })
    try {
      if (confirm) {
        const applied = await onApply(prepared)
        if (applied?.status !== 'imported') throw new Error('SAVED_ROUTE_NOT_APPLIED')
        if (alive.current) { setState({ stage: 'done' }); onImported?.() }
      } else {
        const next = await onPrepare(data.action.savedRouteRef)
        if (alive.current) setState({ stage: 'confirm', prepared: next })
      }
    } catch (error) {
      if (alive.current) setState({ stage: 'error', error: error.code ?? error.message ?? 'SAVED_ROUTE_UNAVAILABLE' })
    } finally { pending.current = false }
  }
  return <section className="copilot-fact" aria-label={route ? '선택한 저장 경로' : '내 저장 경로 후보'}>
    {Array.isArray(data.routes) && <>
      <strong>내 저장 경로 · {data.total}개 중 {data.routes.length}개</strong>
      {data.routes.map((item) => <section key={item.id}>
        <Summary route={item} timezone={timezone} />
        <button type="button" onClick={() => onSelect(`저장 경로 ID ${item.id}의 저장 입력을 확인해 줘`)}>#{item.id} 선택 질문 작성</button>
      </section>)}
      {data.routes.length === 0 && <p>일치하는 저장 경로가 없습니다.</p>}
      {data.nextOffset != null && <p>뒤에 후보가 더 있습니다. 검색어를 좁히거나 다음 후보를 요청하세요.</p>}
      <p>버튼은 질문만 작성합니다. 전송 후 선택 항목을 확인하세요.</p>
    </>}
    {route && <Summary route={route} timezone={timezone} />}
    {data.mode === 'current_briefing' ? <p>현재 수집 자료로 새로 계산한 브리핑입니다. 저장 당시의 기상 결과가 아닙니다.</p>
      : route && <p>저장 당시 입력입니다. 당시의 기상 결과는 보관되어 있지 않습니다.</p>}
    {data.missingFields?.length > 0 && <p>재브리핑에 필요한 조건: {data.missingFields.join(' · ')}</p>}
    {data.validationError && <p role="alert">저장 경로 재브리핑 실패: {data.validationError}</p>}
    {result.status === 'error' && <p role="alert">저장 경로를 조회하지 못했어요. ({result.error?.code})</p>}
    {data.action?.type === 'saved_route_inputs' && onPrepare && onApply && state?.stage !== 'confirm' &&
      <button ref={prepareButton} type="button" disabled={state?.stage === 'pending'} onClick={() => void execute()}>저장 경로 불러오기 준비</button>}
    {state?.stage === 'pending' && <p role="status">저장 원본과 화면 상태를 확인하고 있어요…</p>}
    {state?.stage === 'confirm' && <section ref={confirmation} tabIndex={-1} className="copilot-settings-confirm" aria-label="저장 경로 불러오기 확인">
      <p>현재 초안과 적용·대체 경로를 ‘{state.prepared.bundle.entry.name}’의 저장 입력으로 바꿀까요?</p>
      <p>경로 {state.prepared.designs.length}개를 불러옵니다. 원본 저장·알람 변경·기상 재조회는 하지 않습니다.</p>
      <p>출발 {formatCopilotTime(state.prepared.conditions.etd, timezone, { year: true })}{state.prepared.saved.etd == null ? ' (현재 값 유지)' : ''}
        {' · '}고도 {state.prepared.conditions.cruiseAltitudeFt} ft{state.prepared.saved.cruiseAltitudeFt == null ? ' (현재 값 유지)' : ''}
        {' · '}TAS {state.prepared.conditions.tasKt} kt{state.prepared.saved.tasKt == null ? ' (현재 값 유지)' : ''}</p>
      <p>도착예정시각은 {state.prepared.saved.eta ? formatCopilotTime(state.prepared.saved.eta, timezone, { year: true }) : '경로 거리·TAS로 다시 계산합니다'}.</p>
      {state.prepared.notices.map((notice, index) => <p key={index}>{notice}</p>)}
      <div className="copilot-context-options"><button type="button" onClick={() => void execute(true)}>확인하고 저장 경로 불러오기</button>
        <button type="button" onClick={() => { setState(null); requestAnimationFrame(() => prepareButton.current?.focus()) }}>불러오기 취소</button></div>
    </section>}
    {state?.stage === 'error' && <p ref={errorMessage} tabIndex={-1} role="alert">화면을 바꾸지 못했어요. ({state.error}) 원본과 화면을 확인한 뒤 다시 준비해 주세요.</p>}
    {state?.stage === 'done' && <p role="status">편집기에 불러왔어요. 기상 브리핑은 별도로 요청해 주세요.</p>}
  </section>
}
