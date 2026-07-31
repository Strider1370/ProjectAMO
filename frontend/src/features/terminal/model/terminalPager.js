export function parseTerminalView(search = '') {
  return new URLSearchParams(search).get('view') === 'rail' ? 'rail' : 'board'
}

const terminalMotionModes = {
  board: ['split', 'roll', 'wipe', 'fade'],
  rail: ['cascade', 'flap', 'roll', 'wipe', 'fade'],
}

export function parseTerminalMotionMode(search = '', view = 'board') {
  const selectedView = view === 'rail' ? 'rail' : 'board'
  const fallback = selectedView === 'rail' ? 'cascade' : 'split'
  const requested = new URLSearchParams(search).get(selectedView === 'rail' ? 'railMotion' : 'motion')
  return terminalMotionModes[selectedView].includes(requested) ? requested : fallback
}

export function nextPageIndex(currentPage, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new RangeError('pageCount must be positive')
  return (currentPage + 1) % pageCount
}

export function parseTerminalFixtureState(search = '', { allowOverride = false } = {}) {
  if (!allowOverride) return 'ready'
  const requested = new URLSearchParams(search).get('fixtureState')
  return ['loading', 'partial', 'error'].includes(requested) ? requested : 'ready'
}

export function createTerminalPagerState(pageCount) {
  return { currentPage: 0, pendingPage: nextPageIndex(0, pageCount), transitioning: false, pageCount }
}

export function terminalPagerReducer(state, event) {
  if (event.type === 'SET_PAGE_COUNT') {
    if (event.pageCount === state.pageCount) return state
    return createTerminalPagerState(event.pageCount)
  }
  if (event.type === 'ADVANCE') {
    if (state.transitioning) return state
    return { ...state, pendingPage: nextPageIndex(state.currentPage, state.pageCount), transitioning: true }
  }
  if (event.type === 'COMPLETE') {
    if (!state.transitioning) return state
    const currentPage = state.pendingPage
    return { ...state, currentPage, pendingPage: nextPageIndex(currentPage, state.pageCount), transitioning: false }
  }
  if (event.type === 'CANCEL') return { ...state, pendingPage: nextPageIndex(state.currentPage, state.pageCount), transitioning: false }
  return state
}
