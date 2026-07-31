import { useCallback, useEffect, useMemo, useState } from 'react'
import { DestinationWeatherPage } from './DestinationWeatherPage.jsx'
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

  return <DestinationWeatherPage
    view={view}
    groups={groups}
    pager={pager}
    motionMode={motionMode}
    onViewChange={selectView}
    onMotionChange={selectMotion}
  />
}
