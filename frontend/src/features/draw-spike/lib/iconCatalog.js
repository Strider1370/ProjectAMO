// 구글어스 기본 아이콘 목록. 주소 체계는 구글이 공개한 것을 그대로 쓴다.
//
// 앞선 스파이크에서 맥케이 파일의 아이콘 37종이 https로 전부 불러와짐을 확인했다.
// 그래서 우리가 그림을 보유하지 않는다 — 내보낸 KML을 구글어스에서 열었을 때도
// 같은 아이콘이 나온다는 것이 이 선택의 값어치다.
//
// 파일이 적는 주소는 http라 우리 https 페이지에서 막힌다. 목록은 처음부터
// https로 적는다.
const BASE = 'https://maps.google.com/mapfiles/kml'

const pushpin = (id, label) => ({ id: `pushpin/${id}-pushpin`, url: `${BASE}/pushpin/${id}-pushpin.png`, label, group: '압정' })
const paddle = (id, label) => ({ id: `paddle/${id}`, url: `${BASE}/paddle/${id}.png`, label, group: '판' })
const shape = (id, label) => ({ id: `shapes/${id}`, url: `${BASE}/shapes/${id}.png`, label, group: '기호' })

// 압정 8색 — 맥케이 파일이 가장 많이 쓴 것이 노랑 압정(174개)이라 맨 앞에 둔다.
const PUSHPINS = [
  pushpin('ylw', '노랑 압정'), pushpin('blue', '파랑 압정'), pushpin('red', '빨강 압정'),
  pushpin('grn', '초록 압정'), pushpin('ltblu', '하늘 압정'), pushpin('purple', '보라 압정'),
  pushpin('pink', '분홍 압정'), pushpin('wht', '흰 압정'),
]

// 알파벳 판 A~Z. 활주로·보고지점을 글자로 구분할 때 쓴다.
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch) => paddle(ch, `${ch} 판`))

// 숫자 판 1~10.
const NUMBERS = Array.from({ length: 10 }, (_, i) => paddle(String(i + 1), `${i + 1} 판`))

// 도형 판 — 색을 덧입혀 쓰는 흰 바탕들. 맥케이 파일이 흰 원 하나에 32색을 입혀 썼다.
const BLANKS = [
  paddle('wht-circle', '흰 원'), paddle('wht-blank', '흰 사각'),
  paddle('wht-diamond', '흰 마름모'), paddle('wht-stars', '흰 별'),
  paddle('red-circle', '빨강 원'), paddle('grn-circle', '초록 원'),
  paddle('blu-circle', '파랑 원'), paddle('ylw-circle', '노랑 원'),
  paddle('go', '출발'), paddle('pause', '멈춤'), paddle('stop', '정지'),
]

// 그림 기호 — 비행 중에 눈으로 찾는 것들 위주로 골랐다.
const SHAPES = [
  shape('airports', '공항'), shape('heliport', '헬기장'), shape('target', '과녁'),
  shape('triangle', '삼각형'), shape('star', '별'), shape('flag', '깃발'),
  shape('placemark_circle', '원'), shape('placemark_square', '사각'),
  shape('caution', '주의'), shape('forbidden', '금지'), shape('info-i', '정보'),
  shape('mountains', '산'), shape('water', '물'), shape('marina', '항구'),
  shape('parks', '공원'), shape('campground', '야영장'), shape('rail', '철도'),
  shape('ferry', '나루'), shape('gas_stations', '주유소'), shape('hospitals', '병원'),
  shape('police', '경찰'), shape('church', '교회'), shape('schools', '학교'),
  shape('golf', '골프장'), shape('sailing', '요트'), shape('ranger_station', '관리소'),
  shape('parking_lot', '주차장'), shape('phone', '전화'), shape('poi', '관심지점'),
  shape('donut', '고리'), shape('arrow', '화살표'), shape('cross-hairs', '십자'),
]

export const ICONS = [...PUSHPINS, ...BLANKS, ...LETTERS, ...NUMBERS, ...SHAPES]

export const ICON_GROUPS = ['압정', '판', '기호']

export const DEFAULT_ICON = ICONS[0].id

/** id로 아이콘 하나. 없는 id는 기본값으로 떨어진다 — 목록이 바뀌어도 빈 화면이 되지 않는다. */
export function iconById(id) {
  return ICONS.find((i) => i.id === id) ?? ICONS[0]
}

/**
 * 이름으로 걸러낸다. 빈 문자열이면 전부.
 * 한글 이름과 영문 id를 둘 다 본다 — `airports`로도 `공항`으로도 찾아진다.
 */
export function filterIcons(query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return ICONS
  return ICONS.filter((i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q))
}
