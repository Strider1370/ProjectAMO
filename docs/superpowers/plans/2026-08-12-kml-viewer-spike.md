# 이용자 KML/KMZ 표출 가능성 확인 스파이크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이용자가 올린 KML/KMZ를 개발 전용 페이지의 Mapbox 지도에 파일에 적힌 스타일 그대로 그리고, 표시 충실도와 성능 한계를 숫자로 측정한다.

**Architecture:** 순수 모듈 셋(압축 해제 / 폴더 트리 / 페인트 규칙)을 먼저 만들어 단위 시험으로 굳히고, 페이지는 그것을 지도에 배선하는 얇은 층으로 둔다. 폴더 하나가 GeoJSON 소스 하나가 되고, 스타일은 JS로 feature를 순회하지 않고 **Mapbox 표현식이 feature 속성을 직접 읽는 방식**으로 적용한다.

**Tech Stack:** React, Mapbox GL JS 3.23.1, `@tmcw/togeojson` 7.1.2 (`kmlWithFolders`), 브라우저 내장 `DecompressionStream`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-12-kml-viewer-spike-design.md`

**Policies:** [정책 색인](../../policies/index.md) → [recurring entry sequences](../../policies/engineering/entry-sequences.md) (Standalone route: 기능은 `frontend/src/features/` 아래, `App.jsx`에서 셸 앞에 분기), [map and layers](../../policies/engineering/map-and-layers.md).

## Global Constraints

- Linux 전용. `npm`/`node`/`git`은 Linux 셸에서만 실행한다.
- 사용자 노출 문구는 한국어. 비ASCII 편집 전 [encoding safety](../../policies/encoding-safety.md)를 읽는다.
- **새 의존성을 추가하지 않는다.** 압축 해제는 브라우저 내장 `DecompressionStream('deflate-raw')`으로 직접 짠다.
- 페이지는 **개발 빌드에서만** 열린다: `import.meta.env.DEV` 가드. 운영 빌드에서 코드가 제거되어야 한다.
- **기존 화면을 건드리지 않는다.** `App.jsx`의 라우트 한 줄 외에는 `frontend/src/features/kml-viewer/` 밖을 수정하지 않는다.
- 스타일은 파일이 정한 값을 쓴다. 값이 없을 때만 기본값을 쓴다.
- 고도값은 무시하고 평면으로 그리되 **어떤 도형도 숨기지 않는다**.
- 파일 크기 제한을 두지 않는다.
- 각 태스크는 `cd frontend && node --test <파일>`이 통과한 뒤에만 커밋한다. 전체는 `npm test`.

## File Structure

| 파일 | 책임 |
| --- | --- |
| `frontend/src/features/kml-viewer/lib/kmzUnzip.js` (신규) | zip 바이트 → `doc.kml` 문자열. 순수·비동기, DOM 의존 없음. |
| `frontend/src/features/kml-viewer/lib/kmlFolderTree.js` (신규) | `kmlWithFolders` 트리 → 평평한 레이어 목록. 순수. |
| `frontend/src/features/kml-viewer/lib/kmlPaint.js` (신규) | KML 속성명을 읽는 Mapbox 페인트/레이아웃 표현식 상수. 순수. |
| `frontend/src/features/kml-viewer/useKmlMap.js` (신규) | 지도 초기화, 소스·레이어 추가/제거, 표시 토글. |
| `frontend/src/features/kml-viewer/KmlViewerPage.jsx` (신규) | 페이지 셸 — 파일 입력, 폴더 패널, 측정값, 지도 컨테이너. |
| `frontend/src/features/kml-viewer/KmlViewerPage.css` (신규) | 2단 레이아웃. |
| `frontend/src/app/App.jsx` (수정) | `/kml` 라우트 한 줄. |
| `frontend/test/fixtures/kml-viewer/tiny.kmz` (신규) | 단위 시험용 최소 zip. |

순수 모듈 셋을 분리하는 이유: 이 스파이크의 결론은 브라우저에서 눈으로 봐야 나오지만, **압축 해제·트리 변환·스타일 대응은 눈으로 봐서는 맞는지 알 수 없다.** 순수 함수로 빼면 단위 시험으로 굳히고, 페이지에서는 배선만 확인하면 된다.

---

### Task 1: KMZ 압축 해제

**Files:**
- Create: `frontend/src/features/kml-viewer/lib/kmzUnzip.js`
- Create: `frontend/test/fixtures/kml-viewer/tiny.kmz`
- Test: `frontend/src/features/kml-viewer/lib/kmzUnzip.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `readKmlFromBuffer(arrayBuffer, fileName)` → `Promise<string>`. `.kml` 파일이면 텍스트로 바로 디코드하고, 그 외에는 zip으로 보고 첫 번째 `.kml` 항목(`doc.kml`이 있으면 그것)을 꺼내 문자열로 돌려준다. 실패 시 사람이 읽을 수 있는 한국어 메시지로 `Error`를 던진다.

- [ ] **Step 1: 시험용 최소 zip 만들기**

Node의 `zlib`로 손수 zip 하나를 만든다. 이 명령을 그대로 실행한다:

