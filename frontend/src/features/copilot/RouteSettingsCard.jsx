import { formatCopilotTime } from './floatingWindow.js'

export const SETTING_LABELS = { departureAirport: '출발 공항', arrivalAirport: '도착 공항', flightRule: '비행 규칙',
  cruiseAltitudeFt: '순항고도', etd: '출발시각', eta: '도착예정시각' }
function Fields({ fields, timezone }) {
  return <dl className="copilot-settings-fields">{Object.entries(SETTING_LABELS).filter(([key]) => fields?.[key] !== undefined).map(([key, label]) =>
    <div key={key}><dt>{label}</dt><dd>{['etd', 'eta'].includes(key) ? formatCopilotTime(fields[key], timezone, { year: true })
      : key === 'cruiseAltitudeFt' ? `${fields[key].toLocaleString()} ft` : fields[key]}</dd></div>)}</dl>
}

export default function RouteSettingsCard({ result, timezone, state, onPrepare, onConfirm, onCancel }) {
  const action = result.data?.action
  return <section className="copilot-fact" aria-label="경로 설정 입력안">
    <strong>경로 설정 입력안</strong>
    {action && <Fields fields={action.fields} timezone={timezone} />}
    {result.data?.missingFields?.length > 0 && <p>미지정: {result.data.missingFields.map((key) => SETTING_LABELS[key] ?? key).join(' · ')}</p>}
    {action ? <><p>입력만 채웁니다. 경로 생성·적용·브리핑은 설정 화면에서 진행해 주세요.</p>
      <p>미지정 규칙·고도·출발시각은 현재 설정을 유지하고, 도착예정시각은 기존 경로 계산 흐름을 따릅니다.</p></>
      : <p>입력안을 만들지 못했어요. 조건을 임의로 빼거나 변경하지 않았습니다.</p>}
    {(result.issues ?? []).map((issue, index) => <p key={index}>{issue.field ? `${SETTING_LABELS[issue.field]}: ` : ''}{issue.code}
      {issue.candidates?.length > 0 && ` — ${issue.candidates.map((candidate) => `${candidate.nameKo} (${candidate.icao})`).join(', ')}`}
      {issue.conditions?.length > 0 && ` — ${issue.conditions.join(', ')}`}</p>)}
    {action && onPrepare && <button type="button" disabled={state?.stage === 'pending'} onClick={onPrepare}>경로 설정에 입력 채우기</button>}
    {state?.stage === 'confirm' && <section className="copilot-settings-confirm" aria-label="경로 설정 덮어쓰기 확인">
      <p>기존 초안과 적용·대체 경로를 지우고 아래 입력으로 바꿀까요? 절차·경유점·대체공항·예보 선택도 초기화합니다.</p>
      <Fields fields={state.preview.next} timezone={timezone} />
      {state.preview.retained.length > 0 && <p>현재 값 유지: {state.preview.retained.map((key) => SETTING_LABELS[key]).join(' · ')}</p>}
      <div className="copilot-context-options"><button type="button" onClick={onConfirm}>확인하고 입력 채우기</button>
        <button type="button" onClick={onCancel}>입력 변경 취소</button></div>
    </section>}
    {state?.stage === 'done' && <p role="status">설정 입력을 채웠어요. 경로 생성·적용은 아직 하지 않았습니다.</p>}
    {state?.stage === 'error' && <p role="alert">입력을 변경하지 못했어요. ({state.error}) 설정을 확인하고 입력 채우기를 다시 눌러 주세요.</p>}
  </section>
}
