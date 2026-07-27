import LevelSliderPanel from './LevelSliderPanel.jsx'

const MIN_FL_OPTIONS = ['all', 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550]

function label(value) {
  return value === 'all' ? '전체' : `FL${String(value).padStart(3, '0')}`
}

// 트랙 위쪽(index 0)이 위 화살표가 가는 방향 — 최저고도 값이 큰 쪽이 맨 위로 오게 내림차순.
const ITEMS = [...MIN_FL_OPTIONS].reverse().map((value) => ({ id: value, primary: label(value) }))

export default function ConvectiveOverlayControls({ ctpsVisible, minFl, onMinFlChange }) {
  if (!ctpsVisible) return null

  return (
    <LevelSliderPanel items={ITEMS} activeValue={minFl} onSelect={onMinFlChange} ariaLabel="구름 꼭대기 최저고도" />
  )
}
