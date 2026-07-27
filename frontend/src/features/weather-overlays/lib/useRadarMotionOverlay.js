import { useEffect, useState } from 'react'

export default function useRadarMotionOverlay({ radarEnabled, hasExactMotionFrame }) {
  const [requestedVisible, setRequestedVisible] = useState(false)
  const effectiveVisible = requestedVisible && radarEnabled && hasExactMotionFrame

  useEffect(() => {
    if (!radarEnabled) setRequestedVisible(false)
  }, [radarEnabled])

  return { requestedVisible, effectiveVisible, setRequestedVisible }
}
