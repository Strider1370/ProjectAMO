import { useCallback, useEffect, useMemo, useState } from 'react'
import { BoardView } from './components/BoardView.jsx'
import { RailView } from './components/RailView.jsx'
import { applyTerminalFixtureState, TERMINAL_FLIGHT_GROUPS } from './data/terminalFixtures.js'
import { parseTerminalFixtureState, parseTerminalMotionMode, parseTerminalView } from './model/terminalPager.js'
import { useTerminalPager } from './motion/useTerminalPager.js'
import { createTerminalMotionReplay } from './motion/terminalMotionReplay.js'
import './terminal.css'

/**
 * Passenger terminal display. It deliberately uses fixture data until the
 * flight/weather adapter is introduced; /monitoring remains an ops screen.
 */
export default function TerminalPage() {
  const search = useMemo(() => window.location.search, [])
  const [view, setView] = useState(() => parseTerminalView(window.location.search))
  const [motionMode, setMotionMode] = useState(() => parseTerminalMotionMode(search, view))
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const fixtureState = parseTerminalFixtureState(window.location.search, { allowOverride: import.meta.env.DEV })
  const groups = useMemo(() => applyTerminalFixtureState(TERMINAL_FLIGHT_GROUPS, fixtureState), [fixtureState])
  const pager = useTerminalPager({
    pageCount: groups.length,
    intervalMs: 9000,
    transitionMs: view === 'board' ? 1800 : 1250,
    enabled: new URLSearchParams(search).get('autoplay') !== '0',
  })
  const motionReplay = useMemo(() => createTerminalMotionReplay({ clock: window, advance: pager.advance }), [pager.advance])
  const cancelMotionReplay = useCallback(() => motionReplay.cancel(), [motionReplay])
  useEffect(() => () => cancelMotionReplay(), [cancelMotionReplay])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(media.matches)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  const selectView = useCallback((nextView) => {
    cancelMotionReplay()
    pager.cancel()
    setView(nextView)
    setMotionMode(parseTerminalMotionMode('', nextView))
  }, [cancelMotionReplay, pager.cancel])
  const selectMotion = useCallback((mode) => {
    if (pager.transitioning) return
    cancelMotionReplay()
    setMotionMode(mode)
    motionReplay.schedule()
  }, [cancelMotionReplay, motionReplay, pager.transitioning])

  const screenProps = {
    activeFlights: groups[pager.currentPage],
    pendingFlights: groups[pager.pendingPage],
    transition: pager.transitioning,
    currentPage: pager.currentPage,
    pageCount: groups.length,
    motionMode,
    onReplay: pager.advance,
    onSelectMotion: selectMotion,
    onSelectView: selectView,
    reducedMotion,
  }

  return <div className="terminal-signage">{view === 'board'
    ? <main className="prototype-shell"><BoardView {...screenProps} /></main>
    : <main className="prototype-shell"><RailView {...screenProps} /></main>
  }</div>
}
