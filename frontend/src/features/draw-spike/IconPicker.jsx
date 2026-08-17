import { useEffect, useRef, useState } from 'react'
import { ICON_GROUPS, filterIcons, iconById } from './lib/iconCatalog.js'

/**
 * 아이콘 고르개 — Google My Maps·onX 방식.
 *
 * 이름칸 옆의 단추를 누르면 격자가 펼쳐진다(구글어스 Pro와 같은 자리). 격자에
 * 찾기칸을 더한 것은 Felt에서 가져왔다 — 87종을 눈으로 훑는 것보다 `공항`을
 * 치는 편이 빠르다.
 */
export default function IconPicker({ value, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const boxRef = useRef(null)
  const opener = useRef(null)

  useEffect(() => {
    // 열기 전에 어디에 있었는지 기억했다가 닫을 때 돌려준다.
    opener.current = document.activeElement
    return () => opener.current?.focus?.()
  }, [])

  // Esc로 닫고, Tab이 고르개 밖으로 새지 않게 가둔다. 페이지의 Esc 처리는
  // 도구만 끄므로 여기서 먼저 잡아 멈춰야 한다.
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab') return
    const focusable = boxRef.current?.querySelectorAll('button, input')
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const found = filterIcons(query)
  const groups = ICON_GROUPS.filter((g) => found.some((i) => i.group === g))

  return (
    <div className="ds-picker" ref={boxRef} role="dialog" aria-modal="true"
      aria-label="아이콘 고르기" onKeyDown={onKeyDown}>
      <div className="ds-pickerHead">
        <input className="ds-input" autoFocus placeholder="찾기 (예: 공항, 별, A)"
          aria-label="아이콘 찾기"
          value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="ds-mini" onClick={onClose} aria-label="아이콘 고르기 닫기">×</button>
      </div>
      <div className="ds-pickerBody">
        {groups.map((g) => (
          <div key={g}>
            <div className="ds-pickerGroup">{g}</div>
            <div className="ds-grid">
              {found.filter((i) => i.group === g).map((i) => (
                <button key={i.id} type="button" title={i.label} aria-label={i.label}
                  aria-pressed={i.id === value}
                  className={i.id === value ? 'ds-cell ds-cellOn' : 'ds-cell'}
                  onClick={() => { onPick(i.id); onClose() }}>
                  <img src={i.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        ))}
        {found.length === 0 && <p className="ds-note">찾는 아이콘이 없습니다.</p>}
      </div>
    </div>
  )
}

export function IconButton({ value, onClick }) {
  const icon = iconById(value)
  return (
    <button type="button" className="ds-iconBtn" onClick={onClick}
      aria-haspopup="dialog" aria-label={`아이콘 고르기 (지금: ${icon.label})`} title={`아이콘: ${icon.label}`}>
      <img src={icon.url} alt="" />
    </button>
  )
}
