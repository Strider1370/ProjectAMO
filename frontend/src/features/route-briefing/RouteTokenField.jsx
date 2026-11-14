import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { findProcedureByToken, TOKEN_COLORS, TOKEN_KINDS } from './lib/routeTokens.js'
import { buildRouteSuggestions } from './lib/routeAutocomplete.js'
import { buildAutocompletePreview } from './lib/autocompletePreviewLayers.js'
import './RouteTokenField.css'

// 알약은 그림이고, 타이핑은 알약 사이를 옮겨다니는 진짜 input 하나가 맡는다.
// 편집 영역 전체를 직접 다루면 커서·선택·붙여넣기·모바일 키보드를 전부 떠안게 되는데,
// 이런 입력칸에서 버그가 제일 많이 나오는 곳이 정확히 거기다.
//
// 이 부품은 경로를 모른다. 알약을 그리고 글자 목록의 변경을 알릴 뿐이다 — 판정도,
// 지도도, 서버도 모른다.
export default function RouteTokenField({ tokens = [], onChange, label, placeholder = '', disabled = false, hint = null, autocomplete = null, onPreviewChange, onPreviewMap }) {
  const inputRef = useRef(null)
  const boxRef = useRef(null)
  const menuRef = useRef(null)
  const pointerInMenu = useRef(false)
  const listId = useId()
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [closed, setClosed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [hoveredKey, setHoveredKey] = useState(null)
  const [position, setPosition] = useState(null)
  // 입력칸이 놓인 자리. tokens.length면 맨 끝이다.
  const [caret, setCaret] = useState(tokens.length)

  const texts = tokens.map((token) => token.text)
  const at = Math.min(caret, tokens.length)
  const groups = useMemo(() => autocomplete ? buildRouteSuggestions({ ...autocomplete, query: draft, tokens, at }) : [], [autocomplete, draft, tokens, at])
  const items = useMemo(() => groups.flatMap((group) => group.items.slice(0, 40)), [groups])
  const open = focused && !closed && !!draft.trim() && items.length > 0
  const highlighted = open ? (items.find((item) => item.key === hoveredKey) ?? items[activeIndex] ?? null) : null
  const preview = useMemo(() => buildAutocompletePreview(highlighted, autocomplete?.lookups), [highlighted, autocomplete?.lookups])

  useEffect(() => { onPreviewChange?.(preview) }, [onPreviewChange, preview])
  useEffect(() => () => onPreviewChange?.(null), [onPreviewChange])

  useLayoutEffect(() => {
    if (!open) return undefined
    const update = () => {
      const rect = boxRef.current?.getBoundingClientRect()
      if (!rect) return
      const margin = 8, gap = 5, preferred = 280
      const below = window.innerHeight - rect.bottom - gap - margin
      const above = rect.top - gap - margin
      const up = below < preferred && above > below
      const maxHeight = Math.max(60, Math.min(preferred, up ? above : below))
      setPosition({ left: Math.max(margin, rect.left), width: Math.min(rect.width, window.innerWidth - margin * 2), ...(up ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }), maxHeight })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open, at, tokens])

  useEffect(() => {
    if (activeIndex < 0) return
    const menu = menuRef.current
    const active = menu?.querySelector('[aria-selected="true"]')
    if (!menu || !active) return
    const a = active.getBoundingClientRect(), b = menu.getBoundingClientRect()
    if (a.bottom > b.bottom) menu.scrollTop += a.bottom - b.bottom
    else if (a.top < b.top) menu.scrollTop -= b.top - a.top
  }, [activeIndex, items])

  // 목록은 밖에서도 바뀐다(위쪽 선택기, 첫 진입 초기값). 그때 커서가 제자리에 남아 있으면
  // 다음에 치는 토큰이 엉뚱한 자리에 끼워진다 — 공항을 고른 뒤 DCT를 치면 'DCT RKSS RKPK'가
  // 되어 경로가 성립하지 않았다.
  // 우리가 직접 바꾼 길이는 미리 적어두고, 그와 다르면 밖에서 바뀐 것으로 보고 커서를 끝으로 옮긴다.
  // 커서는 끝이 아니라 '마지막 공항 앞'으로 간다. 공항이 양 끝에 놓인 뒤 다음에 치는 것은
  // 그 사이에 들어가야 맞다 — 경로는 출발과 목적지 사이를 채우는 것이기 때문이다.
  // 끝으로 보내면 VFR에서 'RKSS RKPK DCT'처럼 연결어가 목적지 뒤에 붙어 경로가 성립하지 않는다.
  const expectedLengthRef = useRef(tokens.length)
  const previousTextsRef = useRef(texts)
  useEffect(() => {
    const previous = previousTextsRef.current
    previousTextsRef.current = texts
    if (tokens.length === expectedLengthRef.current) return
    expectedLengthRef.current = tokens.length
    // 서버 계산이 경로 토큰을 펼쳐도 사용자가 보고 있던 지점에 커서를 둔다.
    if (document.activeElement === inputRef.current && previous.length > 0) {
      const right = previous[caret]
      const left = previous[caret - 1]
      const rightIndex = right ? texts.indexOf(right) : -1
      if (rightIndex >= 0) { setCaret(rightIndex); return }
      const leftIndex = left ? texts.lastIndexOf(left) : -1
      if (leftIndex >= 0) { setCaret(leftIndex + 1); return }
    }
    const lastIsAirport = tokens.length > 1 && tokens.at(-1)?.kind === TOKEN_KINDS.AIRPORT
    setCaret(lastIsAirport ? tokens.length - 1 : tokens.length)
  }, [tokens]) // caret은 토큰이 바뀐 시점의 위치를 읽는다.

  // 칸은 높이가 정해져 있고 넘치면 칸 안에서 스크롤된다(RouteTokenField.css). 알약을 치거나 지우면
  // 입력 커서가 있는 줄이 보이도록 칸 안에서만 따라간다 — scrollIntoView는 바깥 패널까지 움직인다.
  useEffect(() => {
    const box = boxRef.current
    const input = inputRef.current
    if (!box || !input) return
    const top = input.offsetTop
    const bottom = top + input.offsetHeight
    if (top < box.scrollTop) box.scrollTop = top - 6
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 6
  }, [caret, tokens])

  const commit = (value, kind = null) => {
    const trimmed = value.trim()
    if (!trimmed) return
    let insertAt = at
    const procedures = kind === 'SID' ? autocomplete?.sidOptions : kind === 'STAR' ? autocomplete?.starOptions : null
    const next = texts.filter((text, index) => {
      if (!procedures || !findProcedureByToken(text, procedures)) return true
      if (index < at) insertAt -= 1
      return false
    })
    // 한 번에 여러 토큰을 붙여넣는 경우가 있다 — 공백으로 갈라 각각 토큰으로 넣는다.
    const parts = trimmed.split(/\s+/)
    next.splice(insertAt, 0, ...parts)
    expectedLengthRef.current = next.length
    onChange?.(next)
    setCaret(insertAt + parts.length)
    setDraft('')
    setClosed(false)
    setActiveIndex(-1)
  }

  useEffect(() => {
    if (!open) return undefined
    const release = () => { setTimeout(() => { pointerInMenu.current = false }, 0) }
    const dismiss = (event) => {
      if (boxRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      // 터치로 목록을 스크롤하며 입력 포커스를 잃은 경우에도 바깥을 누르면 확정한다.
      if (document.activeElement !== inputRef.current) { commit(draft); setFocused(false) }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('pointerup', release)
    document.addEventListener('pointercancel', release)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('pointerup', release)
      document.removeEventListener('pointercancel', release)
    }
  }, [open, draft, at, tokens])

  const removeBefore = () => {
    if (at === 0) return
    const next = [...texts]
    next.splice(at - 1, 1)
    expectedLengthRef.current = next.length
    onChange?.(next)
    setCaret(at - 1)
  }

  const onKeyDown = (event) => {
    if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      setHoveredKey(null)
      setActiveIndex((index) => event.key === 'ArrowDown' ? (index + 1) % items.length : (index < 0 ? items.length - 1 : (index + items.length - 1) % items.length))
      return
    }
    if (open && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setClosed(true)
      setHoveredKey(null)
      setActiveIndex(-1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (!draft.trim()) {
        // 빈 칸에서 스페이스로 알약이 생기면 빈 알약이 남는다.
        if (event.key === ' ') event.preventDefault()
        return
      }
      event.preventDefault()
      const selected = event.key === 'Enter' && open && activeIndex >= 0 ? items[activeIndex] : null
      commit(selected?.value ?? draft, selected?.kind)
      return
    }
    if (event.key === 'Backspace' && draft === '') {
      event.preventDefault()
      removeBefore()
      return
    }
    // 글자를 치던 중이면 화살표는 그 글자 안에서 움직여야 한다(브라우저 기본 동작).
    // 빈 칸일 때만 알약 사이를 옮겨다닌다.
    if (draft === '' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const next = event.key === 'ArrowLeft' ? at - 1 : at + 1
      if (next < 0 || next > tokens.length) return
      event.preventDefault()
      setCaret(next)
      return
    }
    if (draft === '' && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      setCaret(event.key === 'Home' ? 0 : tokens.length)
    }
  }

  const onMenuKeyDown = (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    inputRef.current?.focus()
    setClosed(true)
    setHoveredKey(null)
    setActiveIndex(-1)
  }

  const onMenuBlur = (event) => {
    if (event.currentTarget.contains(event.relatedTarget) || event.relatedTarget === inputRef.current) return
    setFocused(false)
    commit(draft)
  }

  // 알약을 눌러도 키보드가 닫히지 않도록 기본 동작을 막고 초점을 입력칸에 유지한다.
  const moveCaret = (index) => (event) => {
    event.preventDefault()
    event.stopPropagation()
    const pending = draft.trim() ? draft.trim().split(/\s+/).length : 0
    if (pending) commit(draft)
    setCaret(index + (pending && index >= at ? pending : 0))
    inputRef.current?.focus()
  }

  // 토큰 왼쪽/오른쪽 절반을 누른 위치로 커서를 놓는다.
  const moveCaretAtPill = (index) => (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    moveCaret(index + (event.clientX >= rect.left + rect.width / 2 ? 1 : 0))(event)
  }

  const moveCaretAtSpace = (event) => {
    const pills = [...(boxRef.current?.querySelectorAll('.rtf-pill, .rtf-dct') ?? [])]
    const index = pills.findIndex((pill) => {
      const rect = pill.getBoundingClientRect()
      return event.clientY < rect.top || (event.clientY <= rect.bottom && event.clientX < rect.left + rect.width / 2)
    })
    moveCaret(index < 0 ? pills.length : index)(event)
  }

  const renderPill = (token, index) => {
    const color = TOKEN_COLORS[token.kind]
    if (token.kind === TOKEN_KINDS.DCT) {
      return (
        <span key={`${token.text}-${index}`} className="rtf-dct" onMouseDown={moveCaretAtPill(index)}>
          {token.text}
        </span>
      )
    }
    return (
      <span
        key={`${token.text}-${index}`}
        className={`rtf-pill is-${token.kind}`}
        style={{ background: color?.bg, color: color?.fg, border: color?.border ?? '1px solid transparent' }}
        title={token.reason ?? undefined}
        onMouseDown={moveCaretAtPill(index)}
      >
        {token.text}
      </span>
    )
  }

  return (
    <label className="rtf">
      {(label || hint) && (
        <span className="rtf-labelrow">
          {label && <span className="rtf-label">{label}</span>}
          {hint && <span className="rtf-hint">{hint}</span>}
        </span>
      )}
      <div ref={boxRef} className="rtf-box" onMouseDown={moveCaretAtSpace}>
        {tokens.slice(0, at).map(renderPill)}
        {/* 알약 사이에 커서가 있고 아직 아무것도 치지 않았을 때만 세로선을 보인다.
            치기 시작하면 글자 자체가 자리를 알리므로 선은 사라진다. */}
        {at < tokens.length && draft === '' && <span className="rtf-caret" aria-hidden="true" />}
        {/* 입력칸이 알약보다 앞에 있으면서 남은 공간을 다 차지하면 뒤 알약이 오른쪽 끝으로
            밀린다. 맨 끝에 있을 때만 늘어나게 한다(is-last). */}
        <input
          ref={inputRef}
          className={`rtf-input${at >= tokens.length ? ' is-last' : ''}${draft ? ' has-draft' : ''}`}
          type="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={draft}
          role="combobox"
          aria-label={label || '경로 입력'}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder={tokens.length === 0 ? placeholder : ''}
          // 입력칸을 누른 것은 자리를 옮기겠다는 뜻이 아니다. 이 이벤트가 상자로 번지면
          // 상자의 처리기가 커서를 끝으로 끌어가, 목적지 앞에 있던 자리를 잃는다.
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => { setDraft(event.target.value.toUpperCase()); setClosed(false); setActiveIndex(-1); setHoveredKey(null) }}
          onKeyDown={onKeyDown}
          onFocus={() => { setFocused(true); setClosed(false) }}
          onBlur={(event) => { if (pointerInMenu.current || menuRef.current?.contains(event.relatedTarget)) return; setFocused(false); commit(draft) }}
        />
        {tokens.slice(at).map((token, index) => renderPill(token, at + index))}
      </div>
      {open && position && createPortal(
        <div className="rtf-suggestions" ref={menuRef} style={position} onPointerDown={() => { pointerInMenu.current = true }} onMouseLeave={() => setHoveredKey(null)} onKeyDown={onMenuKeyDown} onBlur={onMenuBlur}>
          <div id={listId} role="listbox" aria-label="경로 자동완성">
          {groups.map((group) => {
            const groupItems = group.items.slice(0, 40)
            return <div key={group.label} role="group" aria-label={group.label}>
              <div className="rtf-suggest-group">{group.label}</div>
              {groupItems.map((item) => {
                const index = items.indexOf(item)
                return <button type="button" role="option" id={`${listId}-${index}`} aria-selected={index === activeIndex} className="rtf-suggest-option" key={item.key}
                  onMouseMove={() => { setHoveredKey(item.key); setActiveIndex(-1) }}
                  onFocus={() => setHoveredKey(item.key)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { commit(item.value, item.kind); setFocused(true); inputRef.current?.focus() }}>
                  <span className="rtf-suggest-name"><span className="rtf-suggest-match">{item.name.slice(0, draft.trim().length)}</span>{item.name.slice(draft.trim().length)}</span>
                  <span className={`rtf-suggest-kind is-${item.kind.toLowerCase()}`}>{({ SID: 'SID', STAR: 'STAR', FIX: '웨이포인트', AIRWAY: '항로' })[item.kind]}</span>
                  {item.connection && <span className="rtf-suggest-connection">{item.connection} 연결</span>}
                </button>
              })}
            </div>
          })}
          </div>
          <div className="rtf-suggest-help"><span>↑↓ 이동 · Enter 선택 · Esc 닫기</span>{preview && onPreviewMap && <button type="button" className="rtf-suggest-map" onMouseDown={(event) => event.preventDefault()} onClick={() => { onPreviewMap(preview); inputRef.current?.focus() }}>지도에서 보기</button>}</div>
        </div>, document.body,
      )}
    </label>
  )
}
