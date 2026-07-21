import { useEffect, useState } from 'react'

export default function useRadarMotionOverlay({ radarEnabled, hasExactMotionFrame, stale }) {
  const [requestedVisible, setRequestedVisible] = useState(false)
  const effectiveVisible = requestedVisible && radarEnabled && hasExactMotionFrame && !stale

  useEffect(() => {
    if (!radarEnabled) setRequestedVisible(false)
  }, [radarEnabled])

  return { requestedVisible, effectiveVisible, setRequestedVisible }
}
