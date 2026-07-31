import { MdChevronRight } from 'react-icons/md'
import boardHeaderPlane from '../assets/board-header-plane.png'
import { PageIndicator } from './PageIndicator.jsx'

const boardModes = [['split', 'FLAP', '뒤집기'], ['roll', 'ROLL', '세로 롤'], ['wipe', 'WIPE', '마스크'], ['fade', 'FADE', '겹침']]
const railModes = [['cascade', 'CASCADE', '행 순차'], ['flap', 'FLAP', '요소 플랩'], ['roll', 'ROLL', '요소 롤'], ['wipe', 'WIPE', '마스크'], ['fade', 'FADE', '겹침']]

export function TerminalHeader({ view, motionMode, page, pageCount, onViewChange, onMotionChange, onAdvance }) {
  const isBoard = view === 'board'
  const modes = isBoard ? boardModes : railModes
  return <>
    <PageIndicator currentPage={page} pageCount={pageCount} />
    <header className={isBoard ? 'board-header' : 'rail-header'}>
      {isBoard && <img src={boardHeaderPlane} alt="" aria-hidden="true" />}
      <h1>출발 항공편 · 도착지 날씨</h1>
      {!isBoard && <span>도착 현지 시간 기준 예보</span>}
      <div className={isBoard ? 'board-header-actions' : 'rail-header-actions'}>
        <nav className="view-switcher" aria-label="화면 비교"><button type="button" className={isBoard ? 'is-active' : ''} aria-pressed={isBoard} onClick={() => onViewChange('board')}>1안</button><button type="button" className={!isBoard ? 'is-active' : ''} aria-pressed={!isBoard} onClick={() => onViewChange('rail')}>3안</button></nav>
        <div className="motion-mode-switch" aria-label={`${isBoard ? '1안' : '3안'} 전환 애니메이션`} style={{ '--motion-count': modes.length }}>{modes.map(([mode, title, label]) => <button type="button" className={motionMode === mode ? 'is-active' : ''} aria-pressed={motionMode === mode} onClick={() => onMotionChange(mode)} key={mode}><strong>{title}</strong><span>{label}</span></button>)}</div>
        <button type="button" className="next-board-button" onClick={onAdvance}><MdChevronRight /><span>다음 3편</span></button>
      </div>
      {isBoard ? <div className="board-header-clock"><span>한국 시각</span><strong className="terminal-time-value" data-signage-text="required">06:32</strong><small><span className="terminal-time-value" data-signage-text="required">2026-07-30</span> (목) · KST</small></div> : <div className="rail-header-clock"><span>한국 시각</span><strong className="terminal-time-value" data-signage-text="required">09:15</strong><small><span className="terminal-time-value" data-signage-text="required">2026-07-30</span> (목)</small><b>KST</b></div>}
    </header>
  </>
}
