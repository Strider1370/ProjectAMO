// 태풍 색은 목록 순서가 아니라 태풍번호로 정한다.
// 순서 기준이면 태풍 하나가 소멸했을 때 남은 태풍의 색이 바뀌어 사용자가 헷갈린다.
// 색은 유일한 구분 수단이 아니다 — 지도 라벨과 패널에 태풍번호가 함께 표시된다.
// design-language의 색만 쓴다. #2563eb/#1d4ed8/#1e40af는 금지색이다
// (frontend/scripts/lint-colors.mjs:32 — "forbidden MS blue").
export const TYPHOON_PALETTE = [
  '#dc2626', // red
  '#0891b2', // cyan
  '#d97706', // amber
  '#7c3aed', // violet
  '#65a30d', // lime
  '#be185d', // pink
]

export function assignTyphoonColors(numbers = []) {
  const assigned = {}
  const taken = new Set()
  for (const number of [...numbers].sort((a, b) => a - b)) {
    const start = ((number % TYPHOON_PALETTE.length) + TYPHOON_PALETTE.length) % TYPHOON_PALETTE.length
    let index = start
    // 이미 쓰인 색이면 다음 빈 색으로 민다. 한 바퀴 다 찼으면 원래 색을 그대로 쓴다.
    for (let step = 0; step < TYPHOON_PALETTE.length; step++) {
      const candidate = (start + step) % TYPHOON_PALETTE.length
      if (!taken.has(candidate)) { index = candidate; break }
    }
    taken.add(index)
    assigned[number] = TYPHOON_PALETTE[index]
  }
  return assigned
}

export default { TYPHOON_PALETTE, assignTyphoonColors }
