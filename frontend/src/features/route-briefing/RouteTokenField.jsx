import { useRef, useState } from 'react'
import { TOKEN_COLORS, TOKEN_KINDS } from './lib/routeTokens.js'
import './RouteTokenField.css'

// 알약은 그림이고, 타이핑은 알약 사이를 옮겨다니는 진짜 input 하나가 맡는다.
// 편집 영역 전체를 직접 다루면 커서·선택·붙여넣기·모바일 키보드를 전부 떠안게 되는데,
// 이런 입력칸에서 버그가 제일 많이 나오는 곳이 정확히 거기다.
//
// 이 부품은 경로를 모른다. 알약을 그리고 글자 목록의 변경을 알릴 뿐이다 — 판정도,
// 지도도, 서버도 모른다.
export default function RouteTokenField({ tokens = [], onChange, label, placeholder = '', disabled = false }) {
  const inputRef = useRef(null)
  const [draft, setDraft] = useState('')
  // 입력칸이 놓인 자리. tokens.length면 맨 끝이다.
  const [caret, setCaret] = useState(tokens.length)

  const texts = tokens.map((token) => token.text)
  const at = Math.min(caret, tokens.length)

  const commit = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const next = [...texts]
    // 한 번에 여러 토큰을 붙여넣는 경우가 있다 — 공백으로 갈라 각각 토큰으로 넣는다.
    const parts = trimmed.split(/\s+/)
    next.splice(at, 0, ...parts)
    onChange?.(next)
    setCaret(at + parts.length)
    setDraft('')
  }

  const removeBefore = () => {
    if (at === 0) return
    const next = [...texts]
    next.splice(at - 1, 1)
    onChange?.(next)
    setCaret(at - 1)
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (!draft.trim()) {
        // 빈 칸에서 스페이스로 알약이 생기면 빈 알약이 남는다.
        if (event.key === ' ') event.preventDefault()
        return
      }
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && draft === '') {
      event.preventDefault()
      removeBefore()
    }
  }

  // 알약을 눌러도 키보드가 닫히지 않도록 기본 동작을 막고 초점을 입력칸에 유지한다.
  const moveCaret = (index) => (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (draft.trim()) commit(draft)
    setCaret(index)
    inputRef.current?.focus()
  }

  const renderPill = (token, index) => {
    const color = TOKEN_COLORS[token.kind]
    if (token.kind === TOKEN_KINDS.DCT) {
      return (
        <span key={`${token.text}-${index}`} className="rtf-dct" onMouseDown={moveCaret(index)}>
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
        onMouseDown={moveCaret(index)}
      >
        {token.text}
      </span>
    )
  }

  return (
    <label className="rtf">
      {label && <span className="rtf-label">{label}</span>}
      <div className="rtf-box" onMouseDown={moveCaret(tokens.length)}>
        {tokens.slice(0, at).map(renderPill)}
        <input
          ref={inputRef}
          className="rtf-input"
          type="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={draft}
          placeholder={tokens.length === 0 ? placeholder : ''}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
        />
        {tokens.slice(at).map((token, index) => renderPill(token, at + index))}
      </div>
    </label>
  )
}