```bash
cd /home/john_doe/ProjectAMO/frontend && mkdir -p test/fixtures/kml-viewer && node -e '
const { deflateRawSync, crc32 } = require("node:zlib")
const fs = require("node:fs")
const name = Buffer.from("doc.kml")
const body = Buffer.from("<?xml version=\"1.0\"?><kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><name>tiny</name></Document></kml>", "utf8")
const comp = deflateRawSync(body)
const crc = crc32(body)
const loc = Buffer.alloc(30)
loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8)
loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(body.length, 22)
loc.writeUInt16LE(name.length, 26)
const cen = Buffer.alloc(46)
cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10)
cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(body.length, 24)
cen.writeUInt16LE(name.length, 28)
const cenOffset = loc.length + name.length + comp.length
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10)
eocd.writeUInt32LE(cen.length + name.length, 12); eocd.writeUInt32LE(cenOffset, 16)
fs.writeFileSync("test/fixtures/kml-viewer/tiny.kmz", Buffer.concat([loc, name, comp, cen, name, eocd]))
console.log("wrote", fs.statSync("test/fixtures/kml-viewer/tiny.kmz").size, "bytes")
'
```

Expected: `wrote <300 내외> bytes`

- [ ] **Step 2: 실패하는 시험 작성**

`frontend/src/features/kml-viewer/lib/kmzUnzip.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readKmlFromBuffer } from './kmzUnzip.js'

const KMZ = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/kml-viewer/tiny.kmz', import.meta.url)))
const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)

test('KMZ 안의 doc.kml을 꺼낸다', async () => {
  const text = await readKmlFromBuffer(toArrayBuffer(KMZ), 'tiny.kmz')
  assert.match(text, /<kml/)
  assert.match(text, /<name>tiny<\/name>/)
})

test('.kml 파일은 압축 해제 없이 그대로 읽는다', async () => {
  const raw = '<?xml version="1.0"?><kml><Document><name>직접</name></Document></kml>'
  const buf = new TextEncoder().encode(raw).buffer
  assert.equal(await readKmlFromBuffer(buf, 'plain.kml'), raw)
})

test('.kml은 UTF-8 BOM이 있어도 읽힌다', async () => {
  const raw = '<?xml version="1.0"?><kml/>'
  const bytes = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode(raw)])
  assert.equal(await readKmlFromBuffer(bytes.buffer, 'bom.kml'), raw)
})

test('zip이 아닌 바이트는 한국어 오류로 거부한다', async () => {
  const buf = new TextEncoder().encode('이건 zip이 아님').buffer
  await assert.rejects(() => readKmlFromBuffer(buf, 'bad.kmz'), /압축/)
})

test('kml 항목이 없는 zip은 한국어 오류로 거부한다', async () => {
  // 파일 이름만 doc.txt로 바꾼 zip — 이름 길이가 같아 오프셋이 그대로다.
  const bytes = new Uint8Array(KMZ)
  const patched = new TextEncoder().encode('doc.txt')
  bytes.set(patched, 30)
  await assert.rejects(() => readKmlFromBuffer(bytes.buffer, 'nokml.kmz'), /KML/)
})
```

- [ ] **Step 3: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/kml-viewer/lib/kmzUnzip.test.js
```
Expected: FAIL — 모듈이 없다.

- [ ] **Step 4: 구현**

`frontend/src/features/kml-viewer/lib/kmzUnzip.js`:

```js
// KMZ는 KML을 담은 zip이다. 라이브러리를 새로 들이지 않고 브라우저·Node 양쪽에
// 내장된 DecompressionStream으로 푼다. zip 전체를 다루지 않고 "항목 하나 꺼내기"만
// 한다 — KMZ는 doc.kml 하나가 본체이고 나머지는 아이콘이라 그걸로 충분하다.
const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50
const STORED = 0
const DEFLATED = 8

// 끝쪽의 EOCD(중앙 디렉터리 끝 표시)를 뒤에서부터 찾는다. zip 주석이 붙을 수 있어
// 위치가 고정이 아니다. 주석 최대 길이가 64KB라 그만큼만 거슬러 올라간다.
function findEocd(view, length) {
  const floor = Math.max(0, length - 22 - 65535)
  for (let i = length - 22; i >= floor; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) return i
  }
  return -1
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// BOM은 TextDecoder('utf-8')가 알아서 떼어낸다.
const decode = (bytes) => new TextDecoder('utf-8').decode(bytes)

