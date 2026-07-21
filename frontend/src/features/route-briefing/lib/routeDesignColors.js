// 경로 설계안(기본/대안) 고유색 — 지도와 패널이 같은 함수를 써서 항상 일치시킨다.
// SID(#2563eb)·STAR(#7c3aed)·IAP(#0ea5e9)와 겹치지 않는 색만 쓴다(routePreview.js
// PROC_SID_LINE/PROC_STAR_LINE/PROC_IAP_LINE paint 참고) — 원래 A/B가 SID/STAR와
// 정확히 같은 색이라 지도에서 구분이 안 됐다.
export const BASE_ROUTE_COLOR = '#f97316'
export const ALT_ROUTE_COLORS = ['#db2777', '#16a34a', '#0d9488']
export const UNSELECTED_ROUTE_COLOR = '#475569'

export function routeDesignColor(design, allDesigns = []) {
  if (!design || design.kind === 'base' || design.id === 'base') return BASE_ROUTE_COLOR
  const altIndex = allDesigns.filter((d) => d.kind === 'alternative').findIndex((d) => d.id === design.id)
  if (altIndex < 0) return ALT_ROUTE_COLORS[ALT_ROUTE_COLORS.length - 1]
  return ALT_ROUTE_COLORS[altIndex] ?? ALT_ROUTE_COLORS[ALT_ROUTE_COLORS.length - 1]
}
