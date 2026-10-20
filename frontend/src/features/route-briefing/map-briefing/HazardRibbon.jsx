import { useRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { frameAdvisoryId, frameShortTag, frameTag, hazardChipStyle, hazardSwatchStyle, modelChip, pctOf, pickRibbonTarget, rowEmptyText, segmentTitle, sourceChips } from './mapBriefingModel.js'

// 위험 막대: 현상별 줄(높이 22 고정). 수치예보(내 비행 고도·MOD 이상)는 글자 없이 연직단면도 범례와 같은 색으로 줄을 칠하고,
// 예보관 발표 틀(이름표는 틀 안쪽 왼쪽)을 그 위에 덮어 그린다 — 겹친 곳은 배경색으로 모델 위험이 있음을 보인다. 가로축은 항상 경로 전체이고, trackInset이 있으면 아래 연직단면도 그림과
// 같은 세로선에 맞춘다. 단면도가 확대돼 있으면 보이는 구간을 테두리 창으로 겹쳐 그린다.
// 막대·틀을 가리키면 onHover(지도 경로 미리보기), 누르면 onSelect(누른 칸의 화면 위치 포함 — 팝오버 자리).
// 틀이 모델 막대를 덮으므로 마우스는 줄(트랙)이 위치로 대상을 고른다(pickRibbonTarget). 막대·틀 버튼은 키보드용.
// highlightAdvisoryId: 단면도에서 가리킨 SIGMET과 같은 발표의 틀을 강조한다.
export default function HazardRibbon({ ribbon, profileRange = null, selectedId = null, onSelect, onHover, highlightAdvisoryId = null, hiddenRows = [], onToggleRow, trackInset = null }) {
  const hoverIdRef = useRef(null)
  const total = ribbon?.totalDistanceNm || 0
  if (!ribbon || !(total > 0)) return <p className="mb-ribbon-empty">경로상 위험 자료가 없습니다.</p>
  // 걸리는 것이 없는 줄은 서버가 뺀다. 모두 빠지면 한 줄로 알린다.
  if (!ribbon.rows.length) return <p className="mb-ribbon-empty">내 비행 고도에 MOD 이상 수치예보·경로에 걸린 SIGMET 없음</p>
  const [rangeStart, rangeEnd] = profileRange ?? [0, total]
  const zoomed = profileRange && (rangeStart > 0.5 || rangeEnd < total - 0.5)
  const hover = (target) => {
    if ((target?.id ?? null) === hoverIdRef.current) return
    hoverIdRef.current = target?.id ?? null
    onHover?.(target)
  }
  // 키보드(Tab·Enter): 버튼이 직접. 마우스는 아래 trackPointer가 고른다.
  const keyboardProps = (target) => ({
    onFocus: () => hover(target), onBlur: () => hover(null),
    onClick: (event) => { if (event.detail === 0) onSelect?.({ ...target, anchor: event.currentTarget.getBoundingClientRect() }) },
  })
  const targetAt = (row, event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!(rect.width > 0)) return null
    const nm = ((event.clientX - rect.left) / rect.width) * total
    const y = event.clientY - rect.top
    const tags = [...event.currentTarget.querySelectorAll('.mb-frame-tag')]
    const tag = tags.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom })
    const picked = pickRibbonTarget(row, nm, { edge: y < 4 || y > rect.height - 4, tagFrameIndex: tag ? Number(tag.dataset.frameIndex) : -1 })
    if (!picked) return null
    const id = `${row.key}:${picked.kind}:${picked.index}`
    return { id, row, kind: picked.kind, item: picked.kind === 'model' ? row.model[picked.index] : row.frames[picked.index] }
  }
  const trackPointer = (row) => ({
    onMouseMove: (event) => {
      const target = targetAt(row, event)
      // 버튼이 마우스를 받지 않으므로 툴팁(강도·고도·구간)은 줄에 옮겨 단다.
      event.currentTarget.title = target ? (event.currentTarget.querySelector(`[data-ribbon-id="${target.id}"]`)?.getAttribute('aria-label') ?? '') : ''
      hover(target)
    },
    onMouseLeave: () => hover(null),
    onClick: (event) => {
      if (event.detail === 0) return
      const target = targetAt(row, event)
      const anchor = target && event.currentTarget.querySelector(`[data-ribbon-id="${target.id}"]`)?.getBoundingClientRect()
      if (target) onSelect?.({ ...target, anchor })
    },
  })
  const insetStyle = trackInset ? { '--mb-label-w': `${trackInset.left}px`, '--mb-track-right': `${Math.max(0, trackInset.right)}px` } : undefined

  return (
    <div className="mb-ribbon" role="group" aria-label="경로상 위험 막대" style={insetStyle}>
      {ribbon.rows.map((row) => {
        const hidden = hiddenRows.includes(row.key)
        const chip = modelChip(row)
        const empty = rowEmptyText(row)
        return (
          <div key={row.key} className={`mb-row is-${row.key}${hidden ? ' is-hidden' : ''}`}>
            <div className="mb-row-label">
              <button type="button" className="mb-eye" aria-pressed={!hidden} aria-label={`${row.label} ${hidden ? '보이기' : '숨기기'}`} onClick={() => onToggleRow?.(row.key)}>
                {hidden ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
              </button>
              <i className="mb-row-dot" aria-hidden="true" />
              <span className="mb-row-name">{row.label}</span>
              <span className="mb-row-chips">
                {chip && <span className={`mb-chip is-${chip.tone}`} title={chip.title} style={hazardChipStyle(row.key, chip.text)}>{chip.text}</span>}
                {sourceChips(row).map((source) => (
                  <span key={source.text} className={`mb-src-chip is-${source.text.toLowerCase()}${source.mine ? ' is-mine' : ''}`} title={source.mine ? '내 고도와 겹치는 발표' : '다른 고도 발표'}>{source.text}</span>
                ))}
              </span>
            </div>
            <div className={`mb-track${row.status === 'unavailable' && !row.model.length ? ' is-unavailable' : ''}`} {...(hidden ? {} : trackPointer(row))}>
              {!hidden && empty && <span className="mb-track-empty">{empty}</span>}
              {/* 자료가 없는 구간: 단면도의 "자료 없음"과 같은 빗금. 비어 있으면 "없음"으로 읽히므로 따로 그린다. */}
              {!hidden && (row.missing ?? []).map((gap) => {
                const left = pctOf(gap.startNm, total)
                const width = Math.max(0.4, pctOf(gap.endNm, total) - left)
                return <span key={`gap-${gap.startNm}`} className="mb-gap" style={{ left: `${left}%`, width: `${width}%` }} title={`모델 자료 없음 · ${gap.startNm}–${gap.endNm}NM`} />
              })}
              {!hidden && row.model.map((segment, index) => {
                const left = pctOf(segment.startNm, total)
                const width = Math.max(0.6, pctOf(segment.endNm, total) - left)
                const id = `${row.key}:model:${index}`
                const title = segmentTitle(row.label, segment)
                return (
                  <button key={id} type="button" className={`mb-seg is-${segment.level.toLowerCase()}${selectedId === id ? ' is-selected' : ''}`}
                    style={{ ...hazardSwatchStyle(row.key, segment.level), left: `${left}%`, width: `${width}%` }} aria-label={title} title={title}
                    data-ribbon-id={id} aria-pressed={selectedId === id} {...keyboardProps({ id, row, kind: 'model', item: segment })} />
                )
              })}
              {!hidden && row.frames.map((frame, index) => {
                const left = pctOf(frame.startNm, total)
                const width = Math.max(0.6, pctOf(frame.endNm, total) - left)
                const id = `${row.key}:frame:${index}`
                const tag = frameTag(frame)
                const advisoryId = frameAdvisoryId(frame)
                const linked = advisoryId && highlightAdvisoryId === advisoryId
                return (
                  <button key={id} type="button" className={`mb-frame is-${String(frame.source).toLowerCase()}${frame.mine ? ' is-mine' : ''}${selectedId === id ? ' is-selected' : ''}${linked ? ' is-linked' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%` }} aria-label={`${tag} · ${frame.startNm}–${frame.endNm}NM`} title={tag}
                    data-advisory-id={advisoryId ?? undefined} data-ribbon-id={id} aria-pressed={selectedId === id} {...keyboardProps({ id, row, kind: 'frame', item: frame })}>
                    <span className="mb-frame-tag" data-frame-index={index}><span className="is-full">{tag}</span><span className="is-short">{frameShortTag(frame)}</span></span>
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
