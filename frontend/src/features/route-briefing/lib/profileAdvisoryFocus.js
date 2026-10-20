// 연직단면도 SIGMET·AIRMET 상자 가리키기: 상자들이 겹치면 구분이 어려워, 가리킨 발표의 상자(같은 발표가
// 경로를 여러 번 지나면 전부)를 강조하고 나머지를 흐리게 한다. 지도 면·위험 막대 틀과 발표 id로 잇는다.

// (x, y)를 품은 상자 중 가장 작은 것의 발표 id. 큰 상자 안에 작은 상자가 있어도 작은 쪽을 고를 수 있다.
export function advisoryIdAt(bands, x, y) {
  let best = null
  for (const band of bands) {
    if (!band.advisoryId || x < band.x || x > band.x + band.w || y < band.y || y > band.y + band.h) continue
    if (!best || band.w * band.h < best.w * best.h) best = band
  }
  return best?.advisoryId ?? null
}

// 상자 표시 상태: 가리킨 발표면 'focus', 다른 발표가 가리켜져 있으면 'dim', 아무것도 없으면 null.
export function advisoryBandState(band, focusId) {
  if (!focusId) return null
  return band.advisoryId === focusId ? 'focus' : 'dim'
}
