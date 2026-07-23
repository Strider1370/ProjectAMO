import LevelRail from './LevelRail.jsx'

const MIN_FL_OPTIONS = ['all', 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550]

function label(value) {
  return value === 'all' ? '전체' : `FL${String(value).padStart(3, '0')}`
}

export default function ConvectiveOverlayControls({ ctpsVisible, minFl, onMinFlChange }) {
  if (!ctpsVisible) return null
  return (
    <LevelRail
      title="구름 꼭대기"
      items={MIN_FL_OPTIONS.map((value) => ({ value, label: label(value) }))}
      activeValue={minFl}
      onSelect={onMinFlChange}
      embedded
    />
  )
}
