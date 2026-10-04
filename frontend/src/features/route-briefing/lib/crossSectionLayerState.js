// 버튼 묶음: 관련된 것끼리, 아래층→위층 순. [구름·착빙 ▾ · 등온선 ▾] | [바람 · 권계면·제트 · 난류] | [SIGMET/AIRMET]
// ▾ 버튼은 하위 항목을 고른다. 레이어 키(moisture·cloud·icing·temp·temperatureDetail …)는 그대로 둔다.
export const CROSS_SECTION_TOGGLE_GROUPS = [
  [{ id: 'cloudIcing', label: '구름·착빙', children: [['moisture', '구름층 추정'], ['cloud', '모델 구름량 윤곽'], ['icing', '착빙']], defaults: ['moisture', 'icing'] },
    { id: 'temp', label: '등온선', key: 'temp', options: [['temperatureDetail', '−10°C 추가']] }],
  [{ id: 'wind', label: '바람', key: 'wind' }, { id: 'tropopause', label: '권계면·제트', key: 'tropopause' }, { id: 'turbulence', label: '난류', key: 'turbulence' }],
  [{ id: 'advisories', label: 'SIGMET/AIRMET', key: 'advisories' }],
]

const OCCLUDING_LAYERS = ['moisture', 'icing', 'turbulence']

export function toggleCrossSectionLayer(state, key) {
  return { layers: { ...state.layers, [key]: !state.layers[key] }, restore: OCCLUDING_LAYERS.includes(key) ? null : state.restore }
}
export function showCrossSectionTurbulence(state) {
  if (state.restore) return state
  return { layers: { ...state.layers, moisture: false, icing: false, turbulence: true },
    restore: Object.fromEntries(OCCLUDING_LAYERS.map(key => [key, !!state.layers[key]])) }
}
export function restoreCrossSectionLayers(state) {
  return state.restore ? { layers: { ...state.layers, ...state.restore }, restore: null } : state
}
