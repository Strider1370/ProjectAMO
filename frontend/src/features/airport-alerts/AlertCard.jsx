import AlertIcon from './AlertIcon.jsx'
import { alertView, metricThresholdText, metricValueText } from './alertModel.js'
import { relTime } from '../notifications/notificationFormat.js'

const zone = (tz) => (tz === 'UTC' ? 'UTC' : 'Asia/Seoul')
export const clock = (iso, tz) => (iso && Number.isFinite(Date.parse(iso))
  ? new Intl.DateTimeFormat('ko-KR', { timeZone: zone(tz), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '시각 미상')
const dayClock = (iso, tz) => (iso && Number.isFinite(Date.parse(iso))
  ? new Intl.DateTimeFormat('ko-KR', { timeZone: zone(tz), day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '시각 미상')

const METRIC_ICON = { visibility: 'vis', ceiling: 'ceiling', wind: 'wind', gust: 'wind', temperature: 'temp', windshear: 'wind', fzra: 'ice' }
const OPEN_LABEL = { metar: 'METAR 보기', taf: 'TAF 보기', sigmet: '브리핑에서 보기', warning: '공항경보 보기', lightning: '낙뢰 보기' }

// 알림 한 건. 맨 위 작은 줄 = 종류·시각, 다음 = 대상(공항·경로), 그다음 = 아이콘과 큰 제목(무엇이 일어났나), 값.
// 빨간색은 기준을 넘은 값에만 쓴다.
export default function AlertCard({ item, tz, onOpen, compact = false }) {
  const v = alertView(item)
  const unread = !item.readAt && !item.test
  const tzLabel = tz === 'UTC' ? 'UTC' : 'KST'
  const when = item.test ? '테스트 · 모의 자료' : relTime(item.detectedAt)
  return <article className={`aa-card${compact ? ' is-compact' : ''}`} aria-label={`${v.target} ${v.title}`}>
    <div className="aa-card-top">
      <span className="aa-kind">{v.badge}</span>
      {unread && <span className="aa-unread" aria-label="읽지 않음" />}
      <span className="aa-when">{when}</span>
    </div>
    <div className="aa-card-target">{v.target}{v.kind === 'metar' && v.observedAt ? ` · ${clock(v.observedAt, tz)} ${tzLabel} 관측` : ''}</div>
    <div className="aa-card-head">
      <AlertIcon kind={v.kind === 'metar' ? 'metar' : v.kind} code={v.code} size={compact ? 22 : 26} framed />
      <div className="aa-card-title">
        <strong>{v.title}{v.abbr && <span className="aa-abbr">{v.abbr}</span>}</strong>
        {v.kind === 'sigmet' && <span>SIGMET</span>}
        {v.kind === 'taf' && <span>{dayClock(v.issuedAt, tz)} {tzLabel} 발표 · 유효 {dayClock(v.validFrom, tz)}–{dayClock(v.validTo, tz)}</span>}
        {v.kind === 'lightning' && <span>최근 {v.windowMinutes}분</span>}
        {v.kind === 'warning' && v.validTo && <span>유효 ~{dayClock(v.validTo, tz)} {tzLabel}</span>}
      </div>
    </div>
    {v.kind === 'metar' && <div className="aa-cells">{v.metrics.map((m) => <div key={m.key} className="aa-cell">
      <span className="aa-cell-label"><AlertIcon kind={METRIC_ICON[m.key] ?? 'metar'} size={13} />{m.label}</span>
      <b className={m.direction === 'event' ? undefined : 'is-hit'}>{metricValueText(m)}</b>
      {m.direction !== 'event' && <small>{metricThresholdText(m)}</small>}
    </div>)}</div>}
    {v.kind === 'sigmet' && <div className="aa-cells is-three">
      <div className="aa-cell"><span className="aa-cell-label">고도{v.mine && <b> · 내 고도 포함</b>}</span><b>{v.band}</b></div>
      <div className="aa-cell"><span className="aa-cell-label">겹치는 구간</span><b>{v.segment ?? '확인 중'}</b></div>
      <div className="aa-cell"><span className="aa-cell-label">유효 ({tzLabel})</span><b>{clock(v.validFrom, tz)}–{clock(v.validTo, tz)}</b></div>
    </div>}
    {v.kind === 'taf' && <pre className="aa-report">{v.text}</pre>}
    {onOpen && <div className="aa-card-foot">
      <span>{item.active === false ? '종료됨' : v.kind === 'metar' ? '기준에서 벗어나면 지난 알림으로 옮겨집니다' : ''}</span>
      <button type="button" className="aa-open" onClick={() => onOpen(item)}>{item.test ? '시험 내용 보기' : OPEN_LABEL[v.kind] ?? '보기'}</button>
    </div>}
  </article>
}
