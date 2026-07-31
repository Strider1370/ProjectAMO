import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { createTerminalPagerState, terminalPagerReducer } from '../model/terminalPager.js'
import { createTerminalPagerScheduler } from './terminalPagerScheduler.js'

export function useTerminalPager({ pageCount, intervalMs, transitionMs, enabled }) {
  const [state, dispatch] = useReducer(terminalPagerReducer, pageCount, createTerminalPagerState)
  const scheduler = useMemo(() => createTerminalPagerScheduler({ clock: window, intervalMs: enabled ? intervalMs : 0, transitionMs, dispatch }), [enabled, intervalMs, transitionMs])
  useEffect(() => { scheduler.start(); return () => scheduler.dispose() }, [scheduler])
  useEffect(() => { if (state.transitioning) scheduler.scheduleCompletion() }, [scheduler, state.transitioning])
  useEffect(() => { dispatch({ type: 'SET_PAGE_COUNT', pageCount }) }, [pageCount])
  const advance = useCallback(() => dispatch({ type: 'ADVANCE', source: 'manual' }), [])
  const completeTransition = useCallback(() => dispatch({ type: 'COMPLETE' }), [])
  const cancel = useCallback(() => scheduler.cancel(), [scheduler])
  const visibleState = state.pageCount === pageCount ? state : createTerminalPagerState(pageCount)
  return { ...visibleState, advance, cancel, completeTransition }
}
