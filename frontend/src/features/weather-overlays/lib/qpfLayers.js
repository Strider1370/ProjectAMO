import { syncRasterFrame } from './rasterFrameTransition.js'

export const QPF_SOURCE = 'kma-qpf-overlay'
export const QPF_LAYER = 'kma-qpf-overlay'

export function syncQpfLayer(map, model, { syncRaster = syncRasterFrame } = {}) {
  syncRaster(map, {
    sourceId: QPF_SOURCE,
    layerId: QPF_LAYER,
    frame: model?.qpfFrame,
    opacity: 0.82,
    visible: Boolean(model?.qpfFrame),
    transitionMs: 200,
  })
}
