import { uiActionLabel } from './uiActions.js'

export default function UiActionCard({ result, state, onApply }) {
  const action = result.data?.action
  let label
  try { if (action) label = uiActionLabel(action) } catch { /* no executable button for invalid data */ }
  return <section className="copilot-fact" aria-label="화면 연결">
    <strong>화면 연결</strong>
    {label ? <>
      <p>버튼을 누르면 해당 화면을 열어요. 비행 경로나 저장 자료는 바꾸지 않습니다.</p>
      {action.type === 'enable_weather_layer' && <p>기존 레이어 선택 규칙에 따라 함께 켤 수 없는 레이어는 꺼질 수 있어요. 자료의 존재·최신성은 별도로 확인해 주세요.</p>}
      <button type="button" disabled={!onApply || state?.stage === 'pending'} onClick={() => onApply(action)}>{label}</button>
    </> : <p>화면 연결 대상을 확인해 주세요. 화면은 변경하지 않았어요.</p>}
    {(result.issues ?? []).map((issue, index) => <p key={index}>{issue.code}
      {issue.candidates?.length > 0 && ` — ${issue.candidates.map((candidate) => `${candidate.nameKo} (${candidate.icao})`).join(', ')}`}</p>)}
    {state?.stage === 'pending' && <p role="status">화면 적용 상태를 확인하고 있어요…</p>}
    {state?.stage === 'done' && <p role="status">실행 결과: {state.receipt.message}</p>}
    {state?.stage === 'error' && <p role="alert">화면 적용을 확인하지 못했어요. ({state.error}) 현재 화면을 확인한 뒤 다시 시도해 주세요.</p>}
  </section>
}
