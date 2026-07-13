import { PencilRuler } from 'lucide-react'

// 지도 도구함 런처 — 베이스맵 스위처(.basemap-switcher) 바로 왼쪽에 같은 크기·스타일로 붙는다.
// 클릭 시 지도 도구 패널(현재: 폴리곤/측정)을 토글한다.
function MapToolsLauncher({ isOpen, onToggle }) {
  return (
    <button
      type="button"
      className={`map-tools-launcher${isOpen ? ' is-open' : ''}`}
      onClick={onToggle}
      title="지도 도구"
      aria-label="지도 도구"
      aria-pressed={isOpen}
    >
      <PencilRuler size={22} strokeWidth={2} />
    </button>
  )
}

export default MapToolsLauncher
