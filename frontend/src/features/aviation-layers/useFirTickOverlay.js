import { useEffect, useState } from 'react'
import { AVIATION_WFS_LAYERS } from './aviationWfsLayers.js'
import { loadGeoJsonOnce } from '../map/lib/mapLayerUtils.js'

// FIR 경계 틱(수직 짧은 획)을 symbol이 아니라 '실제 선분 지오메트리'로 렌더한다.
// 왜: symbol-placement:'line'은 스크롤 연속 줌 후 배치가 stale로 남아 대각선에서 틱이 선에서 떨어진다
//     (버튼/정수줌은 재배치돼 멀쩡, 스크롤은 아님 — 경로 의존적 간헐 이탈). 지오메트리 틱은 지도와 한 몸이라
//     모든 줌/스크롤에서 선에 붙어있다. 화면상수 길이·간격은 moveend마다 재생성으로 유지.
// 계산은 픽셀 공간에서: 선을 화면 픽셀 등간격으로 걸으며 각 지점의 수직(법선)으로 짧은 획을 만들고 unproject.
// 픽셀 공간이라 Web Mercator 위경도 왜곡과 무관하게 화면상 정확히 수직.

const TICK_SOURCE = 'wfs-fir-ticks-src'
const TICK_LAYER = 'wfs-fir-ticks' // setLayerVisibility(mapLayerUtils)가 이 id로 FIR과 함께 토글
const TICK_LEN = 7 // 화면 픽셀 — 획 길이(기존 아이콘 스트로크와 동일 체감)
const TICK_WIDTH = 1.8
const MIN_LEG_KM = 3 // 이보다 짧은 세그먼트(=휴전선·해안선 추적선)엔 틱을 안 찍는다. 아래 설명 참조.
const EMPTY = { type: 'FeatureCollection', features: [] }

// FIR 경계는 두 종류가 섞여 있다: (1) 바다 위 실제 관제 경계 leg(수십~수백km 직선 몇 개),
// (2) 남북 육상 경계(휴전선)를 87m 간격으로 추적한 수천 점. 틱은 (1)에만 의미가 있고,
// (2)를 다 투영하면 정점 5,637개(→ 해외 FIR까지 붙이면 더) 부하가 커진다. 그래서 로드 시 한 번,
// '긴 세그먼트(>=MIN_LEG_KM)로 이어진 구간(run)'만 뽑아 틱 대상으로 남긴다 — 휴전선은 세그먼트가
// 전부 짧아 자동 제외되고(투영도 안 함), 바다 leg만 남아 정점 수천 → 수십으로 줄어든다.
const R_KM = 6371
const d2r = Math.PI / 180
function segKm(a, b) {
  const dlat = (b[1] - a[1]) * d2r, dlon = (b[0] - a[0]) * d2r
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * d2r) * Math.cos(b[1] * d2r) * Math.sin(dlon / 2) ** 2
  return 2 * R_KM * Math.asin(Math.sqrt(h))
}
function longLegRuns(coords) {
  const runs = []
  let run = [coords[0]]
  for (let i = 1; i < coords.length; i++) {
    if (segKm(coords[i - 1], coords[i]) >= MIN_LEG_KM) {
      run.push(coords[i])
    } else {
      if (run.length >= 2) runs.push(run)
      run = [coords[i]]
    }
  }
  if (run.length >= 2) runs.push(run)
  return runs
}

function buildTicks(map, lines) {
  const cv = map.getCanvas()
  const W = cv.clientWidth, H = cv.clientHeight
  const m = TICK_LEN + 8 // 뷰포트 컬링 여유
  const features = []
  for (const { coords, spacing, side } of lines) {
    const pts = coords.map((c) => { const p = map.project(c); return [p.x, p.y] })
    let cum = 0, next = spacing // 누적 호길이 / 다음 틱까지 거리
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1]
      const [x2, y2] = pts[i]
      const dx = x2 - x1, dy = y2 - y1
      const L = Math.hypot(dx, dy)
      if (L === 0) continue
      const ux = dx / L, uy = dy / L        // 진행 단위벡터
      const nx = -uy * side, ny = ux * side // 화면상 법선(수직) 단위벡터
      while (next <= cum + L) {
        const d = next - cum
        const bx = x1 + ux * d, by = y1 + uy * d
        next += spacing
        if (bx < -m || bx > W + m || by < -m || by > H + m) continue // 화면 밖 틱 생략
        const a = map.unproject([bx, by])
        const t = map.unproject([bx + nx * TICK_LEN, by + ny * TICK_LEN])
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [t.lng, t.lat]] } })
      }
      cum += L
    }
  }
  return { type: 'FeatureCollection', features }
}

export function useFirTickOverlay(mapRef, isStyleReady, styleRevision) {
  const fir = AVIATION_WFS_LAYERS.find((l) => l.id === 'fir')
  const [lines, setLines] = useState(null)

  // 틱을 다는 경계선 좌표. 지도 소스와 같은 파일이라 loadGeoJsonOnce로 공유한다 —
  // 예전엔 각자 fetch해서, 첫 방문에 두 요청이 동시에 나가 브라우저 캐시로도 못 막고
  // 254KB를 두 번 받았다.
  useEffect(() => {
    let alive = true
    loadGeoJsonOnce(fir.dataUrl)
      .then((fc) => {
        if (!alive) return
        const out = []
        for (const f of fc.features) {
          if (f.geometry?.type !== 'LineString') continue
          const role = f.properties?.role
          const cfg = role === 'incheon-fir-boundary' ? { spacing: fir.tickSpacing, side: 1 }
            : role === 'inner-boundary' ? { spacing: fir.innerTickSpacing, side: -1 }
            : null
          if (!cfg) continue
          // 바다 leg(긴 세그먼트)만 틱 대상 — 휴전선·해안선 추적선은 자동 제외.
          for (const run of longLegRuns(f.geometry.coordinates)) out.push({ coords: run, ...cfg })
        }
        setLines(out)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [fir.dataUrl, fir.tickSpacing, fir.innerTickSpacing])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !lines) return undefined

    if (!map.getSource(TICK_SOURCE)) map.addSource(TICK_SOURCE, { type: 'geojson', data: EMPTY })
    if (!map.getLayer(TICK_LAYER)) {
      map.addLayer({
        id: TICK_LAYER,
        type: 'line',
        source: TICK_SOURCE,
        slot: 'top',
        paint: { 'line-color': fir.color, 'line-width': TICK_WIDTH, 'line-opacity': fir.lineOpacity },
        layout: { visibility: fir.defaultVisible ? 'visible' : 'none' },
      })
    }

    const regen = () => {
      const src = map.getSource(TICK_SOURCE)
      if (src) src.setData(buildTicks(map, lines))
    }
    regen()
    map.on('moveend', regen)
    return () => { map.off('moveend', regen) }
  }, [mapRef, isStyleReady, styleRevision, lines, fir.color, fir.lineOpacity, fir.defaultVisible])
}
