import { Activity, CloudLightning, FileWarning, Snowflake, Tornado, TriangleAlert, Wind } from 'lucide-react'
import { routeBriefSections } from './routeBrief.js'

// Fixed-format pre-flight brief built by the server; stretch rows open the same
// stored result with that stretch pinned on the map and the vertical profile.
const stretchKey = (h) => `${h.startNm}-${h.endNm}`
const KIND_ICON = { icing: Snowflake, turbulence: Activity, advisory: CloudLightning, notam: FileWarning, warning: TriangleAlert }

function ShowButton({ item, onShowStretch, opening, shownKey }) {
  if (!item.highlight || !onShowStretch) return null
  return shownKey === stretchKey(item.highlight)
    ? <span className="copilot-brief-shown" role="status">표시 중</span>
    : <button type="button" className="copilot-brief-show" disabled={opening}
      aria-label={`${item.label ?? ''} ${item.where ?? ''} 지도·단면에서 보기`.trim()}
      onClick={() => onShowStretch(item.highlight, stretchKey(item.highlight))}>보기</button>
}

// One hazard per row: kind and severity first, then where, then position/length.
function HazardRow({ item, ...show }) {
  const Icon = item.source === 'TYPHOON' ? Tornado : KIND_ICON[item.kind] ?? TriangleAlert
  const hazard = item.kind === 'icing' || item.kind === 'turbulence'
  const meta = [item.position, item.amount, item.note].filter(Boolean).join(' · ')
  return <li className={`copilot-brief-row copilot-brief-${item.level}`}>
    <span className="copilot-brief-kind"><Icon size={14} aria-hidden="true" />{item.label ?? '경보'}</span>
    <span className="copilot-brief-body">
      <span className="copilot-brief-line">{hazard && <b className="copilot-brief-severity">{item.severity}</b>}
        {item.kind === 'notam' ? item.text : `${item.where}${item.procedure ? ` · ${item.procedure}` : ''}`}</span>
      {meta && <span className="copilot-brief-meta">{meta}</span>}
    </span>
    <ShowButton item={item} {...show} />
  </li>
}

function AirportLine({ part }) {
  return <div className="copilot-brief-section">
    <h4>{part.title}</h4>
    {part.items.length ? <ul>{part.items.map((item, i) => <li key={i} className={`copilot-brief-row copilot-brief-${item.level}`}>
      <span className="copilot-brief-kind"><TriangleAlert size={14} aria-hidden="true" />{item.kind === 'warning' ? '경보' : '예보'}</span>
      <span className="copilot-brief-body"><span className="copilot-brief-line">{item.text}</span></span></li>)}</ul>
      : <p className="copilot-brief-status">{part.status}</p>}
  </div>
}

function Details({ details }) {
  if (!details || (!details.routeText && !details.procedures?.length)) return null
  return <details className="copilot-brief-details">
    <summary>경로 상세</summary>
    <dl>
      {details.procedures.map((p, i) => <div key={i}><dt>{p.label}</dt><dd>{p.name}</dd></div>)}
      {details.routeText && <div><dt>경로</dt><dd>{details.routeText}</dd></div>}
      {details.publicationId && <div><dt>항공로 자료</dt><dd>{details.publicationId}</dd></div>}
    </dl>
    {details.basis && <p>{details.basis}</p>}
  </details>
}

// Briefs stored before the phase layout carry only flat rows.
function LegacyBrief({ brief, ...show }) {
  return <>{routeBriefSections(brief).map(({ section, quiet, items }) => <div className="copilot-brief-section" key={section}>
    <h4>{section}</h4>
    {quiet && !items.length && <p className="copilot-brief-status">{quiet}</p>}
    <ul>{items.map((item, i) => <li key={i} className={`copilot-brief-row copilot-brief-${item.level}`}>
      <span className="copilot-brief-kind">{item.level}</span>
      <span className="copilot-brief-body"><span className="copilot-brief-line">{item.text}</span></span>
      <ShowButton item={item} {...show} /></li>)}</ul>
  </div>)}</>
}

export default function RouteBriefCard({ result, onShowStretch, opening, error, shownKey = null, collapsed = false }) {
  const brief = result?.data?.brief
  if (!brief || (!brief.body && !routeBriefSections(brief).length)) return null
  const show = { onShowStretch, opening, shownKey }
  const content = <>
    {brief.header ? <div className="copilot-brief-header">
      <p className="copilot-brief-title">{brief.header.title}</p>
      <dl>
        {brief.header.distance && <div><dt>경로 길이</dt><dd>{brief.header.distance}</dd></div>}
        <div><dt>출발/도착</dt><dd>{brief.header.times}{brief.header.etaNote && <span className="copilot-brief-note"> · {brief.header.etaNote}</span>}</dd></div>
      </dl>
      <Details details={brief.details} />
    </div> : <p className="copilot-brief-title">{brief.flight}</p>}
    {brief.body ? <>
      <AirportLine part={brief.body.departure} />
      <div className="copilot-brief-section">
        <h4>항로</h4>
        {brief.body.enroute.quiet && <p className="copilot-brief-status">{brief.body.enroute.quiet}</p>}
        {brief.body.enroute.advisories.length > 0 && <ul>{brief.body.enroute.advisories.map((item, i) => <HazardRow key={i} item={item} {...show} />)}</ul>}
        {brief.body.enroute.phases.map((group) => <div className="copilot-brief-phase" key={group.label}>
          <h5>{group.label}</h5>
          <ul>
            {group.items.map((item, i) => <HazardRow key={i} item={item} {...show} />)}
            {group.wind && <li className="copilot-brief-row copilot-brief-바람">
              <span className="copilot-brief-kind"><Wind size={14} aria-hidden="true" />바람</span>
              <span className="copilot-brief-body"><span className="copilot-brief-line">{group.wind}</span></span></li>}
          </ul>
        </div>)}
      </div>
      <AirportLine part={brief.body.arrival} />
    </> : <LegacyBrief brief={brief} {...show} />}
    {error && <p role="alert">지도에 구간을 표시하지 못했어요. ({error}) 최신 자료로 자동 대체하지 않았습니다.</p>}
    {brief.gaps?.length > 0 && <p className="copilot-brief-gaps">자료 범위: {brief.gaps.join(' · ')}</p>}
  </>
  // A later answer about the same route keeps the brief one click away instead of repeating it.
  return collapsed
    ? <details className="copilot-brief copilot-brief-again"><summary>이 경로 브리핑 다시 보기</summary>{content}</details>
    : <section className="copilot-brief" aria-label="비행 전 브리핑">{content}</section>
}
