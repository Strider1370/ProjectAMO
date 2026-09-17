import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { normalizeTimeZone, readDisplayPreferences } from '../settings/displayPreferences.js'

const TimeZoneContext = createContext({ tz: 'KST', setTz: () => {} })

export function TimeZoneProvider({ children }) {
  const [tz, setTzState] = useState(() => readDisplayPreferences().timeZone)
  const setTz = useCallback((value) => setTzState(normalizeTimeZone(value)), [])
  const value = useMemo(() => ({ tz, setTz }), [tz, setTz])
  return (
    <TimeZoneContext.Provider value={value}>
      {children}
    </TimeZoneContext.Provider>
  )
}

export function useTimeZone() {
  return useContext(TimeZoneContext)
}
