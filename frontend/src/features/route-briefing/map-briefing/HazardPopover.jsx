import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { hazardChipStyle } from './mapBriefingModel.js'

const WIDTH = 360
const GAP = 10

// 막대·틀 상세 팝오버. 누른 칸 바로 위에 뜬다. 닫기 = ✕ · Esc · 바깥 클릭(다른 막대·틀 누름은 선택 전환이라 제외).
// "지도·슬라이더를 이 구간으로"를 누를 때만 지도·시간·고도가 움직인다.
export default function HazardPopover({ selection, detail, onClose, onGoTo }) {
  const ref = useRef(null)
  const [position, setPosition] = useState(null)

  useLayoutEffect(() => {
    const anchor = document.querySelector(`[data-ribbon-id="${CSS.escape(selection.id)}"]`)
    const rect = anchor?.getBoundingClientRect() ?? selection.anchor
    if (!rect) { setPosition(null); return }
    const center = rect.left + rect.width / 2
    const left = Math.min(window.innerWidth - WIDTH - 8, Math.max(8, center - WIDTH / 2))
    setPosition({ left, bottom: window.innerHeight - rect.top + GAP, arrow: center - left })
  }, [selection])

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    const onPointer = (event) => {
      if (ref.current?.contains(event.target) || event.target.closest?.('.mb-seg, .mb-frame')) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer) }
  }, [onClose])

  if (!detail || !position) return null
  const chipStyle = selection.kind === 'model' ? hazardChipStyle(selection.row.key, detail.level) : undefined
  return (
    <div ref={ref} className="mb-popover" role="dialog" aria-label={`${detail.title} 상세`}
      style={{ left: position.left, bottom: position.bottom, '--mb-pop-arrow': `${position.arrow}px` }}>
      <div className="mb-pop-head">
        <span className={`mb-pop-level is-${String(detail.level).toLowerCase()}`} style={chipStyle}>{detail.level}</span>
        <strong>{detail.title}</strong>
        <span className="mb-pop-src">{detail.source}</span>
        <button type="button" className="mb-icon-btn" aria-label="닫기" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <span className={`mb-pop-enc${detail.mine ? ' is-mine' : ''}`}>{detail.mine ? '● 내 비행 고도에서 만남' : '○ 다른 고도'}</span>
      <dl className="mb-pop-list">
        <dt>구간</dt><dd>{detail.route && <b>{detail.route} </b>}<span className="mb-pop-dim">{detail.rangeNm}</span></dd>
        {detail.pass && <><dt>통과</dt><dd>{detail.pass} <span className="mb-pop-dim">바람 미반영</span></dd></>}
        <dt>고도</dt><dd>{detail.altitude}</dd>
        {detail.data && <><dt>자료</dt><dd className="mb-pop-dim">{detail.data}</dd></>}
      </dl>
      {detail.note && <p className="mb-pop-note">{detail.note}</p>}
      <button type="button" className="mb-pop-go" onClick={() => onGoTo(selection)}>지도·슬라이더를 이 구간으로</button>
    </div>
  )
}
