// 소개 페이지 스크롤 연출용 계산. 화면을 고정한 구간의 진행률(0~1)과 그 안의 소구간 진행률을 낸다.

export const clamp01 = (value) => Math.min(1, Math.max(0, value))
export const lerp = (from, to, t) => from + (to - from) * t
export const easeOut = (t) => 1 - (1 - t) ** 3
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

// 전체 진행률 progress 중 [start, end] 구간이 얼마나 진행됐는지.
export function segment(progress, start, end) {
  if (end <= start) return progress >= end ? 1 : 0
  return clamp01((progress - start) / (end - start))
}

// 고정 구간(높이 sectionHeight)이 화면(viewportHeight)에 붙어 있는 동안의 진행률.
export function pinnedProgress(scrollTop, sectionTop, sectionHeight, viewportHeight) {
  const range = sectionHeight - viewportHeight
  if (range <= 0) return scrollTop >= sectionTop ? 1 : 0
  return clamp01((scrollTop - sectionTop) / range)
}

// 오름차순 경계값 중 몇 개를 지났는지(단계 번호).
export function stepIndex(progress, thresholds) {
  let index = 0
  while (index < thresholds.length && progress >= thresholds[index]) index += 1
  return index
}

// 목표값을 향해 매 프레임 일정 비율로 다가간다. 스크롤을 따라가되 끊기지 않게 한다.
export function approach(current, target, rate = 0.18, epsilon = 0.0005) {
  const next = current + (target - current) * rate
  return Math.abs(target - next) < epsilon ? target : next
}
