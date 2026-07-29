// Monitoring is laid out at one fixed width and the whole rendered page is then scaled to the
// viewport, so a pixel size in legacy/App.css keeps the same apparent size on any resolution.
// Rescaling by root font size instead would have to touch every one of the ~1300 px literals in that
// stylesheet; scaling the result leaves it untouched.
export const CANVAS_WIDTH = 1920

// Under 1200px the responsive rules in legacy/App.css (<=1199px) rearrange the dashboard into one
// column. A fixed 1920px canvas would hide the real viewport width from them, so narrow windows keep
// the existing responsive layout and no scaling at all.
export const CANVAS_MIN_VIEWPORT_WIDTH = 1200

/**
 * Uniform scale for the canvas, or null when the fixed canvas is off.
 *
 * Width alone drives the scale. Fitting both axes would have to letterbox whenever the viewport is
 * not exactly 16:9 — and a maximised browser window never is, because the tab strip and address bar
 * take ~180px of height. The canvas is instead as tall as the viewport divided by this scale (see
 * MonitoringPage.css), so it always fills the window edge to edge.
 */
export function canvasScale(viewportWidth) {
  if (!(viewportWidth >= CANVAS_MIN_VIEWPORT_WIDTH)) return null
  return viewportWidth / CANVAS_WIDTH
}