export async function readKmlFromBuffer(arrayBuffer, fileName = '') {
  if (/\.kml$/i.test(fileName)) return decode(new Uint8Array(arrayBuffer))

  const bytes = new Uint8Array(arrayBuffer)
  const view = new DataView(arrayBuffer)
  const eocd = findEocd(view, bytes.length)
  if (eocd < 0) throw new Error('압축 파일을 열 수 없습니다. KMZ 또는 KML 파일인지 확인하세요.')

  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  let found = null
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== CEN_SIG) break
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLength = view.getUint16(p + 28, true)
    const extraLength = view.getUint16(p + 30, true)
    const commentLength = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decode(bytes.subarray(p + 46, p + 46 + nameLength))
    // doc.kml이 있으면 그것을, 없으면 처음 만난 .kml을 쓴다.
    if (/\.kml$/i.test(name) && (!found || /(^|\/)doc\.kml$/i.test(name))) {
      found = { name, method, compressedSize, localOffset }
      if (/(^|\/)doc\.kml$/i.test(name)) break
    }
    p += 46 + nameLength + extraLength + commentLength
  }
  if (!found) throw new Error('압축 파일 안에서 KML을 찾지 못했습니다.')

  // 지역 헤더는 이름·부가필드 길이가 중앙 디렉터리와 다를 수 있어 여기서 다시 읽는다.
  const lo = found.localOffset
  if (view.getUint32(lo, true) !== LOC_SIG) throw new Error('압축 파일이 손상되었습니다.')
  const dataStart = lo + 30 + view.getUint16(lo + 26, true) + view.getUint16(lo + 28, true)
  const data = bytes.subarray(dataStart, dataStart + found.compressedSize)

  if (found.method === STORED) return decode(data)
  if (found.method === DEFLATED) return decode(await inflateRaw(data))
  throw new Error(`지원하지 않는 압축 방식입니다 (${found.method}).`)
}
```

- [ ] **Step 5: 시험 통과 확인**

```bash
cd frontend && node --test src/features/kml-viewer/lib/kmzUnzip.test.js
```
Expected: PASS — 5개.

- [ ] **Step 6: 실제 파일로 확인**

맥케이 파일이 있으면 함께 확인한다(없으면 건너뛴다):

```bash
cd frontend && node --input-type=module -e '
import { readFileSync } from "node:fs"
import { readKmlFromBuffer } from "./src/features/kml-viewer/lib/kmzUnzip.js"
const b = readFileSync("/mnt/c/Users/Jond Doe/Downloads/맥케이 비행지도 ver.230729.kmz")
const t = Date.now()
const text = await readKmlFromBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "mckay.kmz")
console.log("압축 해제", Date.now() - t, "ms |", (text.length / 1048576).toFixed(1), "MB |", text.slice(0, 60))
'
```
Expected: 16MB 내외의 KML 텍스트와 소요 시간이 출력된다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/features/kml-viewer/lib/kmzUnzip.js frontend/src/features/kml-viewer/lib/kmzUnzip.test.js frontend/test/fixtures/kml-viewer/tiny.kmz
git commit -m "feat(kml-viewer): unzip KMZ with the browser's own decompression"
```

---

### Task 2: 폴더 트리 → 레이어 목록

**Files:**
- Create: `frontend/src/features/kml-viewer/lib/kmlFolderTree.js`
- Test: `frontend/src/features/kml-viewer/lib/kmlFolderTree.test.js`

**Interfaces:**
- Consumes: `kmlWithFolders(doc)` 결과 — `{ type: 'root'|'folder', meta?: { name }, children: Array<node|Feature> }`.
- Produces: `buildLayerList(tree)` → `Array<{ id: string, name: string, path: string[], depth: number, parentId: string|null, features: Feature[] }>`. 폴더 하나가 항목 하나이며 `features`는 **그 폴더가 직접 담은** Feature만 포함한다(하위 폴더 것은 각자의 항목에 들어간다). 순서는 파일에 나온 순서를 따른다. `id`는 `f0`, `f1`… 형태의 안정적인 일련번호다.

- [ ] **Step 1: 실패하는 시험 작성**

`frontend/src/features/kml-viewer/lib/kmlFolderTree.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLayerList } from './kmlFolderTree.js'

const feature = (name) => ({ type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates: [127, 37] } })

test('폴더 계층과 이름을 그대로 옮긴다', () => {
  const tree = {
    type: 'root',
    children: [
      { type: 'folder', meta: { name: 'RKTA' }, children: [
        feature('공항'),
        { type: 'folder', meta: { name: '출항절차' }, children: [feature('WP1'), feature('WP2')] },
      ] },
    ],
  }
  const list = buildLayerList(tree)
  assert.deepEqual(list.map((l) => l.name), ['RKTA', '출항절차'])
  assert.deepEqual(list.map((l) => l.depth), [0, 1])
  assert.deepEqual(list.map((l) => l.features.length), [1, 2])
  assert.equal(list[1].parentId, list[0].id)
  assert.deepEqual(list[1].path, ['RKTA', '출항절차'])
})

test('최상위에 바로 있는 도형은 (폴더 없음)으로 묶는다', () => {
  const list = buildLayerList({ type: 'root', children: [feature('혼자'), feature('둘')] })
  assert.equal(list.length, 1)
  assert.equal(list[0].name, '(폴더 없음)')
  assert.equal(list[0].depth, 0)
  assert.equal(list[0].parentId, null)
  assert.equal(list[0].features.length, 2)
})

test('이름 없는 폴더는 번호를 붙여 구분한다', () => {
  const tree = { type: 'root', children: [
    { type: 'folder', children: [feature('a')] },
    { type: 'folder', children: [feature('b')] },
  ] }
  assert.deepEqual(buildLayerList(tree).map((l) => l.name), ['(이름 없는 폴더 1)', '(이름 없는 폴더 2)'])
})

test('도형이 하나도 없는 폴더도 목록에 남긴다', () => {
  const tree = { type: 'root', children: [
    { type: 'folder', meta: { name: '빈 폴더' }, children: [] },
    { type: 'folder', meta: { name: '안쪽만' }, children: [
      { type: 'folder', meta: { name: '자식' }, children: [feature('a')] },
    ] },
  ] }
  const list = buildLayerList(tree)
  assert.deepEqual(list.map((l) => l.name), ['빈 폴더', '안쪽만', '자식'])
  assert.equal(list[0].features.length, 0)
})

test('id는 항목마다 다르다', () => {
  const tree = { type: 'root', children: [
    { type: 'folder', meta: { name: '같은이름' }, children: [feature('a')] },
    { type: 'folder', meta: { name: '같은이름' }, children: [feature('b')] },
  ] }
  const list = buildLayerList(tree)
  assert.notEqual(list[0].id, list[1].id)
})
```

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/kml-viewer/lib/kmlFolderTree.test.js
```
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현**

`frontend/src/features/kml-viewer/lib/kmlFolderTree.js`:

```js
// kmlWithFolders가 준 트리를 화면 패널이 쓰기 좋은 평평한 목록으로 바꾼다.
// 계층은 depth와 parentId로 남기고, 그리기는 폴더 단위로 한다 — 작성자가 나눠 놓은
// 단위가 곧 조종사가 켜고 끄고 싶어 하는 단위다.
const NO_FOLDER = '(폴더 없음)'

