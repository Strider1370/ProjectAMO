import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { hazardChipStyle } from './mapBriefingModel.js'

const WIDTH = 340
const GAP = 10

// 막대·틀 상세 팝오버. 누른 칸 바로 위에 뜬다. 닫기 = ✕ · Esc · 바깥 클릭(다른 막대·틀 누름은 선택 전환이라 제외).
// "지도·고도·시간 맞추기"를 누를 때만 지도·시간·고도가 움직인다.
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
  // 머리 왼쪽 세로 띠 = 막대와 같은 색(모델) / SIGMET 빨강·태풍 보라(발표).
  const stripe = selection.kind === 'model' ? hazardChipStyle(selection.row.key, detail.level).backgroundColor : undefined
  return (
    <div ref={ref} className={`mb-popover is-${selection.kind}${selection.item?.source === 'TYPHOON' ? ' is-typhoon' : ''}`} role="dialog" aria-label={`${detail.title} 상세`}
      style={{ left: position.left, bottom: position.bottom, '--mb-pop-arrow': `${position.arrow}px`, ...(stripe ? { '--mb-pop-stripe': stripe } : null) }}>
      <div className="mb-pop-head">
        <strong>{detail.title}</strong>
        <button type="button" className="mb-icon-btn" aria-label="닫기" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="mb-pop-main">
        {detail.when && <p className="mb-pop-when">{detail.when}</p>}
        <p className="mb-pop-route">{detail.route}</p>
        <p className={`mb-pop-alt${detail.mine ? '' : ' is-other'}`}>{detail.altitude}</p>
        {detail.note && <p className="mb-pop-note">{detail.note}</p>}
        <button type="button" className="mb-pop-go" title="지도를 이 구간으로 옮기고 시간·고도 손잡이를 통과 시각·고도에 맞춥니다" onClick={() => onGoTo(selection)}>지도·고도·시간 맞추기</button>
      </div>
      <div className="mb-pop-foot">
        {detail.source && <p>{detail.source}</p>}
        <p>{detail.basis}</p>
      </div>
    </div>
  )
}
