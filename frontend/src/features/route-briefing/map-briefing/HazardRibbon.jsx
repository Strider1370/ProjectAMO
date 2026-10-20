import { Eye, EyeOff } from 'lucide-react'
import { frameTag, modelChip, pctOf, rowEmptyText, rowHeightPx, segmentText, sourceChips } from './mapBriefingModel.js'

// 위험 막대: 현상별 줄. 꽉 찬 막대 = 수치예보(내 비행 고도·MOD 이상), 테두리 틀 = 예보관 발표.
// 가로축은 항상 경로 전체. 연직단면도가 확대돼 있으면 보이는 구간을 테두리 창으로 겹쳐 그린다.
export default function HazardRibbon({ ribbon, profileRange = null, selectedId = null, onSelect, hiddenRows = [], onToggleRow }) {
  const total = ribbon?.totalDistanceNm || 0
  if (!ribbon || !(total > 0)) return <p className="mb-ribbon-empty">경로상 위험 자료가 없습니다.</p>
  const [rangeStart, rangeEnd] = profileRange ?? [0, total]
  const zoomed = profileRange && (rangeStart > 0.5 || rangeEnd < total - 0.5)

  return (
    <div className="mb-ribbon" role="group" aria-label="경로상 위험 막대">
      {ribbon.rows.map((row) => {
        const hidden = hiddenRows.includes(row.key)
        const chip = modelChip(row)
        const empty = rowEmptyText(row)
        return (
          <div key={row.key} className={`mb-row is-${row.key}${hidden ? ' is-hidden' : ''}`} style={{ '--mb-row-h': `${rowHeightPx(row)}px` }}>
            <div className="mb-row-label">
              <button type="button" className="mb-eye" aria-pressed={!hidden} aria-label={`${row.label} ${hidden ? '보이기' : '숨기기'}`} onClick={() => onToggleRow?.(row.key)}>
                {hidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              </button>
              <i className="mb-row-dot" aria-hidden="true" />
              <span className="mb-row-name">{row.label}</span>
              <span className="mb-row-chips">
                {chip && <span className={`mb-chip is-${chip.tone}`} title={chip.title}>{chip.text}</span>}
                {sourceChips(row).map((source) => (
                  <span key={source.text} className={`mb-src-chip is-${source.text.toLowerCase()}${source.mine ? ' is-mine' : ''}`} title={source.mine ? '내 고도와 겹치는 발표' : '다른 고도 발표'}>{source.text}</span>
                ))}
              </span>
            </div>
            <div className={`mb-track${row.status === 'unavailable' && !row.model.length ? ' is-unavailable' : ''}`}>
              {!hidden && empty && <span className="mb-track-empty">{empty}</span>}
              {!hidden && row.frames.map((frame, index) => {
                const left = pctOf(frame.startNm, total)
                const width = Math.max(0.6, pctOf(frame.endNm, total) - left)
                const id = `${row.key}:frame:${index}`
                return (
                  <button key={id} type="button" className={`mb-frame is-${String(frame.source).toLowerCase()}${frame.mine ? ' is-mine' : ''}${selectedId === id ? ' is-selected' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%` }} aria-label={`${frameTag(frame)} · ${frame.startNm}–${frame.endNm}NM`}
                    onClick={() => onSelect?.({ id, row, kind: 'frame', item: frame })}>
                    <span className="mb-frame-tag">{frameTag(frame)}</span>
                  </button>
                )
              })}
              {!hidden && row.model.map((segment, index) => {
                const left = pctOf(segment.startNm, total)
                const width = Math.max(0.6, pctOf(segment.endNm, total) - left)
                const id = `${row.key}:model:${index}`
                const nearEnd = left + width > 92
                return (
                  <button key={id} type="button" className={`mb-seg is-${segment.level.toLowerCase()}${row.frames.length ? ' is-under-tag' : ''}${nearEnd ? ' is-end' : ''}${selectedId === id ? ' is-selected' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%` }} aria-label={`${row.label} ${segment.level} ${segment.from ?? ''}→${segment.to ?? ''} ${segment.startNm}–${segment.endNm}NM`}
                    onClick={() => onSelect?.({ id, row, kind: 'model', item: segment })}>
                    {segmentText(segment, width)}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {zoomed && (
        <div className="mb-range-window" aria-hidden="true" style={{ '--mb-range-from': pctOf(rangeStart, total) / 100, '--mb-range-span': (pctOf(rangeEnd, total) - pctOf(rangeStart, total)) / 100 }}>
          <span>{`단면에 보이는 구간 ${Math.round(rangeStart)}–${Math.round(rangeEnd)}NM`}</span>
        </div>
      )}
    </div>
  )
}