export function buildLayerList(tree) {
  const list = []
  let unnamed = 0
  let serial = 0

  const visit = (node, parentId, parentPath, depth) => {
    const name = node.meta?.name?.trim() || `(이름 없는 폴더 ${++unnamed})`
    const id = `f${serial++}`
    const path = [...parentPath, name]
    const features = (node.children ?? []).filter((c) => c.type === 'Feature')
    list.push({ id, name, path, depth, parentId, features })
    for (const child of node.children ?? []) {
      if (child.type === 'folder') visit(child, id, path, depth + 1)
    }
  }

  // 최상위에 폴더 없이 놓인 도형은 묶어줄 자리가 없으므로 가상 폴더 하나를 만든다.
  const loose = (tree.children ?? []).filter((c) => c.type === 'Feature')
  if (loose.length > 0) {
    list.push({ id: `f${serial++}`, name: NO_FOLDER, path: [NO_FOLDER], depth: 0, parentId: null, features: loose })
  }
  for (const child of tree.children ?? []) {
    if (child.type === 'folder') visit(child, null, [], 0)
  }
  return list
}

// 상위를 끄면 하위도 꺼진다. 화면에서 실제로 그릴 항목인지 판단한다.
export function isLayerVisible(list, id, hidden) {
  const byId = new Map(list.map((l) => [l.id, l]))
  let current = byId.get(id)
  while (current) {
    if (hidden.has(current.id)) return false
    current = current.parentId ? byId.get(current.parentId) : null
  }
  return true
}
```

`isLayerVisible`도 시험한다. 시험 파일 맨 위 import 줄을 `import { buildLayerList, isLayerVisible } from './kmlFolderTree.js'`로 바꾸고, 파일 끝에 추가:

```js
test('상위를 끄면 하위도 꺼진다', () => {
  const list = [
    { id: 'f0', parentId: null }, { id: 'f1', parentId: 'f0' }, { id: 'f2', parentId: 'f1' },
  ]
  assert.equal(isLayerVisible(list, 'f2', new Set(['f0'])), false)
  assert.equal(isLayerVisible(list, 'f2', new Set(['f1'])), false)
  assert.equal(isLayerVisible(list, 'f2', new Set()), true)
  assert.equal(isLayerVisible(list, 'f0', new Set(['f1'])), true)
})
```

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/kml-viewer/lib/kmlFolderTree.test.js
```
Expected: PASS — 6개.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/kml-viewer/lib/kmlFolderTree.js frontend/src/features/kml-viewer/lib/kmlFolderTree.test.js
git commit -m "feat(kml-viewer): turn the file's own folder tree into a layer list"
```

---

### Task 3: KML 스타일 → Mapbox 페인트

**Files:**
- Create: `frontend/src/features/kml-viewer/lib/kmlPaint.js`
- Test: `frontend/src/features/kml-viewer/lib/kmlPaint.test.js`

**Interfaces:**
- Consumes: `togeojson`이 feature 속성에 싣는 이름 — `stroke`, `stroke-width`, `stroke-opacity`, `fill`, `fill-opacity`, `icon-scale`, `icon-color`, `name`.
- Produces: `LINE_PAINT`, `FILL_PAINT`, `CIRCLE_PAINT`, `LABEL_LAYOUT`, `LABEL_PAINT` — Mapbox 표현식 객체 상수. `httpsIcon(url)` → `string|null`.

- [ ] **Step 1: 실패하는 시험 작성**

`frontend/src/features/kml-viewer/lib/kmlPaint.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { LINE_PAINT, FILL_PAINT, CIRCLE_PAINT, LABEL_LAYOUT, httpsIcon } from './kmlPaint.js'

// 스타일은 JS로 feature를 순회해 계산하지 않고 Mapbox 표현식이 속성을 직접 읽는다.
// feature 22만 개를 JS로 훑지 않아도 되고, 파일이 정한 값이 그대로 쓰인다.
test('선 색은 파일의 stroke를 읽고, 없을 때만 기본값', () => {
  assert.deepEqual(LINE_PAINT['line-color'], ['coalesce', ['get', 'stroke'], '#3388ff'])
})

