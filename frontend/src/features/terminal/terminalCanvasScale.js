// 터미널은 1920px 폭 하나로 그려두고 결과 전체를 화면에 맞춰 확대·축소한다.
// 그래야 terminal.css의 px 값들이 어떤 해상도에서도 같은 크기로 보인다.
// 글자 크기를 화면 비율로 다시 쓰는 방법은 스타일시트의 px를 전부 손봐야 하지만,
// 결과를 통째로 늘리면 하나도 건드리지 않는다.
export const TERMINAL_CANVAS_WIDTH = 1920

/**
 * 화면 전체에 걸 배율. 폭만 본다.
 *
 * 터미널은 16:9 TV의 전체화면이라 뷰포트가 실제로 16:9다. 그래서 폭으로 정한 배율이
 * 높이도 정확히 맞고(1920 x 배율 = 폭, 1080 x 배율 = 높이), 위아래에 검은 띠가 생기지 않는다.
 * 노트북에서 미리 볼 때처럼 16:9가 아닌 창에서는 캔버스 높이를 `100vh / 배율`로 잡아
 * 폭을 잃지 않고 창을 끝까지 채운다(terminal.css 참고).
 *
 * 모니터링(features/monitoring/lib/canvasScale.js)에는 1200px 아래에서 배율을 끄는 하한이 있다.
 * 그 아래에서는 반응형 규칙이 대신 화면을 다시 짜기 때문이다. 터미널에는 그런 규칙이 없고
 * 스펙 2.2가 1920x1080 고정·세로형 미지원이라, 하한을 두면 좁은 화면에서 그냥 잘리기만 한다.
 */
export function terminalCanvasScale(viewportWidth) {
  if (!(viewportWidth > 0)) return 1
  return viewportWidth / TERMINAL_CANVAS_WIDTH
}
