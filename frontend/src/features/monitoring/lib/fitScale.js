// The floor exists only to bound the search, not to express a readable size. It has to stay low
// enough that a fitting scale always lies inside the range — the monitoring ops map panel is
// 593x234, where the shortest real bulletin needs ~0.36. Stopping above that returned a scale the
// document overflowed, which clipped the tail of the 위험 기상예보 section without any sign.
export const MIN_FIT_SCALE = 0.1
export const MAX_FIT_SCALE = 4

/**
 * Largest uniform scale at which the document still fits the panel.
 *
 * The document is always laid out at the full panel width, so the base width is `panelWidth /
 * scale`: a bigger scale means a narrower column, which wraps into a taller document. That makes
 * "does it fit vertically" monotonic in the scale, so a binary search finds the largest scale that
 * fits. Solving it analytically is not possible — only the browser knows how the text wraps around
 * the headings and the table.
 *
 * `measureHeightAtWidth(width)` must lay the content out at that CSS width and return its height.
 */
export function fitScale(measureHeightAtWidth, panelWidth, panelHeight, steps = 8) {
  if (!(panelWidth > 0) || !(panelHeight > 0)) return 1

  let lo = MIN_FIT_SCALE
  let hi = MAX_FIT_SCALE
  for (let i = 0; i < steps; i += 1) {
    const mid = (lo + hi) / 2
    const height = measureHeightAtWidth(panelWidth / mid)
    if (height * mid <= panelHeight) lo = mid
    else hi = mid
  }
  return lo
}
