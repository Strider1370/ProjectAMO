import { addOrUpdateImageOverlay } from '../../map/imageOverlay.js'
import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const QPF_SOURCE = 'kma-qpf-overlay'
export const QPF_LAYER = 'kma-qpf-overlay'

export function syncQpfLayer(map, model) {
  const hasFrame = addOrUpdateImageOverlay(map, {
    sourceId: QPF_SOURCE,
    layerId: QPF_LAYER,
    frame: model?.qpfFrame,
    opacity: 0.82,
  })
  setMapLayerVisible(map, QPF_LAYER, hasFrame)
}
