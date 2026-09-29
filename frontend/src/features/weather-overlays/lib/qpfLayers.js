import { syncRasterFrame } from './rasterFrameTransition.js'

// QPF(초단기 강수예측)는 쓰지 않아 수집과 표시를 기본으로 끈다. VITE_QPF_ENABLED=1일 때만 지도에 올린다.
export const QPF_ENABLED = import.meta.env?.VITE_QPF_ENABLED === '1'

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
