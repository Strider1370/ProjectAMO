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
