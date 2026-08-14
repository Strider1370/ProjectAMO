// 파일이 정한 색을 그대로 쓴다. 우리가 색을 고르지 않는다 — 값이 없는 feature에만
// 기본값이 적용되도록 coalesce로 감싼다. JS로 feature를 순회하지 않으므로 도형이
// 수십만 개여도 스타일 적용 비용이 들지 않는다.
const DEFAULT_COLOR = '#3388ff'

export const LINE_PAINT = {
  'line-color': ['coalesce', ['get', 'stroke'], DEFAULT_COLOR],
  'line-width': ['coalesce', ['get', 'stroke-width'], 2],
  'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 1],
}

export const FILL_PAINT = {
  'fill-color': ['coalesce', ['get', 'fill'], DEFAULT_COLOR],
  'fill-opacity': ['coalesce', ['get', 'fill-opacity'], 0.3],
}

// 이 스파이크는 아이콘을 그리지 않는다(쓸 수 있는지만 확인). 점은 전부 원으로 표시.
// circle-radius의 coalesce는 반드시 * 안쪽에 둔다 — 바깥에 두면 Mapbox가 get을
// ['number', ...]로 감싸면서 속성 없는 feature에서 평가 오류를 낸다.
export const CIRCLE_PAINT = {
  'circle-color': ['coalesce', ['get', 'icon-color'], ['get', 'stroke'], DEFAULT_COLOR],
  'circle-radius': ['*', ['coalesce', ['get', 'icon-scale'], 1], 4],
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 1,
}

export const LABEL_LAYOUT = {
  'text-field': ['coalesce', ['get', 'name'], ''],
  // 파일의 label-scale을 존중하되 바닥을 둔다. 맥케이 파일의 IC·JC 이름은 0.7이라
  // 예전 기준(11px)으로 7.7px이었다 — 화면에서 읽을 수 없는 크기다.
  'text-size': ['max', ['*', ['coalesce', ['get', 'label-scale'], 1], 13], 11],
  'text-offset': [0, 1.1],
  'text-anchor': 'top',
  'text-allow-overlap': false,
}

// 글자색은 파일이 정한 대로 쓰되, 후광은 그 색이 읽히도록 우리가 고른다.
//
// 맥케이 파일은 IC·JC 이름 455개를 흰색으로 지정했다. 구글어스에서는 위성영상
// 위에 놓이니 맞는 선택이지만, 우리 기본 지도는 밝아서 흰 글자에 흰 후광이면
// 아무것도 안 보인다. 색을 바꾸지 않고 뒤에 깔리는 것만 반대로 둔다.
export function labelHaloFor(color) {
  if (typeof color !== 'string') return '#ffffff'
  let hex = color.trim().replace(/^#/, '')
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#ffffff'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  // 사람 눈이 느끼는 밝기 — 초록이 가장 밝게, 파랑이 가장 어둡게 보인다.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.5 ? '#1f2937' : '#ffffff'
}

export const LABEL_PAINT = {
  'text-color': ['coalesce', ['get', 'label-color'], '#111827'],
  // 후광 색은 호출부가 feature마다 심어준다(labelHaloFor). 없으면 흰색 —
  // 글자색 기본값이 어둡기 때문이다.
  'text-halo-color': ['coalesce', ['get', '__labelHalo'], '#ffffff'],
  'text-halo-width': 1.4,
}

// KML은 아이콘을 http:// 주소로 가리키는 일이 많다(구글 어스 기본 아이콘). https
// 페이지에서 http 이미지는 차단되므로 주소만 바꿔 시도한다. KMZ 안에 든 상대 경로는
// 이 스파이크 범위 밖이라 null을 돌려주고 호출부가 원으로 대체한다.
export function httpsIcon(url) {
  if (typeof url !== 'string') return null
  if (url.startsWith('https://')) return url
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`
  return null
}