test('선 굵기·투명도도 파일 값을 우선한다', () => {
  assert.deepEqual(LINE_PAINT['line-width'], ['coalesce', ['get', 'stroke-width'], 2])
  assert.deepEqual(LINE_PAINT['line-opacity'], ['coalesce', ['get', 'stroke-opacity'], 1])
})

test('면 색과 투명도도 마찬가지', () => {
  assert.deepEqual(FILL_PAINT['fill-color'], ['coalesce', ['get', 'fill'], '#3388ff'])
  assert.deepEqual(FILL_PAINT['fill-opacity'], ['coalesce', ['get', 'fill-opacity'], 0.3])
})

test('점은 아이콘을 못 쓸 때를 대비해 원으로도 그린다', () => {
  assert.deepEqual(CIRCLE_PAINT['circle-color'], ['coalesce', ['get', 'icon-color'], ['get', 'stroke'], '#3388ff'])
})

test('라벨은 name을 쓴다', () => {
  assert.deepEqual(LABEL_LAYOUT['text-field'], ['coalesce', ['get', 'name'], ''])
})

test('httpsIcon: http 주소를 https로 바꾼다', () => {
  assert.equal(httpsIcon('http://maps.google.com/mapfiles/kml/paddle/wht-circle.png'),
    'https://maps.google.com/mapfiles/kml/paddle/wht-circle.png')
})

test('httpsIcon: 이미 https면 그대로', () => {
  assert.equal(httpsIcon('https://example.com/a.png'), 'https://example.com/a.png')
})

test('httpsIcon: KMZ 내부 상대 경로는 쓸 수 없으므로 null', () => {
  assert.equal(httpsIcon('files/dme1.bmp'), null)
  assert.equal(httpsIcon(undefined), null)
})
```

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/kml-viewer/lib/kmlPaint.test.js
```
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현**

`frontend/src/features/kml-viewer/lib/kmlPaint.js`:

```js
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

// 아이콘을 못 불러오는 경우가 있어 점은 원으로도 그린다(스펙의 대체 표시).
export const CIRCLE_PAINT = {
  'circle-color': ['coalesce', ['get', 'icon-color'], ['get', 'stroke'], DEFAULT_COLOR],
  'circle-radius': ['coalesce', ['*', ['get', 'icon-scale'], 4], 4],
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 1,
}

export const LABEL_LAYOUT = {
  'text-field': ['coalesce', ['get', 'name'], ''],
  'text-size': 11,
  'text-offset': [0, 1.1],
  'text-anchor': 'top',
  'text-allow-overlap': false,
}

export const LABEL_PAINT = {
  'text-color': '#111827',
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
```

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/kml-viewer/lib/kmlPaint.test.js
```
Expected: PASS — 8개.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/kml-viewer/lib/kmlPaint.js frontend/src/features/kml-viewer/lib/kmlPaint.test.js
git commit -m "feat(kml-viewer): style features from the file's own KML properties"
```

---

### Task 4: 지도 배선

**Files:**
- Create: `frontend/src/features/kml-viewer/useKmlMap.js`

**Interfaces:**
- Consumes: `LINE_PAINT`, `FILL_PAINT`, `CIRCLE_PAINT`, `LABEL_LAYOUT`, `LABEL_PAINT` (Task 3), `isLayerVisible` (Task 2), `MAP_CONFIG`·`BASEMAP_OPTIONS` (`../map/mapConfig.js`).
- Produces: `useKmlMap(containerRef)` → `{ ready: boolean, error: string|null, setLayers(list), setHidden(set), setLabelsOn(bool), fitTo(list), addMs: number|null }`. `setLayers`는 레이어 목록 전체를 받아 지도 소스·레이어를 다시 구성하고 소요 시간을 `addMs`로 남긴다.

- [ ] **Step 1: 구현**

이 태스크는 지도 SDK에 직접 붙는 배선이라 단위 시험을 붙이지 않는다(Task 6의 브라우저 확인이 검증한다). 대신 순수 로직은 Task 2·3에 이미 분리해 두었다.

`frontend/src/features/kml-viewer/useKmlMap.js`:

