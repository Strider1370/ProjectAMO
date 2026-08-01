import { RailView } from './components/RailView.jsx'

/** @deprecated TerminalPage now composes RailView directly. */
export function DestinationWeatherPage({ groups, pager, motionMode, onViewChange, onMotionChange }) {
  return <main className="prototype-shell"><RailView
    activeFlights={groups[pager.currentPage]}
    pendingFlights={groups[pager.pendingPage]}
    transition={pager.transitioning}
    currentPage={pager.currentPage}
    pageCount={groups.length}
    motionMode={motionMode}
    onReplay={pager.advance}
    onSelectMotion={onMotionChange}
    onSelectView={onViewChange}
  /></main>
}

export const App = DestinationWeatherPage
