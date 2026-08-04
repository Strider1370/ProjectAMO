import { addOrUpdateImageOverlay } from '../../map/imageOverlay.js'
import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const WISSDOM_SOURCE = 'kma-wissdom-overlay'
export const WISSDOM_LAYER = 'kma-wissdom-overlay'

export function syncWissdomLayer(map, model) {
  const hasFrame = addOrUpdateImageOverlay(map, {
    sourceId: WISSDOM_SOURCE,
    layerId: WISSDOM_LAYER,
    frame: model?.wissdomFrame,
    opacity: 0.78,
  })
  setMapLayerVisible(map, WISSDOM_LAYER, hasFrame)
}