```js
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { MAP_CONFIG, BASEMAP_OPTIONS } from '../map/mapConfig.js'
import { isLayerVisible } from './lib/kmlFolderTree.js'
import { LINE_PAINT, FILL_PAINT, CIRCLE_PAINT, LABEL_LAYOUT, LABEL_PAINT } from './lib/kmlPaint.js'

const SRC = (id) => `kml-${id}`
const LYR = (id, kind) => `kml-${id}-${kind}`
// slot: 'top'은 Mapbox Standard의 자체 레이어 위에 올리기 위한 관례다
// (custom-area/usePolygonDraw.js와 같음).
const SLOT = 'top'

export default function useKmlMap(containerRef) {
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [addMs, setAddMs] = useState(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const token = import.meta.env.VITE_MAPBOX_TOKEN
    if (!token) { setError('VITE_MAPBOX_TOKEN이 필요합니다.'); return undefined }
    mapboxgl.accessToken = token
    const basemap = BASEMAP_OPTIONS[0]
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: basemap.style,
      config: { basemap: basemap.config },
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      language: 'ko',
    })
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    map.on('load', () => setReady(true))
    map.on('error', (e) => setError(e?.error?.message ?? '지도 오류'))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [containerRef])

  const removeAll = () => {
    const map = mapRef.current
    if (!map) return
    for (const layer of layersRef.current) {
      for (const kind of ['fill', 'line', 'circle', 'label']) {
        const id = LYR(layer.id, kind)
        if (map.getLayer(id)) map.removeLayer(id)
      }
      if (map.getSource(SRC(layer.id))) map.removeSource(SRC(layer.id))
    }
    layersRef.current = []
  }

  const setLayers = (list) => {
    const map = mapRef.current
    if (!map) return
    const started = performance.now()
    removeAll()
    for (const layer of list) {
      if (layer.features.length === 0) continue
      map.addSource(SRC(layer.id), {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: layer.features },
      })
      // 면 → 선 → 점 → 라벨 순서로 얹어야 점이 면에 가리지 않는다.
      map.addLayer({ id: LYR(layer.id, 'fill'), type: 'fill', source: SRC(layer.id), slot: SLOT,
        filter: ['==', ['geometry-type'], 'Polygon'], paint: FILL_PAINT })
      map.addLayer({ id: LYR(layer.id, 'line'), type: 'line', source: SRC(layer.id), slot: SLOT,
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: LINE_PAINT })
      map.addLayer({ id: LYR(layer.id, 'circle'), type: 'circle', source: SRC(layer.id), slot: SLOT,
        filter: ['==', ['geometry-type'], 'Point'], paint: CIRCLE_PAINT })
      map.addLayer({ id: LYR(layer.id, 'label'), type: 'symbol', source: SRC(layer.id), slot: SLOT,
        layout: LABEL_LAYOUT, paint: LABEL_PAINT })
    }
    layersRef.current = list
    setAddMs(Math.round(performance.now() - started))
  }

  const setHidden = (hidden) => {
    const map = mapRef.current
    if (!map) return
    for (const layer of layersRef.current) {
      const visible = isLayerVisible(layersRef.current, layer.id, hidden)
      for (const kind of ['fill', 'line', 'circle', 'label']) {
        const id = LYR(layer.id, kind)
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
      }
    }
  }

  // 라벨은 도형보다 훨씬 무겁다(겹침 계산). 원인을 가르려면 따로 껐다 켤 수 있어야 한다.
  const setLabelsOn = (on) => {
    const map = mapRef.current
    if (!map) return
    for (const layer of layersRef.current) {
      const id = LYR(layer.id, 'label')
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    }
  }

  const fitTo = (list) => {
    const map = mapRef.current
    if (!map) return
    const bounds = new mapboxgl.LngLatBounds()
    let any = false
    const walk = (c) => { if (typeof c[0] === 'number') { bounds.extend([c[0], c[1]]); any = true } else c.forEach(walk) }
    const geom = (g) => { if (!g) return; if (g.type === 'GeometryCollection') g.geometries?.forEach(geom); else if (g.coordinates) walk(g.coordinates) }
    for (const layer of list) for (const f of layer.features) geom(f.geometry)
    if (any) map.fitBounds(bounds, { padding: 40, duration: 0 })
  }

  return { ready, error, setLayers, setHidden, setLabelsOn, fitTo, addMs }
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/kml-viewer/useKmlMap.js
git commit -m "feat(kml-viewer): wire folders to map sources one layer group each"
```

---

### Task 5: 페이지와 라우트

**Files:**
- Create: `frontend/src/features/kml-viewer/KmlViewerPage.jsx`
- Create: `frontend/src/features/kml-viewer/KmlViewerPage.css`
- Modify: `frontend/src/app/App.jsx` (lazy import 목록, `/test` 분기 옆)

**Interfaces:**
- Consumes: `readKmlFromBuffer` (Task 1), `buildLayerList` (Task 2), `useKmlMap` (Task 4), `kmlWithFolders` (`@tmcw/togeojson`).
- Produces: 없음 (종단).

- [ ] **Step 1: 페이지 작성**

`frontend/src/features/kml-viewer/KmlViewerPage.jsx`:

```jsx
import { useRef, useState } from 'react'
import { kmlWithFolders } from '@tmcw/togeojson'
import { readKmlFromBuffer } from './lib/kmzUnzip.js'
import { buildLayerList } from './lib/kmlFolderTree.js'
import { httpsIcon } from './lib/kmlPaint.js'
import useKmlMap from './useKmlMap.js'
import './KmlViewerPage.css'

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`

