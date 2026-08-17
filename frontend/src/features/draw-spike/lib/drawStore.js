// 그린 것을 브라우저에 보관한다. Earth Web·Felt처럼 자동 저장 — 저장 단추가 없다.
//
// my-map은 올린 원본 파일이 15MB까지 가서 IndexedDB를 썼다. 여기는 사람이 손으로
// 그린 도형이라 규모가 다르다(맥케이 파일 전체가 2,135개인데 그건 몇 년치다).
// localStorage로 충분하고, 훨씬 단순하다.
//
// ponytail: localStorage는 대략 5MB다. 도형 하나가 좌표 몇 개짜리 JSON이라
// 수천 개까지 여유가 있지만, 자유곡선으로 좌표를 22만 개 찍으면 넘친다.
// 넘치는 것이 실제로 확인되면 my-map처럼 IndexedDB로 옮긴다.
const KEY = 'projectamo.draw-spike.v1'

function storage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // 사생활 보호 모드나 저장소 차단 환경. 보관만 못 할 뿐 그리기는 되어야 한다.
    return null
  }
}

/** 저장. 실패해도 예외를 밖으로 내지 않는다 — 보관 실패가 그리기 실패가 되면 안 된다. */
export function saveDraw(state) {
  const s = storage()
  if (!s) return false
  try {
    s.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/** 읽기. 없거나 깨졌으면 null — 부르는 쪽은 빈 지도로 시작하면 된다. */
export function loadDraw() {
  const s = storage()
  if (!s) return null
  try {
    const raw = s.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // 모양이 어긋난 값이 화면을 죽이지 않게 여기서 막는다.
    if (!parsed || !Array.isArray(parsed.features)) return null
    return { features: parsed.features, folders: Array.isArray(parsed.folders) ? parsed.folders : [] }
  } catch {
    return null
  }
}

export function clearDraw() {
  const s = storage()
  if (!s) return
  try { s.removeItem(KEY) } catch { /* 지우기 실패는 조용히 넘긴다 */ }
}
