import { Fragment } from 'react'
import { MdInfoOutline } from 'react-icons/md'
import { TerminalHeader } from './TerminalHeader.jsx'
import { BoardFlightColumn } from './BoardFlightColumn.jsx'

function BoardContents({ flights }) {
  return <>
    {flights.map((flight, index) => <Fragment key={flight.id}>
      <BoardFlightColumn flight={flight} columnIndex={index} />
      {index < flights.length - 1 && <i className="board-column-separator" aria-hidden="true" />}
    </Fragment>)}
  </>
}

export function BoardView({ activeFlights, pendingFlights, transition, currentPage, pageCount, motionMode, onReplay, onSelectMotion, onSelectView, reducedMotion }) {
  return <section className={`exact-screen exact-board motion-${motionMode}`} data-testid="option-one">
    <TerminalHeader view="board" motionMode={motionMode} page={currentPage} pageCount={pageCount} onViewChange={onSelectView} onMotionChange={onSelectMotion} onAdvance={onReplay} />
    <div className="board-viewport">
      <div className={`board-page ${transition ? 'is-leaving' : ''}`} aria-hidden={transition && reducedMotion}><BoardContents flights={activeFlights} /></div>
      {transition && <div className="board-page is-entering" aria-hidden={!reducedMotion}><BoardContents flights={pendingFlights} /></div>}
    </div>
    <footer className="board-footer"><MdInfoOutline /><span>도착 현지 시간 기준 · 예보는 참고용이며, 실제 날씨와 다를 수 있습니다.</span><b>다음 업데이트 <strong className="terminal-time-value" data-signage-text="required">06:45</strong> KST</b></footer>
  </section>
}
