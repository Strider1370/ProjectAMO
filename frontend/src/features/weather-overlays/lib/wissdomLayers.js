import { syncRasterFrame } from './rasterFrameTransition.js'

export const WISSDOM_SOURCE = 'kma-wissdom-overlay'
export const WISSDOM_LAYER = 'kma-wissdom-overlay'

export function syncWissdomLayer(map, model, { syncRaster = syncRasterFrame } = {}) {
  syncRaster(map, {
    sourceId: WISSDOM_SOURCE,
    layerId: WISSDOM_LAYER,
    frame: model?.wissdomFrame,
    opacity: 0.78,
    visible: Boolean(model?.wissdomFrame),
    transitionMs: 200,
  })
}
