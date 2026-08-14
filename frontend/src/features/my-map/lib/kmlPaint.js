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
  'text-size': ['*', ['coalesce', ['get', 'label-scale'], 1], 11],
  'text-offset': [0, 1.1],
  'text-anchor': 'top',
  'text-allow-overlap': false,
}

export const LABEL_PAINT = {
  'text-color': ['coalesce', ['get', 'label-color'], '#111827'],
  'text-halo-color': '#ffffff',
  'text-halo-width': 1.2,
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
