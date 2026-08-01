import { MdInfoOutline } from 'react-icons/md'
import { TerminalHeader } from './TerminalHeader.jsx'
import { RailFlightRow } from './RailFlightRow.jsx'

function RailContents({ flights }) {
  return flights.map((flight, index) => <RailFlightRow flight={flight} rowIndex={index} key={flight.id} />)
}

export function RailView({ activeFlights, pendingFlights, transition, currentPage, pageCount, motionMode, onReplay, onSelectMotion, onSelectView }) {
  return <section className={`exact-screen exact-rail rail-motion-${motionMode}`} data-testid="option-three">
    <TerminalHeader view="rail" motionMode={motionMode} page={currentPage} pageCount={pageCount} onViewChange={onSelectView} onMotionChange={onSelectMotion} onAdvance={onReplay} />
    <div className="rail-viewport">
      <div className={`rail-page ${transition ? 'is-leaving' : ''}`}><RailContents flights={activeFlights} /></div>
      {transition && <div className="rail-page is-entering" aria-hidden="true"><RailContents flights={pendingFlights} /></div>}
    </div>
    <footer><MdInfoOutline /><span>도착 현지 시간 기준 · 예보는 참고용이며, 실제 날씨와 다를 수 있습니다.</span><b>다음 업데이트 <strong className="terminal-time-value" data-signage-text="required">09:30</strong> KST</b></footer>
  </section>
}
