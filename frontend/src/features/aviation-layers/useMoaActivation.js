import { useEffect, useState } from 'react'
import { AVIATION_WFS_LAYERS } from './aviationWfsLayers.js'
import { matchMoaActivation, moaMatchKey } from './lib/moaActivation.js'
import { deriveNotamTime } from '../notam/lib/notamViewModel.js'

// 활성화된 군작전구역을 빗금으로 덧칠한다. 왜 색을 안 바꾸는가:
// 빨강은 금지/제한/위험구역이 쓰는 색이라, 활성 MOA를 빨갛게 칠하면 "진입 금지"로 읽힌다.
// MOA는 활성이어도 법적으로 진입 가능한 구역이므로 같은 황토색을 유지하고 채움 질감만 바꾼다.
//
// 두 단계로 나누는 이유: NOTAM의 D)필드(요일·시간대 조건)는 아직 파싱하지 않는다.
// D)가 있으면 지금 켜졌는지 단정할 수 없으므로 '조건부'로 흐리게 표시하고 단정하지 않는다.
const HATCH_IMAGE = 'moa-active-hatch'
const HATCH_PX = 8
const ACTIVE_OPACITY = 0.85
const CONDITIONAL_OPACITY = 0.4

// 45° 빗금 타일. 세 줄을 -HATCH_PX/0/+HATCH_PX 오프셋으로 그려 타일 경계에서 끊기지 않게 한다.
function hatchImage(color) {
  const canvas = document.createElement('canvas')
  canvas.width = HATCH_PX
  canvas.height = HATCH_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  for (const offset of [-HATCH_PX, 0, HATCH_PX]) {
    ctx.beginPath()
    ctx.moveTo(offset, HATCH_PX)
    ctx.lineTo(offset + HATCH_PX, 0)
    ctx.stroke()
  }
  const { data, width, height } = ctx.getImageData(0, 0, HATCH_PX, HATCH_PX)
  return { width, height, data: new Uint8Array(data) }
}

// 폴리곤 속성에서 매칭 키를 만드는 Mapbox 표현식 — moaMatchKey()와 같은 형식이어야 한다.
const KEY_EXPRESSION = [
  'concat',
  ['to-string', ['get', 'moa_lbl_1']], '|',
  ['to-string', ['get', 'moa_lbl_2']], '|',
  ['to-string', ['get', 'moa_lbl_3']],
]

export function useMoaActivation(mapRef, isStyleReady, styleRevision, notamData) {
  const layer = AVIATION_WFS_LAYERS.find((l) => l.id === 'moa')
  const [features, setFeatures] = useState(null)

  // 폴리곤을 1회 로드(브라우저 캐시 — 지도 소스가 이미 받은 파일).
  useEffect(() => {
    let alive = true
    fetch(layer.dataUrl)
      .then((r) => r.json())
      .then((fc) => { if (alive) setFeatures(fc.features ?? []) })
      .catch(() => { if (alive) setFeatures([]) })
    return () => { alive = false }
  }, [layer.dataUrl])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady || !features) return
    if (!map.getSource(layer.sourceId)) return

    if (!map.hasImage(HATCH_IMAGE)) {
      const img = hatchImage(layer.color)
      if (img) map.addImage(HATCH_IMAGE, img)
    }

    const items = notamData?.items ?? []
    const now = Date.now()
    const active = new Set()
    const conditional = new Set()
    for (const m of matchMoaActivation(items, features)) {
      const { state } = deriveNotamTime(m.notam, now)
      if (state === 'active') active.add(m.key)
      else if (state === 'conditional') conditional.add(m.key)
    }
    // 같은 구역이 두 NOTAM에 걸리면 확실한 쪽(active)을 남긴다.
    for (const key of active) conditional.delete(key)

    const activeKeys = [...active]
    const shownKeys = [...active, ...conditional]
    const visibility = map.getLayoutProperty(layer.fillLayerId, 'visibility') ?? 'visible'
    const filter = ['in', KEY_EXPRESSION, ['literal', shownKeys]]
    const opacity = ['case', ['in', KEY_EXPRESSION, ['literal', activeKeys]], ACTIVE_OPACITY, CONDITIONAL_OPACITY]

    if (!map.getLayer(layer.activeFillLayerId)) {
      map.addLayer({
        id: layer.activeFillLayerId,
        type: 'fill',
        source: layer.sourceId,
        slot: 'top',
        filter,
        paint: { 'fill-pattern': HATCH_IMAGE, 'fill-opacity': opacity },
        layout: { visibility },
      })
    } else {
      map.setFilter(layer.activeFillLayerId, filter)
      map.setPaintProperty(layer.activeFillLayerId, 'fill-opacity', opacity)
    }

    if (!map.getLayer(layer.activeLineLayerId)) {
      map.addLayer({
        id: layer.activeLineLayerId,
        type: 'line',
        source: layer.sourceId,
        slot: 'top',
        filter,
        paint: { 'line-color': layer.color, 'line-width': 2.6, 'line-opacity': opacity },
        layout: { visibility },
      })
    } else {
      map.setFilter(layer.activeLineLayerId, filter)
      map.setPaintProperty(layer.activeLineLayerId, 'line-opacity', opacity)
    }
  }, [mapRef, isStyleReady, styleRevision, features, notamData, layer])
}

export default useMoaActivation
