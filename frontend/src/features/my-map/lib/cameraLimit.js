// 고도를 과장하면 기둥이 높아진다. 그 상태로 가까이 가면 카메라가 기둥 안에
// 들어가 화면이 온통 반투명 청록이 된다 — 표시가 깨진 게 아니라 덩어리 안에
// 있는 것이다. 배수마다 "이 이상 가까이 가면 갇힌다"는 선을 둔다.
//
// 값은 스파이크 실측에서 나왔다. 10배로 켜고 zoom 10.5에서는 화면의 83.7%가
// 덮여 갇혔고, zoom 8.5에서는 55.7%로 층 구조가 잘 보였다.
//
// ponytail: 눈으로 맞춘 표다. 화면 비율이나 기울기 기본값이 바뀌면 다시 재야 한다.
// 계산식으로 유도한 값이 아니므로 새 배수를 더할 때도 실제로 보고 넣는다.
const LIMITS = [
  { x: 1, maxZoom: 16 },   // 지도 기본 한계 (MAP_CONFIG.maxZoom)
  { x: 3, maxZoom: 11 },
  { x: 5, maxZoom: 10 },
  { x: 10, maxZoom: 8.5 },
  { x: 20, maxZoom: 8 },
]

export const EXAGGERATION_STEPS = LIMITS.map((l) => l.x)

export function maxZoomFor(exaggeration) {
  const x = Number(exaggeration)
  if (!Number.isFinite(x) || x <= 1) return LIMITS[0].maxZoom
  let found = LIMITS[0]
  for (const limit of LIMITS) {
    if (x >= limit.x) found = limit
  }
  return found.maxZoom
}
