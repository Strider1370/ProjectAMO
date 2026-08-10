// 관리자 콘솔 그래프의 축 계산. 그리기(JSX)와 분리해 둔 이유는 두 가지다 —
// 이 저장소의 프런트 테스트는 node:test라 JSX를 파싱하지 못하고, 축 계산은 눈으로 보면
// 맞아 보여도 어긋나기 쉬운 부분이라 테스트가 필요하다.
//
// 규칙(목업 2026-08-10-admin-console-mockup.html): 축 없는 그래프를 만들지 않는다.
// y축 눈금 4~6개 + 옅은 가로선 + 단위 표기 + x축 라벨. 최댓값은 색이 아니라 숫자로도 적는다.

export const CHART_WIDTH = 640
export const PAD = { l: 44, r: 14, t: 20, b: 36 }

// 0부터 max까지 count개로 고르게 나눈 눈금. 눈금이 하나뿐인 축은 축이 아니라서 최소 둘을 보장한다.
export function axisTicks(max, count = 5) {
  const n = Math.max(2, Math.floor(count))
  return Array.from({ length: n }, (_, k) => Math.round((max * k) / (n - 1)))
}

// 그리기 좌표계. height만 화면마다 다르고 나머지는 고정이다.
export function plotGeometry(height, width = CHART_WIDTH) {
  const plotWidth = width - PAD.l - PAD.r
  const plotHeight = height - PAD.t - PAD.b
  return { width, height, plotWidth, plotHeight, left: PAD.l, top: PAD.t, right: width - PAD.r, bottom: PAD.t + plotHeight }
}

// 값 → y좌표. max가 0이면 나눗셈이 무너지므로 바닥으로 눕힌다(빈 그래프는 축만 남는다).
export function yScale(height, max) {
  const { plotHeight, top, bottom } = plotGeometry(height)
  return (value) => (max > 0 ? top + plotHeight * (1 - value / max) : bottom)
}

// 점 개수를 가로로 고르게 편다. 점이 하나면 왼쪽 끝에 둔다(0으로 나누지 않는다).
export function xPositions(count, width = CHART_WIDTH) {
  const { plotWidth, left } = plotGeometry(0, width)
  if (count <= 1) return count === 1 ? [left] : []
  return Array.from({ length: count }, (_, i) => left + (plotWidth * i) / (count - 1))
}

// 막대 묶음 한 칸의 폭과 계열별 x 오프셋.
export function barSlots(groupCount, seriesCount, width = CHART_WIDTH) {
  const { plotWidth, left } = plotGeometry(0, width)
  const slot = plotWidth / Math.max(1, groupCount)
  const barWidth = Math.max(1, (slot - 9) / Math.max(1, seriesCount))
  return { slot, barWidth, xOf: (groupIndex, seriesIndex) => left + groupIndex * slot + 4.5 + seriesIndex * barWidth }
}

// x축 라벨을 몇 개 건너뛸지. 라벨이 겹치면 안 읽히느니만 못하다.
export function labelStride(count, maxLabels = 8) {
  return Math.max(1, Math.ceil(count / maxLabels))
}

// 히트맵 색 단계. 0은 항상 가장 옅은 칸이고, 나머지를 최댓값 기준으로 나눈다.
export function heatLevel(value, max, steps) {
  if (!(value > 0)) return 0
  if (!(max > 0)) return 0
  return Math.min(steps - 1, 1 + Math.floor((value / max) * (steps - 2)))
}

export default { axisTicks, plotGeometry, yScale, xPositions, barSlots, labelStride, heatLevel, CHART_WIDTH, PAD }
