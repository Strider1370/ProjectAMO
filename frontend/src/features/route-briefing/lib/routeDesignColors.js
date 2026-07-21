// 경로 설계안(기본/대안) 고유색 — 지도와 패널이 같은 함수를 써서 항상 일치시킨다.
export const BASE_ROUTE_COLOR = '#f97316'
export const ALT_ROUTE_COLORS = ['#2563eb', '#7c3aed', '#0d9488']
export const UNSELECTED_ROUTE_COLOR = '#475569'

export function routeDesignColor(design, allDesigns = []) {
  if (!design || design.kind === 'base' || design.id === 'base') return BASE_ROUTE_COLOR
  const altIndex = allDesigns.filter((d) => d.kind === 'alternative').findIndex((d) => d.id === design.id)
  if (altIndex < 0) return ALT_ROUTE_COLORS[ALT_ROUTE_COLORS.length - 1]
  return ALT_ROUTE_COLORS[altIndex] ?? ALT_ROUTE_COLORS[ALT_ROUTE_COLORS.length - 1]
}
