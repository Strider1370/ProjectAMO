// 일기도 3시간 강수 범례. 색 단계는 강수 그림을 만드는 백엔드와 같은 표를 쓴다.
import { KIM_SURFACE_CHART_PRECIP_RAMP } from '../../../../../shared/kim-surface-chart.js'

// 범례 칸이 너무 촘촘하지 않도록 숫자가 확정된 단계와 시작값만 라벨을 단다.
const LABELED_MM = new Set([0.5, 3, 10, 20, 30, 40, 60, 80])

export const PRECIP_3H_LEGEND = Object.freeze(KIM_SURFACE_CHART_PRECIP_RAMP.map(([mm, [r, g, b]]) => Object.freeze({
  label: LABELED_MM.has(mm) ? String(mm) : '',
  color: `rgb(${r}, ${g}, ${b})`,
})))

export const SURFACE_CHART_LEGEND_NOTE = '등압선 2 hPa 간격(굵은 선 4 hPa) · 3시간 누적'
