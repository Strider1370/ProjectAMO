import { formatKstMinute } from './lib/weatherTimeline.js'

function AdsbTimestamp({ isVisible, updatedAt, compact = false }) {
  const updatedMs = Date.parse(updatedAt || '')
  if (!isVisible || !Number.isFinite(updatedMs)) return null

  return (
    <div className={`adsb-timestamp${compact ? ' adsb-timestamp--compact' : ''}`} aria-label="ADS-B reference time">
      ADS-B {formatKstMinute(updatedMs)}
    </div>
  )
}

export default AdsbTimestamp
