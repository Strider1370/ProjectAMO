import { httpsIcon } from './kmlPaint.js'

// 파일이 가리키는 아이콘 주소를 모아 지도에 올릴 준비를 한다.
//
// 스파이크에서 37종 전부 등록에 성공했다(549ms). 주소는 대부분 구글 어스 기본
// 아이콘이라 http로 적혀 있고, https 페이지에서는 차단되므로 httpsIcon이 주소만
// 바꾼다. 압축 안 상대경로는 쓸 수 없어 null이 되고, 그런 지점은 원으로 남는다.

// 주소를 그대로 id로 쓸 수 없다 — 슬래시·물음표·한글이 섞인다. 짧고 안전한
// 글자로 접는다. 충돌은 서로 다른 주소가 같은 값으로 접힐 때만 생기는데, 한 파일이
// 쓰는 아이콘은 수십 종이라 실질적으로 일어나지 않는다.
export function iconIdFor(url) {
  let hash = 0x811c9dc5
  const text = String(url)
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `my-map-icon-${hash.toString(36)}${text.length.toString(36)}`
}

export function collectIconUrls(list) {
  const byUrl = new Map()
  for (const layer of list ?? []) {
    for (const f of layer.features ?? []) {
      const url = httpsIcon(f.properties?.icon)
      if (url && !byUrl.has(url)) byUrl.set(url, { url, id: iconIdFor(url) })
    }
  }
  return [...byUrl.values()]
}
