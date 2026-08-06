import { addOrUpdateImageOverlay } from '../../map/imageOverlay.js'
import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

// ponytail: 기상청이 그려주는 합성영상을 임시로 붙여 우리 렌더링과 비교한다.
//   hsr — 강수강도(mm/h). 우리가 직접 그리는 레이더와 같은 물리량이라 나란히 놓고 볼 수 있다.
//   hci — 수상체(비/눈/우박 등). 우리에게 없는 정보라 이쪽이 실제로 쓸모가 있는지 보려는 것.
// 쓸지 결정되면 하나로 정리하거나 되돌린다.
export const HSR_SOURCE = 'kma-hsr-overlay'
export const HSR_LAYER = 'kma-hsr-overlay'
export const HCI_SOURCE = 'kma-hci-overlay'
export const HCI_LAYER = 'kma-hci-overlay'

// 선택 시각에 가장 가까운 과거 프레임. 없으면 최신.
export function pickCompositeFrame(meta, selectedMs) {
  const frames = Array.isArray(meta?.frames) ? meta.frames.filter((f) => Number.isFinite(f?.timeMs)) : []
  if (!frames.length) return null
  if (!Number.isFinite(selectedMs)) return frames.at(-1)
  const past = frames.filter((f) => f.timeMs <= selectedMs)
  return past.length ? past.at(-1) : frames[0]
}

export function syncKmaCompositeLayers(map, { hsrMeta, hciMeta, selectedMs, visibility = {} }) {
  const hsrFrame = visibility.radarHsr ? pickCompositeFrame(hsrMeta, selectedMs) : null
  const hciFrame = visibility.radarHci ? pickCompositeFrame(hciMeta, selectedMs) : null
  setMapLayerVisible(map, HSR_LAYER, addOrUpdateImageOverlay(map, {
    sourceId: HSR_SOURCE, layerId: HSR_LAYER, frame: hsrFrame, opacity: 0.85,
  }))
  setMapLayerVisible(map, HCI_LAYER, addOrUpdateImageOverlay(map, {
    sourceId: HCI_SOURCE, layerId: HCI_LAYER, frame: hciFrame, opacity: 0.85,
  }))
}
