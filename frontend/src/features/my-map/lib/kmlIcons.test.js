import test from 'node:test'
import assert from 'node:assert/strict'
import { iconIdFor, collectIconUrls } from './kmlIcons.js'

const feat = (icon) => ({ type: 'Feature', properties: icon ? { icon } : {}, geometry: { type: 'Point', coordinates: [127, 37] } })
const layer = (id, ...features) => ({ id, name: id, depth: 0, parentId: null, features })

test('같은 주소는 늘 같은 id를 준다', () => {
  const a = iconIdFor('https://maps.google.com/mapfiles/kml/paddle/red-circle.png')
  const b = iconIdFor('https://maps.google.com/mapfiles/kml/paddle/red-circle.png')
  assert.equal(a, b)
})

test('다른 주소는 다른 id를 준다', () => {
  assert.notEqual(
    iconIdFor('https://maps.google.com/mapfiles/kml/paddle/red-circle.png'),
    iconIdFor('https://maps.google.com/mapfiles/kml/paddle/blu-circle.png'),
  )
})

test('id는 지도가 받아들이는 글자만 쓴다', () => {
  // 주소에는 슬래시·물음표·한글이 섞일 수 있다. 그대로 id로 쓰면 안 된다.
  const id = iconIdFor('https://예시.kr/아이콘 모음/a b?c=1&d=2.png')
  assert.match(id, /^my-map-icon-[a-z0-9]+$/)
})

test('http 주소는 https로 바꿔 모은다', () => {
  const out = collectIconUrls([layer('f0', feat('http://maps.google.com/mapfiles/kml/paddle/A.png'))])
  assert.equal(out.length, 1)
  assert.equal(out[0].url, 'https://maps.google.com/mapfiles/kml/paddle/A.png')
})

test('같은 주소가 여러 번 나와도 한 번만 모은다', () => {
  const url = 'https://maps.google.com/mapfiles/kml/paddle/A.png'
  const out = collectIconUrls([layer('f0', feat(url), feat(url)), layer('f1', feat(url))])
  assert.equal(out.length, 1)
})

test('압축 안 상대경로는 쓸 수 없으므로 빼고 모은다', () => {
  // 맥케이 파일의 files/dme1.bmp가 이렇다 — 게다가 그 그림은 압축에 들어 있지도 않다.
  const out = collectIconUrls([layer('f0', feat('files/dme1.bmp'), feat(undefined))])
  assert.deepEqual(out, [])
})

test('id가 주소와 짝이 맞는다', () => {
  const url = 'https://maps.google.com/mapfiles/kml/paddle/A.png'
  const out = collectIconUrls([layer('f0', feat(url))])
  assert.equal(out[0].id, iconIdFor(url))
})