export default function KmlViewerPage() {
  const mapContainerRef = useRef(null)
  const { ready, error: mapError, setLayers, setHidden, setLabelsOn, fitTo, addMs } = useKmlMap(mapContainerRef)
  const [layers, setLayerList] = useState([])
  const [hidden, setHiddenSet] = useState(new Set())
  const [labelsOn, setLabels] = useState(true)
  const [stats, setStats] = useState(null)
  const [failure, setFailure] = useState(null)

  async function handleFile(file) {
    if (!file) return
    setFailure(null)
    setStats(null)
    let stage = '파일 읽기'
    try {
      const buffer = await file.arrayBuffer()
      stage = '압축 해제'
      const t0 = performance.now()
      const text = await readKmlFromBuffer(buffer, file.name)
      const t1 = performance.now()
      stage = 'XML 해석'
      const doc = new DOMParser().parseFromString(text, 'text/xml')
      const t2 = performance.now()
      stage = 'GeoJSON 변환'
      const tree = kmlWithFolders(doc)
      const t3 = performance.now()
      stage = '레이어 목록 만들기'
      const list = buildLayerList(tree)
      stage = '지도에 올리기'
      setLayerList(list)
      setHiddenSet(new Set())
      setLayers(list)
      fitTo(list)

      // 아이콘은 이 스파이크에서 그리지 않고(점은 원으로 표시) "쓸 수 있는가"만 잰다.
      // 스펙이 요구하는 것은 로딩 성공/실패 수이지 아이콘 렌더링이 아니다.
      stage = '아이콘 확인'
      const iconUrls = new Set()
      for (const l of list) for (const f of l.features) {
        const u = httpsIcon(f.properties?.icon)
        if (u) iconUrls.add(u)
      }
      const probes = await Promise.all([...iconUrls].slice(0, 40).map((u) =>
        fetch(u, { method: 'GET', mode: 'cors' }).then((r) => r.ok).catch(() => false)))
      const iconOk = probes.filter(Boolean).length

      let poly = 0, line = 0, point = 0, coords = 0
      const walk = (c) => { if (typeof c[0] === 'number') coords += 1; else c.forEach(walk) }
      const geom = (g) => {
        if (!g) return
        if (g.type === 'GeometryCollection') { g.geometries?.forEach(geom); return }
        if (g.type === 'Polygon') poly += 1
        else if (g.type === 'MultiPolygon') poly += g.coordinates.length
        else if (g.type === 'LineString') line += 1
        else if (g.type === 'MultiLineString') line += g.coordinates.length
        else if (g.type === 'Point') point += 1
        if (g.coordinates) walk(g.coordinates)
      }
      for (const l of list) for (const f of l.features) geom(f.geometry)

      setStats({
        fileSize: file.size,
        kmlSize: new Blob([text]).size,
        unzipMs: Math.round(t1 - t0),
        parseMs: Math.round(t2 - t1),
        convertMs: Math.round(t3 - t2),
        folders: list.length,
        features: list.reduce((n, l) => n + l.features.length, 0),
        poly, line, point, coords,
        iconTotal: iconUrls.size,
        iconOk,
        memoryMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      })
    } catch (err) {
      // 측정 도구가 빈 화면으로 죽으면 아무것도 배울 수 없다. 어느 단계에서
      // 무엇 때문에 실패했는지 남긴다.
      setFailure(`${stage} 단계에서 실패: ${err?.message ?? err}`)
    }
  }

  const toggle = (id) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id); else next.add(id)
    setHiddenSet(next)
    setHidden(next)
  }

  return (
    <div className="kv-root">
      <aside className="kv-panel">
        <h1 className="kv-title">KML 표출 시험</h1>
        <input type="file" accept=".kml,.kmz" onChange={(e) => handleFile(e.target.files?.[0])} />

        {failure && <p className="kv-failure">{failure}</p>}
        {mapError && <p className="kv-failure">지도: {mapError}</p>}
        {!ready && <p className="kv-note">지도 준비 중…</p>}

        {stats && (
          <dl className="kv-stats">
            <dt>원본 / KML</dt><dd>{mb(stats.fileSize)} → {mb(stats.kmlSize)}</dd>
            <dt>압축 해제</dt><dd>{stats.unzipMs} ms</dd>
            <dt>XML 해석</dt><dd>{stats.parseMs} ms</dd>
            <dt>GeoJSON 변환</dt><dd>{stats.convertMs} ms</dd>
            <dt>지도 등록</dt><dd>{addMs ?? '—'} ms</dd>
            <dt>폴더</dt><dd>{stats.folders.toLocaleString()}</dd>
            <dt>Feature</dt><dd>{stats.features.toLocaleString()}</dd>
            <dt>폴리곤 / 선 / 점</dt><dd>{stats.poly.toLocaleString()} / {stats.line.toLocaleString()} / {stats.point.toLocaleString()}</dd>
            <dt>좌표점</dt><dd>{stats.coords.toLocaleString()}</dd>
            <dt>아이콘 주소</dt><dd>{stats.iconOk} / {stats.iconTotal} 불러와짐</dd>
            <dt>메모리</dt><dd>{stats.memoryMb ? `${stats.memoryMb} MB` : '측정 불가'}</dd>
          </dl>
        )}

        {layers.length > 0 && (
          <label className="kv-labels">
            <input type="checkbox" checked={labelsOn} onChange={(e) => { setLabels(e.target.checked); setLabelsOn(e.target.checked) }} />
            {' 이름표 표시'}
          </label>
        )}

        <ul className="kv-tree">
          {layers.map((l) => (
            <li key={l.id} style={{ paddingLeft: `${l.depth * 14}px` }}>
              <label>
                <input type="checkbox" checked={!hidden.has(l.id)} onChange={() => toggle(l.id)} />
                {' '}{l.name}
                <span className="kv-count">{l.features.length > 0 ? ` (${l.features.length})` : ''}</span>
              </label>
            </li>
          ))}
        </ul>
      </aside>
      <div className="kv-map" ref={mapContainerRef} />
    </div>
  )
}
```

- [ ] **Step 2: CSS 작성**

`frontend/src/features/kml-viewer/KmlViewerPage.css`:

```css
.kv-root { display: grid; grid-template-columns: 340px 1fr; height: 100vh; }
.kv-panel { overflow-y: auto; padding: 12px; border-right: 1px solid #e5e7eb; font: 13px/1.5 system-ui, sans-serif; }
.kv-title { font-size: 15px; margin: 0 0 10px; }
.kv-map { height: 100vh; }
.kv-failure { color: #b91c1c; background: #fef2f2; padding: 8px; border-radius: 4px; white-space: pre-wrap; }
.kv-note { color: #6b7280; }
.kv-stats { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 12px 0; }
.kv-stats dt { color: #6b7280; }
.kv-stats dd { margin: 0; font-variant-numeric: tabular-nums; }
.kv-labels { display: block; margin: 10px 0; }
.kv-tree { list-style: none; margin: 0; padding: 0; }
.kv-tree li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kv-count { color: #9ca3af; }
```

- [ ] **Step 3: 라우트 추가**

`frontend/src/app/App.jsx`의 lazy import 목록에 `DesignTestPage` 옆으로 추가한다:

```js
const KmlViewerPage = lazy(() => import('../features/kml-viewer/KmlViewerPage.jsx'))
```

`/test` 분기 바로 아래에 추가한다:

```jsx
  if (window.location.pathname === '/kml' && import.meta.env.DEV) {
    // KML 표출 시험 페이지 — 개발 빌드에서만. 운영 빌드에선 이 코드가 제거되어 접근 불가.
    return <Suspense fallback={null}><KmlViewerPage /></Suspense>
  }
```

- [ ] **Step 4: 빌드와 전체 시험**

```bash
cd frontend && npm run build && npm test
```
Expected: 빌드 성공, 시험 전부 통과.

- [ ] **Step 5: 운영 빌드에서 접근이 막히는지 확인**

```bash
cd frontend && grep -c "import.meta.env.DEV" src/app/App.jsx && grep -o "pathname === '/kml'[^)]*)" src/app/App.jsx
```
Expected: `/kml` 분기에 `&& import.meta.env.DEV`가 붙어 있다.

주의: **번들 파일 자체는 남을 수 있다.** `lazy(() => import(...))`가 최상위에 있어 Vite가 청크를 만들어 두기 때문이다 — 기존 `DesignTestPage`도 운영 빌드 `dist/assets/`에 청크가 존재한다. 분기가 죽은 코드라 **경로로 접근할 수 없을 뿐**이며, 이 페이지에는 비밀이 없으므로 그것으로 충분하다. 청크가 없어야 한다고 기대하지 말 것.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/kml-viewer/KmlViewerPage.jsx frontend/src/features/kml-viewer/KmlViewerPage.css frontend/src/app/App.jsx
git commit -m "feat(kml-viewer): add the dev-only measurement page at /kml"
```

---

### Task 6: 실측과 기록

**Files:**
- Create: `docs/superpowers/status/2026-08-12-kml-viewer-spike-findings.md`
- Reference: [dev-server 절차](../../operations/dev-server-and-capture.md)

**Interfaces:**
- Consumes: Task 1-5 전부.
- Produces: 없음 (스파이크의 최종 산출물).

- [ ] **Step 1: 개발 서버 띄우기**

[dev-server 절차](../../operations/dev-server-and-capture.md)에 따라 띄우고 `/kml`을 연다.

- [ ] **Step 2: 맥케이 파일로 측정**

`맥케이 비행지도 ver.230729.kmz`를 올리고 화면의 측정값을 전부 기록한다. 파일이 없으면 사용자에게 요청한다.

- [ ] **Step 3: 상태 확인 세 가지**

1. **전부 켠 상태** — 확대·축소·이동이 매끄러운가, 끊기는가
2. **이름표만 끈 상태** — 눈에 띄게 빨라지는가 (라벨이 원인인지 가르는 목적)
3. **공역 폴더만 끈 상태** — 나머지가 읽을 만해지는가

각 상태의 화면을 갈무리한다.

- [ ] **Step 4: 아이콘 확인**

브라우저 개발자도구 네트워크 탭에서 `maps.google.com` 요청이 성공하는지 확인한다. 실패하면 차단 사유(혼합 콘텐츠 / CORS / 404)를 기록한다.

- [ ] **Step 5: 기록 작성**

`docs/superpowers/status/2026-08-12-kml-viewer-spike-findings.md`에 측정값, 화면 관찰, 아이콘 결과, 그리고 스펙의 판단 기준에 비춘 결론(본 기능 진행 / 설계 변경 / 재검토)을 적는다. 한 쪽을 넘기지 않는다.

- [ ] **Step 6: 커밋**

```bash
cd /home/john_doe/ProjectAMO && graphify update .
git add docs/superpowers/status/2026-08-12-kml-viewer-spike-findings.md
git commit -m "docs(kml-viewer): record what the spike measured"
```

---

## 완료 기준

- `cd frontend && npm test` 전부 통과 (신규 19개 포함)
- `cd frontend && npm run build` 성공, `dist/`에 `KmlViewerPage` 없음
- `/kml`에서 맥케이 파일이 열리고 폴더 트리·토글·측정값이 동작
- 측정 기록 문서가 스펙의 판단 기준에 대해 결론을 냄
