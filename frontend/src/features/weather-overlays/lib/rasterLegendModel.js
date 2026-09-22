import { RADAR_RAINRATE_LEGEND } from './weatherOverlayLayers.js'

export const HSR_LEGEND = Object.freeze([...RADAR_RAINRATE_LEGEND].reverse())

// KMA HCI 세로 범례(hci_*_legend.webp)의 확인된 분류색이다. 눈비와 무자료 흰색은
// 항공 기상 패널의 다섯 개 표시 분류에 포함하지 않는다.
export const HCI_LEGEND = Object.freeze([
  { label: '우박', color: 'rgb(255, 51, 0)' },
  { label: '비', color: 'rgb(51, 102, 255)' },
  { label: '눈', color: 'rgb(255, 102, 255)' },
  { label: '빙정', color: 'rgb(245, 255, 102)' },
  { label: '비강수없음', color: 'rgb(210, 210, 210)' },
])

export function buildRasterLegendModel({ visibility = {}, hsrFrame, hciFrame, wissdomFrame } = {}) {
  const hsrVisible = Boolean(visibility.radarHsr && hsrFrame)
  return {
    hsrVisible,
    hciVisible: Boolean(visibility.radarHci && hciFrame),
    wissdomVisible: Boolean(hsrVisible && wissdomFrame),
  }
}

// MAPLE 초단기 강수예측(QPF) 강수강도 범례(mm/h). 색은 기상청이 보내는 세로 범례 그림
// (qpf_*_legend.webp, 2026-09 기준 모든 선행시간 동일)에서 띠별 픽셀을 읽은 값이다. 레이더
// 강수강도 범례와 눈금은 같지만 색이 다르다(예: 5 mm/h가 레이더는 초록, QPF는 노랑).
// 라벨은 각 띠의 하한이고, 맨 아래 흰 띠(강수 없음)는 뺐다. 기상청이 범례를 바꾸면 그림을 다시 읽는다.
export const QPF_LEGEND = Object.freeze([
  ['0.0', '0, 200, 255'], ['0.1', '0, 155, 245'], ['0.5', '0, 74, 245'],
  ['1.0', '0, 255, 0'], ['2.0', '0, 190, 0'], ['3.0', '0, 140, 0'], ['4.0', '0, 90, 0'],
  ['5', '255, 255, 0'], ['6', '255, 220, 31'], ['7', '249, 205, 0'], ['8', '224, 185, 0'], ['9', '204, 170, 0'],
  ['10', '255, 102, 0'], ['15', '255, 50, 0'], ['20', '210, 0, 0'], ['25', '180, 0, 0'],
  ['30', '224, 169, 255'], ['40', '201, 105, 255'], ['50', '179, 41, 255'], ['60', '147, 0, 228'],
  ['70', '179, 180, 222'], ['90', '76, 78, 177'], ['110', '0, 3, 144'], ['150', '51, 51, 51'],
].map(([label, rgb]) => Object.freeze({ label, color: `rgb(${rgb})` })))
