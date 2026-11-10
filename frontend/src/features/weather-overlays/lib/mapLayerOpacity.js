// 지도에 반투명하게 칠하는 레이어의 불투명도. 지도 레이어와 범례가 같은 값을 읽어,
// 범례 색이 지도에서 실제로 보이는 색(밝은 바탕 위)과 같게 한다.
export const MAP_LAYER_OPACITY = Object.freeze({
  radar: 0.88,
  hsr: 0.85,
  hci: 0.85,
  wissdom: 0.78,
  rainviewer: 0.7,
  ctps: 0.55,
  acim: 179 / 255,
  surfaceChartPrecip: 0.9,
  gktg: 185 / 255,
  tropopause: 150 / 255,
  visibility: 0.35,
})
