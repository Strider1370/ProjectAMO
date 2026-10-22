import './MetarHistory.css'

// METAR·TAF 이력 줄(공항 패널): 왼쪽(과거) → 오른쪽(최신) 작은 한 줄 칸. 칸 = (비행등급 색 점) · 글 · (SPECI면 S / AMD) · 최신.
// 칸을 누르면 탭 아래가 그 보고로 바뀌고, 최신이 아니면 칸 오른쪽에 note.
export default function ReportHistoryStrip({ history, label, cellText, cellTitle, note }) {
  if (history.entries.length < 2) return null // 보관된 이전 보고가 없으면 줄을 띄우지 않는다
  return (
    <div className="ap-metar-history" role="listbox" aria-label={label}>
      {history.entries.map((entry) => {
        const selected = entry.key === history.selected?.key
        return (
          <button key={entry.key} type="button" role="option" aria-selected={selected} title={cellTitle(entry)}
            className={`ap-mh-cell is-${(entry.category ?? 'none').toLowerCase()}${selected ? ' is-selected' : ''}${entry.latest ? ' is-latest' : ''}`}
            onClick={() => history.select(entry.key)}>
            {entry.category && <i className="ap-mh-dot" aria-hidden="true" />}
            {cellText(entry)}
            {entry.kind === 'SPECI' && <b>S</b>}
            {entry.kind === 'AMD' && <b>AMD</b>}
            {entry.latest && <em>최신</em>}
          </button>
        )
      })}
      {note && <span className="ap-mh-note">{note}</span>}
    </div>
  )
}
