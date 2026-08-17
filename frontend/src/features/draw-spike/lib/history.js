// 되돌리기·다시하기. 순수 — 상태 덩어리를 통째로 쌓는다.
//
// mapbox-gl-draw에는 되돌리기가 없다. 구글어스 Pro에도 없어서 오른클릭으로
// 마지막 점을 지우는 것이 전부였다. Felt·CalTopo는 ⌘Z를 쓴다 — 그쪽을 베낀다.
//
// ponytail: 도형 목록 전체를 매번 복사해 쌓는다. 손으로 그리는 규모(수백 개)에서는
// 차이가 안 나고, 되돌리기가 어긋날 여지가 없다. 좌표가 수만 개로 늘면 그때
// 바뀐 도형만 쌓는 방식으로 바꾼다.
const LIMIT = 50

export function emptyHistory() {
  return { past: [], future: [] }
}

/**
 * 새 상태를 쌓는다. 새로 하면 다시하기 줄은 버린다 — 갈라진 미래는 되살릴 수 없다.
 *
 * `coalesce`면 맨 위를 갈아치운다. 이름을 타이핑하면 글자마다 상태가 바뀌는데,
 * 그때마다 한 칸씩 쌓으면 50칸이 글자 50개로 차버려 되돌리기가 쓸모없어진다.
 * 속성 수정은 한 칸으로 뭉치고, 도형을 새로 그리거나 지울 때만 칸을 늘린다.
 */
export function push(history, snapshot, { coalesce = false } = {}) {
  const past = coalesce && history.past.length > 1
    ? [...history.past.slice(0, -1), snapshot]
    : [...history.past, snapshot]
  return { past: past.slice(-LIMIT), future: [] }
}

export function canUndo(history) {
  // 마지막 하나는 "지금"이므로 되돌릴 것이 있으려면 둘 이상이어야 한다.
  return history.past.length > 1
}

export function canRedo(history) {
  return history.future.length > 0
}

/** 한 걸음 뒤로. 되돌릴 것이 없으면 그대로 돌려준다. */
export function undo(history) {
  if (!canUndo(history)) return { history, snapshot: null }
  const past = [...history.past]
  const current = past.pop()
  return { history: { past, future: [current, ...history.future] }, snapshot: past[past.length - 1] }
}

/** 한 걸음 앞으로. */
export function redo(history) {
  if (!canRedo(history)) return { history, snapshot: null }
  const [next, ...future] = history.future
  return { history: { past: [...history.past, next], future }, snapshot: next }
}
