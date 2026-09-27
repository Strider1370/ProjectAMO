import { routeBriefSections } from './routeBrief.js'

// Fixed-format pre-flight brief built by the server; stretch rows open the same
// stored result with that stretch pinned on the map and the vertical profile.
const stretchKey = (h) => `${h.startNm}-${h.endNm}`

export default function RouteBriefCard({ result, onShowStretch, opening, error, shownKey = null }) {
  const brief = result?.data?.brief
  const sections = routeBriefSections(brief)
  if (!sections.length) return null
  return <section className="copilot-brief" aria-label="비행 전 브리핑">
    <p className="copilot-brief-flight">{brief.flight}</p>
    {sections.map(({ section, quiet, items }) => <div className="copilot-brief-section" key={section}>
      <h4>{section}</h4>
      {quiet && !items.length && <p className="copilot-brief-quiet">{quiet}</p>}
      <ul>{items.map((item, i) => <li key={i} className={`copilot-brief-item copilot-brief-${item.level}`}>
        <span className="copilot-brief-level">{item.level}</span>
        <span className="copilot-brief-text">{item.text}</span>
        {item.highlight && onShowStretch && (shownKey === stretchKey(item.highlight)
          ? <span className="copilot-brief-shown" role="status">지도·단면에 표시 중</span>
          : <button type="button" disabled={opening} onClick={() => onShowStretch(item.highlight, stretchKey(item.highlight))}>지도·단면에서 보기</button>)}
      </li>)}</ul>
      {quiet && items.length > 0 && section !== '항로' && <p className="copilot-brief-quiet">{quiet}</p>}
    </div>)}
    {error && <p role="alert">지도에 구간을 표시하지 못했어요. ({error}) 최신 자료로 자동 대체하지 않았습니다.</p>}
    {brief.gaps?.length > 0 && <p className="copilot-brief-gaps">자료 범위: {brief.gaps.join(' · ')}</p>}
  </section>
}
